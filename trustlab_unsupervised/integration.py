"""Glue between the unsupervised strategy model and the supervised next-move classifier.

The supervised notebook predicts a player's move in round t from
    round, treatment ("fix"/"rand"), prev_player, prev_opp ("C"/"D", "ND" in round 1).
This module adds history features for round t, computed ONLY from rounds 1..t-1:
    hist_coop_rate   share of C moves so far
    hist_coop_last5  share of C moves in the last 5 rounds
    m_<strategy>     K-Means strategy membership scores of the history so far

Leakage rules (both handled here):
  1. Features for round t never look at round t or later.
  2. When evaluating, the strategy model must be fitted on TRAINING sessions only
     (use `fit_strategy_model_on_sessions`), never on the test players.

Typical use in the supervised notebook:

    from trustlab_unsupervised.integration import (fit_strategy_model_on_sessions,
                                                   round_history_features, HISTORY_FEATURES)
    sm = fit_strategy_model_on_sessions("data", train_sessions)
    hist = round_history_features("data", sm)              # one row per (player, round)
    df = df.merge(hist, on=["player", "round"], how="left")
    numeric_features = ["round"] + HISTORY_FEATURES        # or + membership_columns(sm)
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Iterable

import numpy as np
import pandas as pd

from .features import build_player_features, load_rounds, parse_history, population_priors
from .model import StrategyModel

RATE_FEATURES = ["hist_coop_rate", "hist_coop_last5"]
NEUTRAL_RATE = 0.5  # value used in round 1, when there is no history yet


def _col(name: str) -> str:
    return "m_" + re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def membership_columns(model: StrategyModel) -> list[str]:
    """Membership column names in a fixed order (sorted by strategy name)."""
    return [_col(n) for n in sorted(model.cluster_names.values())]


# Convenience: the column list for the default 4-strategy model.
HISTORY_FEATURES = RATE_FEATURES + [_col(n) for n in
                                    sorted(["Defector", "Erratic", "Forgiving Cooperator", "Reciprocator"])]


def fit_strategy_model_on_sessions(data_dir: str | Path, sessions: Iterable[str], k: int = 4,
                                   smoothing: float = 2.0, random_state: int = 0) -> StrategyModel:
    """Fit the strategy model on the given sessions only (e.g. the supervised training sessions)."""
    rounds = load_rounds(data_dir)
    rounds = rounds[rounds["session"].isin(set(sessions))]
    if rounds.empty:
        raise ValueError("none of the given sessions were found in the data")
    priors = population_priors(rounds)
    feats = build_player_features(rounds, priors, smoothing)
    return StrategyModel.fit(feats, priors, k, smoothing, random_state)


def _history_row(own: list[str], model: StrategyModel, opp: list[str]) -> dict:
    """History features for the NEXT round, given everything played so far."""
    cols = {_col(n): n for n in model.cluster_names.values()}
    if not own:
        uniform = 1.0 / len(cols)
        return {"hist_coop_rate": NEUTRAL_RATE, "hist_coop_last5": NEUTRAL_RATE,
                **{c: uniform for c in sorted(cols)}}
    c = np.array([m == "C" for m in own], dtype=float)
    mem = model.membership_from_history(own, opp)
    return {"hist_coop_rate": c.mean(), "hist_coop_last5": c[-5:].mean(),
            **{col: mem[name] for col, name in sorted(cols.items())}}


def round_history_features(data_dir: str | Path, model: StrategyModel) -> pd.DataFrame:
    """One row per (player, round) with history features built from rounds before that round.

    Merge into the supervised table on ["player", "round"].
    """
    rounds = load_rounds(data_dir)
    rows = []
    for player, g in rounds.groupby("player", sort=False):
        g = g.sort_values("round")
        own, opp = g["own"].tolist(), g["opp"].tolist()
        for t, rnd in enumerate(g["round"].tolist()):
            rows.append({"player": player, "round": rnd, **_history_row(own[:t], model, opp[:t])})
    return pd.DataFrame(rows)


def interaction_columns(model: StrategyModel) -> list[str]:
    """Names of the strategy x previous-move interaction columns."""
    return [f"{m}_x_{s}" for m in membership_columns(model) for s in ("own_d", "opp_d")]


def add_strategy_interactions(frame: pd.DataFrame, model: StrategyModel) -> pd.DataFrame:
    """Add strategy-membership x previous-move columns (needs prev_player, prev_opp and m_* columns).

    They let a linear model learn that strategies REACT differently to the last round, e.g. a
    Reciprocator defects after being betrayed while a Forgiving Cooperator keeps cooperating.
    """
    out = frame.copy()
    own_d = (out["prev_player"] == "D").astype(float)
    opp_d = (out["prev_opp"] == "D").astype(float)
    for m in membership_columns(model):
        out[f"{m}_x_own_d"] = out[m] * own_d
        out[f"{m}_x_opp_d"] = out[m] * opp_d
    return out


def next_move_features(history, treatment: str, model: StrategyModel) -> pd.DataFrame:
    """One-row DataFrame, in the supervised notebook's column format, to predict the NEXT move.

    history   : moves played so far, "CC,CD,..." (own move first) or list of pairs; may be empty.
    treatment : "fix" (same partner) or "rand" (changing partner).
    """
    if treatment not in ("fix", "rand"):
        raise ValueError("treatment must be 'fix' or 'rand'")
    own, opp = parse_history(history) if history else ([], [])
    row = {
        "round": len(own) + 1,
        "treatment": treatment,
        "prev_player": own[-1] if own else "ND",
        "prev_opp": opp[-1] if opp else "ND",
        **_history_row(own, model, opp),
    }
    return add_strategy_interactions(pd.DataFrame([row]), model)
