"""Strategy model (K-Means, hierarchical or Gaussian mixture): fit on Dataset 2, then label any move history.

Typical use in TrustLab:

    from trustlab_unsupervised.model import StrategyModel
    model = StrategyModel.load("models/strategy_model.joblib")
    model.predict_strategy("CC,CC,CD,DD,DC,CC")   # each item = <my move><opponent move>
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import AgglomerativeClustering, KMeans
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler

from .features import (
    CLUSTER_FEATURES,
    DEFAULT_SMOOTHING,
    STATES,
    build_player_features,
    history_features,
    load_rounds,
    parse_history,
    population_priors,
)

# Classic memory-one strategies as P(C | CC, CD, DC, DD), used to describe cluster centroids.
REFERENCE_STRATEGIES = {
    "Always Defect (ALLD)": (0, 0, 0, 0),
    "Always Cooperate (ALLC)": (1, 1, 1, 1),
    "Tit-for-Tat (TFT)": (1, 0, 1, 0),
    "Win-Stay Lose-Shift (WSLS)": (1, 0, 0, 1),
    "Grim Trigger": (1, 0, 0, 0),
    "Random": (0.5, 0.5, 0.5, 0.5),
}

STRATEGY_INFO = {
    "Defector": "Mostly defects and rarely returns to cooperation, even when the opponent cooperates. "
    "Closest to Always-Defect / Grim Trigger.",
    "Erratic": "Inconsistent play: often breaks off mutual cooperation and switches moves frequently, "
    "with little dependence on what the opponent did.",
    "Reciprocator": "Mirrors the opponent: cooperates after the opponent cooperated and defects after the "
    "opponent defected. Closest to Tit-for-Tat.",
    "Forgiving Cooperator": "Cooperates most of the time and keeps cooperating even after being betrayed. "
    "Closest to Always-Cooperate.",
}

MIN_RELIABLE_ROUNDS = 10


def name_clusters(profiles: pd.DataFrame) -> dict[int, str]:
    """Assign human-readable names to K-Means clusters from their mean profiles (k=4).

    Rule (data-driven, independent of K-Means label order):
      lowest coop_rate -> Defector, highest coop_rate -> Forgiving Cooperator,
      of the remaining two, higher P(C|CC) -> Reciprocator, the other -> Erratic.
    For k != 4 clusters are named generically.
    """
    if len(profiles) != 4:
        return {int(c): f"Group {i + 1}" for i, c in enumerate(profiles.sort_values("coop_rate").index)}
    order = profiles.sort_values("coop_rate").index.tolist()
    names = {order[0]: "Defector", order[-1]: "Forgiving Cooperator"}
    mid = profiles.loc[order[1:3]].sort_values("p_c_after_CC")
    names[mid.index[0]] = "Erratic"
    names[mid.index[1]] = "Reciprocator"
    return {int(k): v for k, v in names.items()}


def nearest_reference(profile: dict | pd.Series) -> tuple[str, float]:
    """Closest classic strategy to a P(C|state) profile (Euclidean distance in probability space)."""
    v = np.array([profile[f"p_c_after_{s}"] for s in STATES], dtype=float)
    dists = {n: float(np.linalg.norm(v - np.array(r))) for n, r in REFERENCE_STRATEGIES.items()}
    best = min(dists, key=dists.get)
    return best, dists[best]


def classic_strategy_match(feats: dict, tol: float = 0.05) -> tuple[list[str], float]:
    """Classic strategies consistent with ONE observed history.

    Uses only the states the player actually visited (raw rates, weighted by visit count), so
    population priors for unvisited states cannot drive the answer. Returns every strategy within
    `tol` of the best distance (e.g. a player who only ever saw mutual cooperation is consistent
    with ALLC, TFT, WSLS and Grim alike), ordered as in REFERENCE_STRATEGIES, plus the best distance.
    """
    n = np.array([feats[f"n_{s}"] for s in STATES], dtype=float)
    if n.sum() == 0:
        return [], float("nan")
    p = np.array([feats[f"raw_p_c_after_{s}"] if n[i] else 0.0 for i, s in enumerate(STATES)])
    w = n / n.sum()
    dists = {name: float(np.sqrt((w * (p - np.array(r)) ** 2).sum()))
             for name, r in REFERENCE_STRATEGIES.items()}
    best = min(dists.values())
    return [k for k, d in dists.items() if d <= best + tol], best


ALGORITHMS = ("kmeans", "agglomerative", "gmm")


def fit_clusterer(Z: np.ndarray, algorithm: str = "kmeans", k: int = 4, random_state: int = 0,
                  linkage: str = "ward", covariance_type: str = "full"):
    """Fit one clustering algorithm on standardised features Z.

    Returns (fitted_object_or_None, training_labels, centers_in_Z_space).
      kmeans        : KMeans(n_init=50)
      agglomerative : AgglomerativeClustering(linkage); has no predict(), so new players are
                      assigned to the nearest cluster centroid (centroid = mean of its members)
      gmm           : GaussianMixture(covariance_type, n_init=10); soft, probabilistic clusters
    """
    if algorithm == "kmeans":
        est = KMeans(n_clusters=k, n_init=50, random_state=random_state).fit(Z)
        labels = est.labels_
        return est, labels, est.cluster_centers_
    if algorithm == "agglomerative":
        labels = AgglomerativeClustering(n_clusters=k, linkage=linkage).fit_predict(Z)
        centers = np.vstack([Z[labels == c].mean(0) for c in range(k)])
        return None, labels, centers
    if algorithm == "gmm":
        est = GaussianMixture(n_components=k, covariance_type=covariance_type, n_init=10,
                              random_state=random_state).fit(Z)
        return est, est.predict(Z), est.means_
    raise ValueError(f"algorithm must be one of {ALGORITHMS}")


@dataclass
class StrategyModel:
    scaler: StandardScaler
    clusterer: object  # fitted KMeans / GaussianMixture, or None for agglomerative
    centers: np.ndarray  # cluster centres in standardised space
    priors: dict
    smoothing: float
    cluster_names: dict[int, str]
    profiles: pd.DataFrame  # mean CLUSTER_FEATURES per cluster (original scale)
    algorithm: str = "kmeans"
    params: dict = field(default_factory=dict)
    features: list[str] = field(default_factory=lambda: list(CLUSTER_FEATURES))

    # ------------------------------------------------------------------ training
    @classmethod
    def fit(
        cls,
        player_features: pd.DataFrame,
        priors: dict,
        k: int = 4,
        smoothing: float = DEFAULT_SMOOTHING,
        random_state: int = 0,
        algorithm: str = "kmeans",
        **params,
    ) -> "StrategyModel":
        X = player_features[CLUSTER_FEATURES].to_numpy()
        scaler = StandardScaler().fit(X)
        Z = scaler.transform(X)
        est, labels, centers = fit_clusterer(Z, algorithm, k, random_state, **params)
        model = cls(scaler, est, centers, priors, smoothing, {}, pd.DataFrame(), algorithm, dict(params))
        # Profiles/names come from the model's own assignment rule, so training labels and
        # predict_strategy() always agree (matters for agglomerative, which predicts by centroid).
        assigned = model._predict_z(Z)
        model.profiles = player_features[CLUSTER_FEATURES].groupby(assigned).mean()
        model.cluster_names = name_clusters(model.profiles)
        return model

    @classmethod
    def fit_from_data(cls, data_dir: str | Path, k: int = 4, smoothing: float = DEFAULT_SMOOTHING,
                      random_state: int = 0, algorithm: str = "kmeans",
                      **params) -> tuple["StrategyModel", pd.DataFrame]:
        rounds = load_rounds(data_dir)
        priors = population_priors(rounds)
        feats = build_player_features(rounds, priors, smoothing)
        model = cls.fit(feats, priors, k, smoothing, random_state, algorithm, **params)
        feats = feats.assign(cluster=model.predict_features(feats))
        feats["strategy"] = feats["cluster"].map(model.cluster_names)
        return model, feats

    # ------------------------------------------------------------------ inference
    def _predict_z(self, Z: np.ndarray) -> np.ndarray:
        if self.algorithm == "gmm":
            return self.clusterer.predict(Z)
        d2 = ((Z[:, None, :] - self.centers[None, :, :]) ** 2).sum(-1)
        return d2.argmin(1)

    def _soft_membership(self, Z: np.ndarray) -> np.ndarray:
        """Membership score per cluster.

        GMM: the model's posterior probabilities. K-Means / agglomerative: relative closeness to
        each centroid, exp(-d^2/2) normalised (a convenience score, not a calibrated probability).
        """
        if self.algorithm == "gmm":
            return self.clusterer.predict_proba(Z)
        d2 = ((Z[:, None, :] - self.centers[None, :, :]) ** 2).sum(-1)
        w = np.exp(-0.5 * (d2 - d2.min(1, keepdims=True)))
        return w / w.sum(1, keepdims=True)

    def predict_features(self, feats: pd.DataFrame) -> np.ndarray:
        return self._predict_z(self.scaler.transform(feats[self.features].to_numpy()))

    def membership_from_history(self, own, opp) -> dict[str, float]:
        """Membership score per strategy name for one move history (own/opp lists of 'C'/'D')."""
        f = history_features(own, opp, self.priors, self.smoothing)
        z = self.scaler.transform(np.array([[f[c] for c in self.features]]))
        return {self.cluster_names[i]: float(p) for i, p in enumerate(self._soft_membership(z)[0])}

    def predict_strategy(self, history) -> dict:
        """Label one move history. `history` = "CC,CD,..." or list of (my, opponent) moves.

        Returns a JSON-serialisable dict for the TrustLab front-end.
        """
        own, opp = parse_history(history)
        f = history_features(own, opp, self.priors, self.smoothing)
        z = self.scaler.transform(np.array([[f[c] for c in self.features]]))
        cluster = int(self._predict_z(z)[0])
        member = self._soft_membership(z)[0]
        refs, ref_dist = classic_strategy_match(f)
        name = self.cluster_names[cluster]
        out = {
            "cluster": cluster,
            "strategy": name,
            "description": STRATEGY_INFO.get(name, ""),
            "membership": {self.cluster_names[i]: round(float(p), 3) for i, p in enumerate(member)},
            "nearest_classic_strategy": refs[0] if refs else None,
            "consistent_classic_strategies": refs,
            "nearest_classic_distance": None if np.isnan(ref_dist) else round(ref_dist, 3),
            "n_rounds": len(own),
            "features": {k: (None if pd.isna(v) else int(v) if k.startswith("n_") or k == "first_move_c"
                             else round(float(v), 3))
                         for k, v in f.items() if not k.startswith("raw_")},
            "reliable": len(own) >= MIN_RELIABLE_ROUNDS,
        }
        if not out["reliable"]:
            out["warning"] = (f"Only {len(own)} rounds: the label leans on population averages. "
                              f"Use at least {MIN_RELIABLE_ROUNDS} rounds for a stable label.")
        return out

    # ------------------------------------------------------------------ persistence
    def save(self, path: str | Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, path)
        meta = {
            "algorithm": self.algorithm,
            "params": self.params,
            "k": int(len(self.centers)),
            "features": self.features,
            "smoothing": self.smoothing,
            "priors": self.priors,
            "cluster_names": {str(k): v for k, v in self.cluster_names.items()},
            "strategy_info": STRATEGY_INFO,
            "profiles": {self.cluster_names[int(i)]: {c: round(float(v), 4) for c, v in row.items()}
                         for i, row in self.profiles.iterrows()},
            "centroids_scaled": np.asarray(self.centers).round(6).tolist(),
            "scaler_mean": self.scaler.mean_.round(6).tolist(),
            "scaler_scale": self.scaler.scale_.round(6).tolist(),
        }
        path.with_suffix(".json").write_text(json.dumps(meta, indent=2))

    @staticmethod
    def load(path: str | Path) -> "StrategyModel":
        return joblib.load(path)
