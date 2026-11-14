"""Data loading and per-player feature engineering for the TrustLab unsupervised part.

Dataset 2 (Dryad doi:10.5061/dryad.37pvmcvmk): iterated Prisoner's Dilemma, 188 players x 100 rounds.
  * fix.csv  -> FP treatment (fixed partner for all 100 rounds)
  * rand.csv -> SP treatment (new random partner every round)
Payoffs: R=3 (C,C), T=4 (D,C), S=0 (C,D), P=1 (D,D).

State naming used everywhere in this package is "<my previous move><opponent's previous move>":
  CC = both cooperated, CD = I cooperated / they defected (I was betrayed),
  DC = I defected / they cooperated (I exploited), DD = both defected.
This matches the `prev` column of the raw data (format player/opponent).
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
import pandas as pd

STATES = ("CC", "CD", "DC", "DD")

# Features fed to the clustering model (a player's "strategy fingerprint").
CLUSTER_FEATURES = [
    "coop_rate",
    "p_c_after_CC",
    "p_c_after_CD",
    "p_c_after_DC",
    "p_c_after_DD",
]

# Extra descriptive features: used to interpret clusters, not to form them.
DESCRIPTIVE_FEATURES = [
    "first_move_c",
    "coop_first_half",
    "coop_second_half",
    "coop_trend",
    "switch_rate",
    "p_c_to_d",
    "p_d_to_c",
    "retaliation",
    "forgiveness",
    "mean_payoff",
]

PAYOFF = {("C", "C"): 3, ("C", "D"): 0, ("D", "C"): 4, ("D", "D"): 1}

# Pseudo-count used to shrink conditional probabilities towards the population rate.
# A player who visited a state only once or twice should not get a hard 0 or 1.
DEFAULT_SMOOTHING = 2.0


# --------------------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------------------
def load_rounds(data_dir: str | Path) -> pd.DataFrame:
    """Load fix.csv + rand.csv into one tidy round-level table.

    Columns: player, session, user_id, treatment ("FP"/"SP"), round, opponent,
    own, opp ("C"/"D"), own_c, opp_c (0/1), payoff, prev_own, prev_opp, prev_state.
    The previous-round state is recomputed from the sorted rows (and checked against
    the raw `prev` column) so it never depends on the raw text encoding.
    """
    data_dir = Path(data_dir)
    frames = []
    for fname, treatment in (("fix.csv", "FP"), ("rand.csv", "SP")):
        raw = pd.read_csv(data_dir / fname, sep=";")
        frames.append(
            pd.DataFrame(
                {
                    "player": raw["player"],
                    "session": raw["session"],
                    "treatment": treatment,
                    "round": raw["round"].astype(int),
                    "opponent": raw["opponent"],
                    "own": raw["action_player"].str.strip().str.upper(),
                    "opp": raw["action_opponent"].str.strip().str.upper(),
                    "payoff": raw["payoff"].astype(int),
                    "raw_prev": raw["prev"],
                }
            )
        )
    df = pd.concat(frames, ignore_index=True)
    df["user_id"] = [p[len(s):] for p, s in zip(df["player"], df["session"])]
    df = df.sort_values(["player", "round"]).reset_index(drop=True)

    df["own_c"] = (df["own"] == "C").astype(int)
    df["opp_c"] = (df["opp"] == "C").astype(int)
    g = df.groupby("player", sort=False)
    df["prev_own"] = g["own"].shift(1)
    df["prev_opp"] = g["opp"].shift(1)
    df["prev_state"] = (df["prev_own"] + df["prev_opp"]).where(df["prev_own"].notna())

    # Sanity checks against the raw file.
    has_prev = df["prev_state"].notna()
    mismatch = (df.loc[has_prev, "prev_state"] != df.loc[has_prev, "raw_prev"]).sum()
    if mismatch:
        raise ValueError(f"{mismatch} rows disagree with the raw `prev` column")
    bad_payoff = (df["payoff"] != [PAYOFF[(a, b)] for a, b in zip(df["own"], df["opp"])]).sum()
    if bad_payoff:
        raise ValueError(f"{bad_payoff} rows have payoffs inconsistent with R=3,T=4,S=0,P=1")
    return df.drop(columns="raw_prev")


def load_survey(data_dir: str | Path) -> pd.DataFrame:
    """Load UserInformation.csv with short column names and a `player` key that joins to rounds."""
    raw = pd.read_csv(Path(data_dir) / "UserInformation.csv", sep=";")
    out = pd.DataFrame(
        {
            "player": raw["Experiment Session"] + raw["UserID"],
            "age": pd.to_numeric(raw["Age"], errors="coerce"),
            "gender": raw["Gender"].str.strip().str.lower(),
            "influenced_by_opponent": raw.iloc[:, 3].str.strip().str.lower().eq("yes"),
            "influenced_by_self": raw.iloc[:, 4].str.strip().str.lower().eq("yes"),
            "survey_treatment": raw["Treatment"].str.strip(),
        }
    )
    # Ages of 0 (or implausible values) are data-entry errors -> missing.
    out.loc[(out["age"] < 16) | (out["age"] > 90), "age"] = np.nan
    return out


# --------------------------------------------------------------------------------------
# Feature engineering
# --------------------------------------------------------------------------------------
def population_priors(rounds: pd.DataFrame) -> dict:
    """Population-level P(C | previous state) used as the shrinkage prior."""
    with_prev = rounds[rounds["prev_state"].notna()]
    rates = with_prev.groupby("prev_state")["own_c"].mean()
    return {s: float(rates.get(s, 0.5)) for s in STATES}


def history_features(
    own: Sequence[str],
    opp: Sequence[str],
    priors: dict,
    smoothing: float = DEFAULT_SMOOTHING,
) -> dict:
    """Compute the feature vector for ONE player's move history.

    `own[i]` / `opp[i]` are "C" or "D" for round i (in order). Works for any length >= 1,
    so the same code serves both the 188 experiment players and live TrustLab users.
    """
    own = np.array([m.upper() for m in own])
    opp = np.array([m.upper() for m in opp])
    if len(own) == 0 or len(own) != len(opp):
        raise ValueError("own and opp must be non-empty and of equal length")
    if not set(own).union(opp) <= {"C", "D"}:
        raise ValueError("moves must be 'C' or 'D'")

    n = len(own)
    own_c = (own == "C").astype(float)
    feats: dict = {"n_rounds": n, "coop_rate": own_c.mean(), "first_move_c": own_c[0]}

    # Conditional cooperation P(C | previous state), shrunk towards the population prior.
    prev_state = np.char.add(own[:-1], opp[:-1])
    nxt = own_c[1:]
    for s in STATES:
        mask = prev_state == s
        k, m = nxt[mask].sum(), mask.sum()
        feats[f"n_{s}"] = int(m)
        feats[f"p_c_after_{s}"] = (k + smoothing * priors[s]) / (m + smoothing)
        feats[f"raw_p_c_after_{s}"] = k / m if m else np.nan

    half = max(n // 2, 1)
    feats["coop_first_half"] = own_c[:half].mean()
    feats["coop_second_half"] = own_c[half:].mean() if n > 1 else own_c.mean()
    feats["coop_trend"] = feats["coop_second_half"] - feats["coop_first_half"]

    if n > 1:
        prev, cur = own_c[:-1], own_c[1:]
        feats["switch_rate"] = float((prev != cur).mean())
        feats["p_c_to_d"] = float(((prev == 1) & (cur == 0)).sum() / max((prev == 1).sum(), 1))
        feats["p_d_to_c"] = float(((prev == 0) & (cur == 1)).sum() / max((prev == 0).sum(), 1))
        opp_d_prev = opp[:-1] == "D"
        # Retaliation: defect right after the opponent defected.
        feats["retaliation"] = float((cur[opp_d_prev] == 0).mean()) if opp_d_prev.any() else np.nan
        # Forgiveness: cooperate right after the opponent defected.
        feats["forgiveness"] = float((cur[opp_d_prev] == 1).mean()) if opp_d_prev.any() else np.nan
    else:
        for k in ("switch_rate", "p_c_to_d", "p_d_to_c", "retaliation", "forgiveness"):
            feats[k] = np.nan

    feats["mean_payoff"] = float(np.mean([PAYOFF[(a, b)] for a, b in zip(own, opp)]))
    return feats


def build_player_features(
    rounds: pd.DataFrame,
    priors: dict | None = None,
    smoothing: float = DEFAULT_SMOOTHING,
) -> pd.DataFrame:
    """One row per player with clustering + descriptive features."""
    priors = priors or population_priors(rounds)
    rows = []
    for player, g in rounds.groupby("player", sort=True):
        g = g.sort_values("round")
        f = history_features(g["own"].tolist(), g["opp"].tolist(), priors, smoothing)
        f.update(player=player, treatment=g["treatment"].iat[0], session=g["session"].iat[0])
        rows.append(f)
    df = pd.DataFrame(rows).set_index("player")
    front = ["treatment", "session", "n_rounds"]
    return df[front + [c for c in df.columns if c not in front]]


def parse_history(history: str | Iterable) -> tuple[list[str], list[str]]:
    """Accept a history as "CC,CD,DD", ["CC","CD"], or [("C","C"), ("C","D")].

    Each item is <my move><opponent move> for one round.
    """
    if isinstance(history, str):
        items = [h for h in history.replace(" ", ",").split(",") if h]
    else:
        items = list(history)
    own, opp = [], []
    for item in items:
        if len(item) != 2:
            raise ValueError(f"each round must be 2 moves (mine, opponent's), got {item!r}")
        a, b = item[0], item[1]
        own.append(str(a).upper())
        opp.append(str(b).upper())
    return own, opp
