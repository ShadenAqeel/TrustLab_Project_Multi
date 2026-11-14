# TrustLab — Claude Code instructions

Read `docs/TRUSTLAB_WEB_BUILD_SPEC.md` in full before designing or implementing the TrustLab web application. This specification describes the product, five required screens, real model interfaces, UX/motion/3D expectations, scientific integrity requirements, API, tests, and deployment.

## Essential context
- Preserve the existing `trustlab_unsupervised/` Python package, `models/` artifacts, `data/`, and research figures.
- Use `StrategyModel.predict_strategy()` and `next_move_features()` from the existing package. Implement a **real** FastAPI-backed experience, not a cosmetic mockup.
- Treat the game as an **iterated Prisoner's Dilemma**; follow payoff matrix and own/opponent ordering in the brief.
- Backend: Python 3.12, scikit-learn==1.6.1 (match existing pinned versions). Frontend: React + TypeScript + Vite; Motion / GSAP / React Three Fiber only where appropriate.
- Skill use: **explicitly read and follow** installed `modern-web-design`, `motion-framer`, `gsap-scrolltrigger`, `react-three-fiber`, and supporting `threejs-webgl` skill documentation when implementing relevant features.
- Start by proposing the visual concept, site map, and stack briefly, then immediately build a functional responsive website.
- The prediction and opponent decision for round t must be sealed from prior-round history before the user's t-th move is accepted; avoid leakage and duplicate scoring.
- Short (12/25-round) strategy profiles are **exploratory**, regardless of the model's 10-round `reliable` field. K-Means membership values are **not confidence probabilities**.
- Finish with tests actually run, accurate status, instructions for local use, and deployment documentation.

If required model files or skills are absent in the working directory, inspect first, report the blocker, and don't silently substitute invented data/model results.
