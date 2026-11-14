# TrustLab — Project notes for the team

Status, key results, and what is still to change before the final presentation and deployment.

---

## 1. Where the project stands

| Part | Owner | Status | Where |
|---|---|---|---|
| EDA + supervised model (Logistic Regression) | teammate | done | `notebooks/supervised_teammate/ML_TrustGameProject.ipynb` (original, unchanged) |
| Unsupervised: strategy discovery (K-Means) + decision analysis | me | done | `notebooks/unsupervised_strategies.ipynb` |
| Integration: strategy features inside the supervised model | me | done | `notebooks/supervised_integration.ipynb` |
| Deployable models + Python API for the app | me | done | `models/`, `trustlab_unsupervised/` |
| TrustLab web application | team | **not started** | uses `predict_strategy()` and `next_move_features()` (see README) |

**Data decision:** Dataset 1 (168,386 decisions) has been dropped. Both parts use **Dataset 2**: 188 players × 100 rounds of the iterated Prisoner's Dilemma, with a fixed-partner treatment (FP, `fix.csv`) and a changing-partner treatment (SP, `rand.csv`).

---

## 2. Key results

### Unsupervised: four behavioral strategies (K-Means, k = 4)
| Strategy | Players | Behavior | Closest classic strategy |
|---|---|---|---|
| Defector | 73 (39%) | cooperates ~13% of rounds; almost never leaves mutual defection | Always-Defect |
| Forgiving Cooperator | 55 (29%) | cooperates ~80% of rounds; keeps cooperating after being betrayed | Always-Cooperate |
| Erratic | 31 (16%) | breaks mutual cooperation half the time; switches most often | Random |
| Reciprocator | 29 (15%) | copies the opponent's last move | Tit-for-Tat |

- **Fixed vs. changing partner:** cooperation is 56% vs. 29%. The strategy mix differs strongly (χ² p < 0.001, Cramér's V = 0.39): FP has 40% Forgiving Cooperators, SP has 52% Defectors.
- **The best strategy depends on the setting:** with a fixed partner, cooperators earn the most; with changing partners, defectors earn the most.
- **What triggers a change of decision:** the previous round's outcome and payoff (V = 0.31; being betrayed, payoff 0, leads to a switch 42% of the time), then the strategy group (V = 0.24). The opponent's move alone matters little (V = 0.10).
- **External check:** 97% of Reciprocators said the opponent's last move influenced them, against 56–67% in the other groups (p ≈ 0.001). The survey was not used for clustering.

### Model selection (unsupervised)
K-Means was compared with **Hierarchical clustering (Ward)** and a **Gaussian Mixture Model** (both tuned; all at k = 4):

| | K-Means | Hierarchical (Ward) | GMM (full) |
|---|---|---|---|
| Silhouette ↑ | **0.32** | 0.26 | 0.16 |
| Davies-Bouldin ↓ | **1.21** | 1.50 | 1.61 |
| Bootstrap stability (ARI) ↑ | **0.79** | 0.57 | 0.50 |
| Reciprocators "influenced by opponent" ↑ | **97%** | 85% | 78% |
| Supervised CV ROC-AUC with its features | ≈ 0.90 | ≈ 0.90 | ≈ 0.90 |

→ **K-Means was kept.** It is best on every clustering criterion, all three are equally useful for prediction, and it labels new players directly. GMM also loses the Tit-for-Tat group. DBSCAN was tried too, but it labels a quarter of the players as noise.

The unsupervised notebook is written in the course style and uses the same preprocessing as the supervised notebook (`fix`, `rand`, `df`, `prev_player` / `prev_opp` with `ND`, `y`).

### Supervised + integration
| Model (same split as the supervised notebook) | 12-session CV accuracy | CV ROC-AUC | Test accuracy | Test ROC-AUC |
|---|---|---|---|---|
| Rule: "repeat your previous move" | — | — | 0.838 | — |
| Logistic Regression (round, treatment, previous moves) | 0.829 | 0.845 | 0.838 | 0.898 |
| **+ cooperation history + strategy membership + strategy × previous move** | **0.842** | **0.898** | **0.857** | **0.937** |

The strategy × previous-move terms let the model learn that strategies react differently to an opponent's defection. Reciprocators swing hard towards defecting (log-odds ≈ −3.3), Forgiving Cooperators react mildly (≈ −1.1), and Defectors hardly react (≈ −0.5).

---

## 3. Review notes for the supervised notebook (`ML_TrustGameProject.ipynb`)

**Good:** session-based train/test split and `GroupKFold` by session (no player leakage); the features contain no future information.

**Please change:**
1. **Add the baseline "repeat your previous move".** It scores exactly the same test accuracy (83.8%), and the Logistic Regression's predictions are identical to it from round 2 on. Unit 4 says to always compare against a baseline, and a reviewer will check this.
2. **Replace the conclusion "the data has a linear relationship".** All five models score the same because the four features carry little information (2 × 2 previous moves × 2 treatments + round), not because the relationship is linear. Suggested wording: *"All models perform similarly because the features take few distinct values; Logistic Regression was chosen for its simplicity and interpretability."*
3. **Report cross-validation over all 12 sessions** (0.829 ± 0.020 accuracy) next to the 3-session test set, which is small and noisy.
4. **Optional, recommended:** use the integrated model from `supervised_integration.ipynb` (the snippet is in the README). It is the first version that beats the baseline, and it links both parts of the project.

---

## 4. Suggested updates to the project plan (`docs/TrustGame_plan.pdf`)

| Section | Current text | Suggested |
|---|---|---|
| 04 Datasets | Dataset 1 (168,386 decisions) for supervised; Dataset 2 for unsupervised | Dataset 2 only (188 players × 100 rounds, fixed vs. changing partner) for both parts |
| 05 ML Approach: supervised | Random Forest | Logistic Regression (selected over Decision Tree, Random Forest, KNN and SVM), compared with a "repeat previous move" baseline |
| 05 ML Approach: unsupervised | K-Means | K-Means (selected over Hierarchical clustering and a Gaussian Mixture), 4 strategies |
| 03 Objectives / Decision Analysis | "...opponent's previous actions and payoff structures" | "...opponent's previous actions and the **previous round's payoff**". Dataset 2 has a single fixed payoff matrix, so different payoff structures cannot be compared |
| 05 / 06 | — | **Add:** the discovered strategies improve the next-move prediction (CV ROC-AUC 0.845 → 0.898) |
| Web application | "explore different scenarios" | Use `next_move_features()` + `next_move_lr.joblib` for predictions and `predict_strategy()` for strategy labels. Show membership scores as "closeness to each strategy", not as a probability |

---

## 5. Limitations to state in the report
- Only 188 players. Apart from the Defectors, strategies form a continuum rather than separated clusters (silhouette 0.32), so players near group borders can change group when the sample changes (bootstrap ARI 0.79), although the four profiles stay the same.
- The strategy features depend on smoothing of rarely-visited situations (results are stable for α ≥ 2; α = 2 is used).
- Strategies are memory-one summaries (they only look one round back).
- The 3-session test set is small; the cross-validation over 12 sessions is the more reliable estimate.
