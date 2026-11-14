"""Train and save the strategy model.

    python -m trustlab_unsupervised.train --data data --out models
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path

os.environ.setdefault("LOKY_MAX_CPU_COUNT", "4")  # silences a harmless joblib core-count warning on Windows

from .model import StrategyModel  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--data", default="data")
    ap.add_argument("--out", default="models")
    ap.add_argument("--k", type=int, default=4)
    ap.add_argument("--smoothing", type=float, default=2.0)
    args = ap.parse_args()

    model, feats = StrategyModel.fit_from_data(args.data, k=args.k, smoothing=args.smoothing)
    out = Path(args.out)
    model.save(out / "strategy_model.joblib")
    feats.to_csv(out / "player_strategies.csv")
    print(feats.groupby(["strategy", "treatment"]).size().unstack(fill_value=0))
    print(f"Saved model to {out / 'strategy_model.joblib'} (+ .json) and labels to {out / 'player_strategies.csv'}")


if __name__ == "__main__":
    main()
