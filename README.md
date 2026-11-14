# TrustLab — The Trust Game

**Predicting human cooperation and understanding behavioral strategies** in the iterated Prisoner's Dilemma.
Data: Dataset 2, 188 players × 100 rounds, fixed partner (FP) vs. changing partner (SP) (Dryad doi:10.5061/dryad.37pvmcvmk).

## Start here
| If you want to… | Open |
|---|---|
| See the team status, key results and what still needs changing | `docs/PROJECT_NOTES.md` |
| Read the analyses without installing anything (open in a browser) | `reports/*.html` |
| Run or edit the analyses | `notebooks/*.ipynb` |
| Use the models in the TrustLab app | the "Use in TrustLab" section below |
| See the original project plan | `docs/TrustGame_plan.pdf` |

## Package contents
| Path | What it is |
|---|---|
| `docs/PROJECT_NOTES.md` | Status, key results, review notes for the supervised notebook, suggested plan updates, limitations |
| `docs/TrustGame_plan.pdf` | Original project plan |
| `reports/unsupervised_strategies.html` | Unsupervised analysis (HTML export) |
| `reports/supervised_integration.html` | Baseline check + integrated supervised model (HTML export) |
| `reports/ML_TrustGameProject_supervised.html` | Teammate's EDA + supervised notebook (HTML export) |
| `notebooks/unsupervised_strategies.ipynb` | Unsupervised analysis (executed, course style, same preprocessing as the supervised notebook): features → scaling → K-Means (elbow, silhouette) → Hierarchical, GMM, DBSCAN → **model comparison** → PCA/t-SNE → interpretation → decision analysis → insights |
| `notebooks/supervised_integration.ipynb` | Teammate's Logistic Regression setup + baseline check + strategy features → final next-move model |
| `notebooks/supervised_teammate/ML_TrustGameProject.ipynb` | Teammate's EDA + supervised notebook (original, unchanged; written for Colab with `/content/` paths) |
| `trustlab_unsupervised/` | Python package: `features.py` (loading + features), `model.py` (`StrategyModel`), `integration.py` (features for the supervised model and the app), `train.py` (CLI) |
| `models/strategy_model.joblib` (+ `.json`) | Final K-Means strategy model (JSON = human-readable centroids, priors, names) |
| `models/next_move_lr.joblib` | Final next-move Logistic Regression (trained on all 12 sessions) |
| `models/player_strategies.csv` | Features + strategy label for each of the 188 players |
| `figures/*.png` | All charts (for slides and the report) |
| `data/` | Dataset 2: `fix.csv` (FP), `rand.csv` (SP), `UserInformation.csv` (survey), `README.txt`, experiment instructions |
| `requirements.txt` | Library versions used |

## Main results
**Four strategies (K-Means, k = 4):** Defector 39% · Forgiving Cooperator 29% · Erratic 16% · Reciprocator (Tit-for-Tat-like) 15%. Players with a fixed partner are mostly Forgiving Cooperators (40%); with changing partners, mostly Defectors (52%).

**Model selection.** K-Means was compared with Hierarchical clustering (Ward, the best of 4 linkages) and a Gaussian Mixture (full covariance, chosen by BIC), all at k = 4. K-Means had the best separation (silhouette 0.32 vs 0.26 / 0.16), bootstrap stability (ARI 0.79 vs 0.57 / 0.50) and external validity, and all three were equally useful for the supervised model (CV ROC-AUC ≈ 0.90), so K-Means was kept (notebook Section 7).

**Supervised + integration** (same split as the supervised notebook; every feature for round *t* uses only rounds 1..*t*-1, and the strategy model is refit on the training sessions of each split):

| Model | 12-session CV accuracy | CV ROC-AUC | Test accuracy | Test ROC-AUC |
|---|---|---|---|---|
| Rule: repeat own previous move | — | — | 0.838 | — |
| Logistic Regression (round, treatment, previous moves) | 0.829 ± 0.020 | 0.845 ± 0.065 | 0.838 | 0.898 |
| **+ cooperation rates + strategy membership + strategy × previous move** | **0.842 ± 0.017** | **0.898 ± 0.035** | **0.857** | **0.937** |

The plain Logistic Regression's predictions are identical to the "repeat your previous move" rule from round 2 on. The strategy × previous-move interactions are what the unsupervised part adds beyond simple cooperation rates: they let the model learn that, for example, Reciprocators defect after being betrayed while Forgiving Cooperators don't.

## Setup and reproduce
```bash
pip install -r requirements.txt
```
Open the notebooks in Jupyter or VS Code from the `notebooks/` folder and run all cells. They read the data from `../data/`. In Google Colab, upload the CSV files and set `DATA_PATH = "/content/"` in the first cells. For the last cells, which use the packaged model, also upload the `trustlab_unsupervised/` and `models/` folders.

To retrain the packaged strategy model used by the app, run this from this folder:
```bash
python -m trustlab_unsupervised.train --data data --out models
```

## Use in TrustLab
Label a player's strategy:
```python
from trustlab_unsupervised.model import StrategyModel
model = StrategyModel.load("models/strategy_model.joblib")
model.predict_strategy("CC,CC,CD,DD,DC,CC")   # each item = <my move><opponent's move>, one per round
```
Returns a JSON-ready dict: `strategy`, `description`, `membership` (relative closeness to each group, **not** a calibrated probability), `consistent_classic_strategies`, `features`, `reliable` (False when fewer than 10 rounds) and an optional `warning`.

Predict the next move:
```python
import joblib
from trustlab_unsupervised.model import StrategyModel
from trustlab_unsupervised.integration import next_move_features
sm = StrategyModel.load("models/strategy_model.joblib")
b = joblib.load("models/next_move_lr.joblib")
X = next_move_features("CC,CC,CD", "fix", sm)                       # history so far + "fix"/"rand"
p_cooperate = b["pipeline"].predict_proba(X[b["categorical"] + b["numeric"]])[0, 1]
```

Add the strategy features inside the supervised notebook:
```python
from trustlab_unsupervised.integration import (fit_strategy_model_on_sessions, round_history_features,
    add_strategy_interactions, membership_columns, interaction_columns, RATE_FEATURES)
sm = fit_strategy_model_on_sessions("data", train_sessions)          # training sessions only!
df = add_strategy_interactions(df.merge(round_history_features("data", sm), on=["player", "round"]), sm)
numeric_features = ["round"] + RATE_FEATURES + membership_columns(sm) + interaction_columns(sm)
```

**Shared conventions:** the previous-round state is `CC / CD / DC / DD` with **the player's own move first** (CD = I cooperated, the opponent defected). The supervised notebook stores it as `prev_player` + `prev_opp` (`ND` in round 1), and its treatment values `fix` / `rand` correspond to `FP` / `SP` in the unsupervised code.
