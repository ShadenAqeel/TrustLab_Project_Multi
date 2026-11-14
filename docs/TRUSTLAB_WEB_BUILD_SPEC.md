# TrustLab — Claude Code Web Experience Build Specification

**Status:** Implementation brief / product and technical source of truth  
**Audience:** Claude Code working within the existing `TrustLab_Project/` repository  
**Project:** TrustLab — predicting cooperation and discovering strategies in the iterated Prisoner's Dilemma  
**Objective:** Build a production-quality, interactive, responsive React + Python application that genuinely uses the existing machine-learning artifacts.

> **Definition of success:** A visitor can understand the game, play a complete 12- or 25-round experiment, receive *precommitted* AI predictions revealed only at the permitted time, see a scientifically cautious behavioral profile derived from the actual K-Means model, and explore the empirical research behind it. No simulated ML outputs are passed off as real predictions.

## 0. Mandatory working protocol for Claude Code

1. **Inspect the repository first.** Read `README.md`, `docs/PROJECT_NOTES.md`, `requirements.txt`, `trustlab_unsupervised/features.py`, `trustlab_unsupervised/model.py`, `trustlab_unsupervised/integration.py`, and the model metadata in `models/strategy_model.json`. List the actual available models, plots, and datasets before designing an API. The project ZIP may be supplied separately; if there is no `TrustLab_Project/` repository, locate or ask for it rather than inventing replacement code.
2. **Explicitly load the installed skills** at the time they are used. Read the actual `SKILL.md` for each relevant skill and appropriate bundled references, not just the skill names. The uploaded skill packages have names exactly: `modern-web-design`, `motion-framer`, `gsap-scrolltrigger`, `react-three-fiber`, `threejs-webgl`. Use installed skill commands or actual local `SKILL.md` paths supported by the environment; if inaccessible, state that and proceed with documented equivalents. **Do not claim a skill was loaded if it was not.**
3. **First give a succinct visual and architecture proposal** (creative direction, screen map, stack, design-system principles, skill-to-feature mapping, risks). Then **implement in the same task**; do not stop at the proposal or create an empty scaffold. Reconcile choices with repository contents.
4. Preserve and reuse the original datasets, trained artifacts, feature conventions, analyses, and provenance. Make small, tested compatibility adjustments only when unavoidable. Do not silently retrain, replace, or alter models or report evaluation metrics as new results.
5. Prioritize a functional, tested end-to-end gameplay loop before decorative additions. Complete the MVP before adding optional spectacle.
6. Finish with a clear file tree, changed files, run commands, tests actually run and their results, any blocked work, and deployment instructions. No invented test passes, deployment URLs, or model accuracy.

## 1. Project context and verified assets

The current package contains:

```text
TrustLab_Project/
├── data/
│   ├── fix.csv                  # fixed partner; 92 players, 100 rounds each
│   ├── rand.csv                 # shuffled partner; 96 players, 100 rounds each
│   ├── UserInformation.csv
│   ├── README.txt
│   └── Instructions_of_the_experiment.docx
├── docs/
│   ├── PROJECT_NOTES.md        # research results and methodological limitations
│   └── TrustGame_plan.pdf      # old proposal; not current implementation
├── figures/                    # existing generated and evaluated research charts
├── models/
│   ├── strategy_model.joblib   # saved K-Means strategy model
│   ├── strategy_model.json     # centroids, strategy names, profiles, priors
│   ├── next_move_lr.joblib     # serialized integrated Logistic Regression bundle
│   └── player_strategies.csv
├── trustlab_unsupervised/
│   ├── features.py
│   ├── integration.py
│   ├── model.py
│   └── train.py
├── notebooks/
├── reports/
├── requirements.txt
└── README.md
```

**Scientific context**
- Dataset: 188 human participants with 100 rounds each (18,800 decisions); two partner conditions `fix` and `rand`.
- This is the **iterated Prisoner's Dilemma**, not the conventional investment/transfer Trust Game. TrustLab is the brand name.
- The original proposal's first dataset and Random Forest approach were superseded. The implemented project uses **one Dryad dataset for both components**, **K-Means (k=4)** for player strategies, and **Logistic Regression** for next-move prediction.
- Four descriptive strategy groups: **Defector (73 players), Forgiving Cooperator (55), Erratic (31), Reciprocator (29)**. They are empirical clusters, not psychological diagnoses or intrinsic personality types.
- Reported, pre-existing experimental results: K-Means silhouette about **0.32**; supervised baseline test accuracy **0.838**, test ROC-AUC **0.898**; integrated test accuracy **0.857**, test ROC-AUC **0.937**; integrated cross-validation ROC-AUC **0.898** vs baseline **0.845**. Label as results from the existing analysis, **never** as an on-site visitor evaluation or live model accuracy.
- Source: [Dryad dataset DOI 10.5061/dryad.37pvmcvmk](https://datadryad.org/dataset/doi:10.5061/dryad.37pvmcvmk); interpret published claims only after checking the source notes.

**Version compatibility**
- `requirements.txt` targets **Python 3.12**, **scikit-learn==1.6.1**, **numpy==2.1.3**, **pandas==2.2.3**, **joblib==1.4.2**. A newer scikit-learn release previously failed to load the saved LR bundle because of a private API change. Establish a reproducible backend environment and smoke-test deserialization before building dependent features.

## 2. Skill selection and explicit responsibilities

All five skills are relevant, but they do **not** require five overlapping animation systems.

| Skill | Priority | Use in this product | Boundaries / expected files to read |
|---|---|---|---|
| **modern-web-design** | **Essential / first** | Visual concept; design tokens; typographic hierarchy; accessible navigation, adaptive layouts, purposeful interactions, performance budget | Read `SKILL.md` plus accessibility, interaction, and performance references |
| **motion-framer** | **Essential** | React component entrances/exits, UI micro-interactions, button feedback, state transitions, reveal sequence, game cards | Read `SKILL.md` and API reference; follow current maintained Motion API appropriate to installed package, not necessarily older examples |
| **gsap-scrolltrigger** | **High for narrative pages** | Scroll-linked landing-page exposition, restrained parallax, chapter progress, Research Lab scrollytelling | Read `SKILL.md`, common patterns, performance guidance; use scoped setup and cleanup; do **not** attach ScrollTrigger to core gameplay buttons |
| **react-three-fiber** | **High / focused 3D** | One distinctive, responsive 3D visual system (hero trust network and optionally results scene) within React | Read `SKILL.md`, API guidance and optimization patterns; use `@react-three/drei` where helpful |
| **threejs-webgl** | **Supporting specialist** | Lighting, camera, materials, shader advice, WebGL fallback, dispose/cleanup, render performance for R3F | Read `SKILL.md` and optimization/materials references. **Do not create a parallel imperative Three.js renderer** if R3F already handles rendering |

**Skill execution checklist for Claude Code:**
- [ ] Enumerate installed skill paths/commands and explicitly read `modern-web-design/SKILL.md` before design.
- [ ] Read `motion-framer/SKILL.md` before authoring UI animations.
- [ ] Read `gsap-scrolltrigger/SKILL.md` before implementing scroll scenes.
- [ ] Read `react-three-fiber/SKILL.md` before adding a `<Canvas>`.
- [ ] Read `threejs-webgl/SKILL.md` plus WebGL optimization/materials references before tuning scene rendering.
- [ ] Use each relevant skill's bundled references only where they answer an actual implementation question. If a feature does not benefit from a skill, don't force it into the codebase.

## 3. Original visual concept: **The Reciprocity Chamber**

**Art direction:** A thoughtful behavioral-science exhibit wrapped in an atmospheric strategy game. Elegant and cinematic, not generic SaaS, corporate dashboard, casino, cyberpunk, or stock-photo landing page.

**Visual metaphor:** Two entities in a network negotiate trust over time. Their choices push/pull a set of luminous connecting strands. The same graphic language connects landing page, gameplay, and results: **nodes = agents, connecting threads = history, pulses = decisions, orbit/geometry = strategy**.

**Look and feel**
- Deep midnight navy panels, near-white editorial type, subtle geometric textures; intentional open space.
- **Cooperate:** muted teal `#318D7B` (never rely on color alone).
- **Defect:** warm copper `#BC775E`.
- **Prediction/discovery accent:** soft gold `#D4BA87`.
- **Main background:** `#111923`; **elevated surface:** `#233247`; **main text:** `#EFF1ED`.
- Visually distinct large headlines; refined small explanatory copy; clear numbers, readable graphs, generous spacing.
- Subtle glass, restrained bloom and glow; avoid a page of identical glass cards, excessive gradients, particle storms, and distracting hover effects.
- Custom typographic scale using `clamp()`; consistent 8/12/16/24/32px spacing system; distinctive editorial layouts and asymmetric composition on desktop.
- Motion principles: every animation **teaches**, **signals a decision**, or **supports a reveal**. Prefer 200–400ms UI response; longer cinematic motion only when meaningful and skippable.

**3D concept (R3F):** One sculptural, low-poly/abstract *Trust Network* made of connected nodes and gently tensioned strands. Mouse/touch input can tilt it subtly; scrolling may affect camera rotation only on the landing narrative. Reuse its silhouette (or a 2D SVG version) in reveal/report. Make the experience work with 3D disabled.

**Accessibility and performance are non-negotiable:** keyboard-accessible buttons, visible focus, high-contrast text, accessible charts/tables, no essential information only inside WebGL, `prefers-reduced-motion` / explicit motion toggle, adequate touch targets, lazy-loaded 3D, canvas fallback, no scroll hijacking. Aim for strong Core Web Vitals (e.g. LCP < 2.5s, INP < 200ms, CLS < 0.1 where feasible), not decorative FPS at any cost.

## 4. Information architecture: five core screens

```text
/                         Landing — cinematic statement and invitation
/experiment               Setup — mode, length, feedback preference, rules
/arena/:sessionId         Game — round-by-round decisions and sealed AI prediction
/results/:sessionId       Reveal — personal gameplay statistics + strategy profile
/lab                      Research Lab — real historical evidence and model explanation
```

Provide shared app shell / nav, a clearly visible **Play the Experiment** CTA, accessible mobile navigation, readable empty/error/loading states, and an informational footer with research provenance. The player should complete the entire game on mobile without horizontal scrolling.

### Screen A — Landing / introduction

**Goal:** Instantly establish the project's distinctive identity and entice a user to play.

**Above fold:**
- Headline idea: **“Trust is a choice. Patterns tell a story.”**
- Supporting thought: **“Make a move. The AI will try to predict the next one.”**
- Main CTA: `Enter the Trust Arena`; secondary link: `Explore the Research`.
- Hero R3F Trust Network; dynamic but low-motion/fallback-safe; pointer-responsive on capable devices.

**Scroll chapters (GSAP ScrollTrigger):**
1. **The Dilemma:** Visually introduce Cooperate vs Defect without teaching ML jargon.
2. **Every round has consequences:** Animated, accessible payoff matrix / examples.
3. **The AI is watching patterns:** Supervised predicts *next action*; unsupervised discovers *behavioral profiles*.
4. **The experiment awaits:** CTA, brief time expectation expressed as round count (not a promised time estimate).

Cinematic scroll only for landing/lab; avoid blocking page navigation or text when JavaScript, reduced motion, or WebGL is unavailable.

### Screen B — Experiment Setup

**Goal:** Explain rules and secure one unambiguous choice of game conditions.

- Fixed partner (`fix`): same simulated opponent policy throughout session.
- Changing partners (`rand`): new simulated opponent policy each round. Explain this is a *simulation inspired by* the original experimental design, **not live human opponents**.
- **Quick Experiment:** 12 rounds, fast interaction, tentative strategy label.
- **Deep Experiment:** 25 rounds, more observations, still **exploratory / tentative**.
- **Feedback setting:** (1) `Challenge mode` = reveal the sealed AI prediction after each round; (2) `Research mode` = keep predictions sealed until final report to reduce feedback effects on subsequent choices.
- The game payoff matrix must be visible/expandable before starting; explain that players choose without seeing their opponent's current move.
- Optional compact interactive tutorial demonstrating one round; must use clearly labeled examples, not live model data.
- Start button validates inputs, creates a backend session, then navigates to `/arena/:sessionId`.

### Screen C — Trust Arena / gameplay

**Goal:** Provide a tactile, fair, distraction-free experience.

Display:
- Current round `t / 12 or 25`; consistent player/opponent panels; points; optional progress/timeline.
- Opponent type description that does **not** reveal a hidden move or imply a real person.
- Central dilemma, two huge keyboard-accessible buttons: **Cooperate** vs **Defect**.
- Clear interaction states: ready → submitting/locked → both actions reveal → payoff reveal → AI feedback (if enabled) → next round.
- Round history ledger, keyboard-friendly and mobile-friendly.
- Optional atmospheric network animation reacting to *revealed* outcomes; do not use WebGL as an input source for decisions.
- Prediction shown as a **sealed prediction** until the player commits, then only displayed after the round in Challenge mode; in Research mode keep it hidden until results.
- Score follows original payoffs: `(C,C) → (3,3)`, `(C,D) → (0,4)`, `(D,C) → (4,0)`, `(D,D) → (1,1)`.
- Prevent double-submit, replayed requests, skipping rounds, conflicting actions, and impossible scores. Provide network-error recovery without losing state.
- User must be able to get through a complete session using only keyboard.

**Important fairness rule:** For round *t*, AI prediction and the opponent's current choice must be committed from rounds `< t` **before** receiving the player's round-*t* choice. The app cannot peek at the current answer. No prediction leakage.

### Screen D — Behavioral Reveal / result

**Goal:** The emotional high point, but explain observations responsibly.

Show:
1. **“Your Closest Strategy: …”** using the real K-Means output: Defector / Forgiving Cooperator / Erratic / Reciprocator. Label as **closest observed behavioral profile**, not “your personality type.”
2. Model-generated description plus brief natural-language explanation grounded in actual `features` values.
3. Cooperation rate, decision-switching rate, response to betrayal (when observed), total score, opponent total, rounds completed.
4. AI next-move prediction accuracy over eligible prediction rounds. Clarify difference from historical test accuracy and which rounds counted. Only count predictions actually committed before the action and stored.
5. Interactive decision timeline: user's move, opponent move, payoff, predicted move, outcome; Research mode predictions become visible here.
6. Relative K-Means **closeness scores**, explicitly **not probabilities or model confidence**. Labels/percentages should not imply “97% chance you are a Reciprocator.”
7. Plain-language caution: **“This is an exploratory gameplay profile, not a psychological assessment. Short sessions may produce a different assignment than a 100-round history.”**
8. Replay / change mode / explore the evidence CTAs.

**Short history:** The existing `predict_strategy()` function returns `reliable=True` after 10 rounds for internal convenience; that is **not scientific evidence** that a 10-, 12-, or 25-round label is stable. UI must always call short-session reports **preliminary / exploratory** until a validation study establishes stability. Don't show an “AI confidence percentage” derived from K-Means closeness. If a conditional behavioral rate has zero observed denominator, show **“Not enough observations”** rather than an invented value.

### Screen E — Research Lab

**Goal:** Demonstrate actual ML value with transparent, interactive evidence.

Sections:
- **The Experiment:** 188 participants, 100 rounds, 92 fixed / 96 shuffled; design and payoff matrix.
- **Patterns from real data:** Compare cooperation in fixed vs shuffled partners (approx. 56% vs 29%). Show actual historical figures / aggregates, with provenance.
- **Meet the four strategy clusters:** share counts, behaviors, centroid-based profile visualization, optional PCA scatter based on existing data. Use existing figure assets or regenerate faithfully from source.
- **How clustering was selected:** elbow/silhouette, comparison with Ward and GMM, limitation of silhouette ~0.32, no magical 100% segmentation.
- **Prediction vs discovery:** Logistic Regression prediction vs K-Means strategy analysis, and how integrated strategy features improve CV ROC-AUC (0.845 → 0.898). Clearly distinguish CV from held-out test metrics.
- **Behavior over time:** player decisions and changes across rounds, especially partner-condition differences.
- **Study method, limitations, references:** original experiment vs simulated visitor game, real data vs playable demo, source DOI, participant sample, memory-one assumptions, full-history vs 12/25-round limits.

Use interactive chart filtering only when the data and interpretation remain correct. Supply accessible text summaries of every chart; optimize the plot for mobile. If providing a live explore control, avoid misleading causal language.

## 5. ML integration contract — use real functions, not mock predictions

### Existing unsupervised interface

```python
from trustlab_unsupervised.model import StrategyModel
sm = StrategyModel.load("models/strategy_model.joblib")
report = sm.predict_strategy("CC,CC,CD,DD,DC,CC")
# Round token: <my action><opponent action> using C or D.
# Report contains: cluster, strategy, description, membership, n_rounds,
#                 features, consistent_classic_strategies, reliable, etc.
```

The `membership` dictionary is **relative centroid closeness** (a normalized distance transform), not a calibrated probability. Do not misrepresent it.

### Existing integrated supervised interface

```python
import joblib
from trustlab_unsupervised.integration import next_move_features
sm = StrategyModel.load("models/strategy_model.joblib")
bundle = joblib.load("models/next_move_lr.joblib")
X = next_move_features("CC,CC,CD", "fix", sm)
cols = bundle["categorical"] + bundle["numeric"]
probabilities = bundle["pipeline"].predict_proba(X[cols])[0]
# Inspect bundle['pipeline'].classes_ / trained label mapping before deciding
# which probability corresponds to Cooperate.
```

`next_move_features()` takes the complete **past** history and one of `fix` / `rand`, and builds a prediction row for the **next** round with `prev_player`, `prev_opp`, history cooperation rates, membership features, and interaction terms. For an empty history the code supports round-one neutral inputs. Use exact feature ordering from the saved bundle. Verify `predict_proba` positive-class mapping; do not blindly assume column `[1]` is `C`.

### Conventions and safeguards

- Each move is `C` or `D`. Round token is `my_move + opponent_move` (so `CD` means **I cooperated, opponent defected**).
- `fix` / `rand` is the backend's treatment; the UI can call these Fixed / Changing.
- Game scoring is independent of ML; a model failure never changes a legitimate payoff.
- Load both model artifacts at API startup (or controlled lazy initialization), report clear readiness errors, and avoid `joblib.load()` on user-supplied files. Pin dependencies for reproducibility.
- The K-Means strategy model is not retrained per visitor. “Learning your behavior” is a metaphor for **updating inference from accumulating history**, not online model training.
- Never replace a failed production inference with made-up probabilities. A dev/demo fixture must be visually and programmatically flagged as mock, and disabled in production.

## 6. Opponent engine — authentic rules, explicitly synthetic opponents

- Game remains **simultaneous-choice** from the player's perspective. Both sides' moves for the current round must be fixed independently of the player's current choice.
- Opponent behaviors may be *inspired by* the four observed strategy profiles, but these are simulated policies, not recordings of study participants and not direct statements about real opponent intent.
- Suggested implementation: probabilistic **memory-one policies**, referencing real cluster profiles where suitable. Compute opponent context from **opponent's own perspective**: if last token from user's perspective is `CD`, the opponent's perspective is `DC`. Map the previous context correctly before using conditional probabilities.
- For the first round (no preceding outcome), select the policy's documented initial cooperation probability; do not infer an undefined conditional probability.
- **Fixed:** choose one policy at session start and use it across all rounds.
- **Changing:** choose/rotate a new policy per round in a controlled, documented manner; retain previous outcome history for player model features while clarifying opponent identity differs each round.
- Keep the opponent RNG server-side and stable within a game session. Record enough metadata for deterministic debugging without exposing future choices.
- Separate **opponent policy** from **player prediction** so we can test fairness. The supervised model predicts the human player's action; it should not magically control the opponent.

## 7. Recommended stack and responsibilities

**Frontend**
- React + TypeScript + Vite.
- React Router for screens and navigation.
- Tailwind CSS for tokens/layout and plain CSS for bespoke visuals when cleaner.
- Motion (or the installed supported Framer Motion version) for React interface transitions.
- GSAP + ScrollTrigger (with `@gsap/react` if appropriate) for selected scroll chapters; explicit cleanup in hooks.
- Three.js through **React Three Fiber** + Drei for a single reusable hero scene and optional reveal flourish; refer to `threejs-webgl` for rendering optimization.
- Recharts or Plotly for accessible 2D data plots; interactive but not a 3D gimmick.
- A small typed API client; use React Query only if it meaningfully simplifies requests/cache.
- Frontend testing with Vitest + Testing Library; Playwright for end-to-end flows if the environment supports it.

**Backend**
- Python **3.12**, FastAPI, Pydantic, existing scikit-learn stack.
- `api/` (or `backend/`) separated into routes, schemas, core game engine, opponent policies, inference adapter, session store, research data access, config.
- `requirements-api.txt` (or `pyproject.toml`) extending existing pinned `requirements.txt` without breaking notebooks.
- Temporary in-memory session store is acceptable for local MVP but not reliable across multiple deployed instances or restarts. If deploying on multiple workers or requiring persistence, use Redis/DB/session store. Document limitations and avoid claims of persistent progress otherwise.
- CORS allowlist, env-based config, server-side validation, restricted payload sizes, error handling. No public upload of arbitrary model files.
- Anonymous game sessions; **no accounts necessary for MVP** and do not collect unnecessary personal information. Do not expose individual research participant records in the frontend.

**Suggested new repo structure**

```text
TrustLab_Project/
├── frontend/
│   ├── src/
│   │   ├── app/                 # routing, global providers
│   │   ├── pages/               # Landing, Experiment, Arena, Results, Lab
│   │   ├── components/          # shared UI; game, charts, animations, scenes
│   │   ├── features/game/       # typed session state, round UI
│   │   ├── features/research/   # typed research data + components
│   │   ├── lib/api/            # typed backend client and DTOs
│   │   └── styles/             # tokens, animations, global styles
│   ├── tests/
│   └── package.json
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── routes/             # game, results, research, health
│   │   ├── services/           # ML adapter, payoff engine, opponent policy
│   │   ├── schemas/            # Pydantic request/response models
│   │   ├── state/              # session store / locking
│   │   └── settings.py
│   └── tests/
├── models/                      # original models (preserve)
├── trustlab_unsupervised/       # original Python package (preserve)
├── figures/                     # original historical plots
├── data/                        # original dataset
└── docs/
    └── TRUSTLAB_WEB_BUILD_SPEC.md
```

Claude Code may adjust this tree after inspecting the actual repo, but should retain clear ownership and separation of concerns.

## 8. Backend REST contract (proposed; make types explicit)

| Method / route | Input | Output / rule |
|---|---|---|
| `GET /api/health` | — | API health and `models_ready` summary (safe version metadata) |
| `POST /api/game/start` | `{ treatment: "fix" \| "rand", rounds: 12 \| 25, feedback_mode: "challenge" \| "research" }` | New random session ID, mode, round count, current score and first round status; **never return current prediction or opponent move** |
| `GET /api/game/{id}` | Session ID | Public session state for reconnect without revealing hidden moves/predictions |
| `POST /api/game/{id}/round` | `{ move: "C" \| "D", request_id: UUID }` | Atomically resolve one prepared round, include both actual moves, payoffs, running score; show sealed prediction only if `challenge`; prepare next sealed round before returning |
| `GET /api/game/{id}/results` | Finished session ID | Summary, all committed prediction outcomes, player's strategy, feature explanations, model caveats. Restrict until game finished. |
| `GET /api/research/summary` | — | Aggregated, source-traceable dataset metrics for Research Lab; no private raw participant info |

**Recommended server state:** `session_id`, `treatment`, `round_limit`, `feedback_mode`, `history`, `opponent_policy`, `current_sealed_prediction`, `current_sealed_opponent_move`, `scores`, `status`, `round_index`, `request_ids` (idempotency). Each outcome write is atomic; the next round's sealed values are created from the **updated completed history**, never from future moves. Preserve a stable outcome if a client retries after a timeout. Use per-session concurrency control / locking. Expire anonymous sessions after an explicitly documented TTL.

**API errors:** invalid move (422), missing/expired session (404/410), premature results (409), repeated/old round (409 or return idempotent cached response), model unready (503). Do not leak tracebacks or model file paths into public responses.

## 9. UI component and animation map

| Area | Key reusable components | Animation skill |
|---|---|---|
| Global | `AppShell`, `MainNav`, `PrimaryButton`, `ProgressIndicator`, `SectionHeader`, `InlineNotice`, `MotionToggle` | modern-web-design + motion-framer |
| Landing | `TrustNetworkScene`, `HeroStory`, `DilemmaExplainer`, `PayoffMatrix`, `MLDualitySection` | react-three-fiber + gsap-scrolltrigger + modern-web-design |
| Setup | `TreatmentSelector`, `RoundSelector`, `FeedbackModeSelector`, `RulesModal` | motion-framer |
| Arena | `PlayerPanel`, `OpponentPanel`, `ChoiceButtons`, `RoundReveal`, `ScoreTracker`, `DecisionLedger`, `SealedPrediction` | motion-framer; R3F only if it materially helps |
| Results | `StrategyHero`, `StatGrid`, `ClosenessVisualizer`, `DecisionTimeline`, `AIAccuracyBreakdown`, `WarningNote` | motion-framer; optional R3F reuse |
| Research | `DatasetOverview`, `StrategyProfiles`, `TreatmentComparison`, `ModelComparison`, `Methodology`, `Limitations` | GSAP for narrative sections; charts are standard accessible React components |

**Animation boundaries:**
- Use Motion for local React UI state, entrance/exit, tap and report transitions.
- Use ScrollTrigger only for scroll-linked landing/lab sequences with cleanup and responsive breakpoints.
- Use R3F as the *single* canvas architecture for optional 3D; use Three.js details through R3F, not a second renderer.
- Avoid multiple libraries animating the same DOM property concurrently.
- Respect reduced motion and avoid nonessential animations on low-powered mobile devices.
- Ensure loading or animation does not delay game input nor the correctness of a round's state.

## 10. UX and scientific integrity rules

**Must say and do**
- “AI prediction” = supervised model's next-move output **before** that move is known.
- “Closest strategy” = unsupervised cluster in a five-feature space, not a clinical/personality diagnosis.
- “Closeness” ≠ statistical certainty; if showing normalized soft-membership scores, label exactly as similarity/closeness, not probability/confidence.
- “Research participants” = original dataset; “Visitors” = simulated-opponent online demo. Never mix these datasets or compare them as equivalent without caveats.
- Short sessions (12/25) = provisional profile, regardless of the existing `reliable` boolean threshold.
- Existing accuracy/AUC numbers = historical reported results, not new performance on visitors.
- Model outputs must not leak before decisions. Opponents do not react to the player's current unseen action.
- Preserve data provenance and avoid causal claims about partner assignment from descriptive comparisons.
- Save the session history only as needed for gameplay; no identifying information by default.

**Edge cases**
- Zero history: no meaningful cluster yet; show neutral explanatory empty state.
- First prediction: verify label mapping for `ND` previous moves.
- Never-observed previous state: no fabricated conditional statistic; use existing model smoothing internally but explain missing exposure in user-facing metrics.
- Restart, reload, timeout, duplicate click, network retry, invalid session, interrupted results, switching modes: all handled gracefully.
- If ML artifacts fail to load, show honest degraded/unavailable state. Keep explanatory research content accessible; never silently substitute random predictions.
- Users may cooperate or defect every round; all possible move combinations and score results must work.

## 11. Test plan and acceptance criteria

### ML and backend
- [ ] Reproduce model load using pinned Python/scikit-learn versions; smoke-test `StrategyModel.predict_strategy` and `next_move_features` with `fix`, `rand`, empty and sample histories.
- [ ] Validate output probability orientation using actual saved model classes, and ensure result JSON contains numeric types not NumPy scalars.
- [ ] Verify `CC`, `CD`, `DC`, `DD` payoff mapping with parameterized tests.
- [ ] Verify no current-player-action input leaks into prediction or opponent decision.
- [ ] Verify correct previous-state reversal for simulated opponent policies.
- [ ] Verify full 12- and 25-round sessions, including `fix` and `rand`, both feedback modes, all-cooperate and all-defect patterns.
- [ ] Verify no duplicate scoring on double click / retry / competing requests; invalid moves rejected.
- [ ] Verify correct results, timeline, prediction accuracy denominator, and provisional-label caution.
- [ ] Verify saved model unavailability produces visible errors, not fabricated inference.
- [ ] Document whether session state survives process restart and what hosting changes are needed.

### Frontend and experience
- [ ] All five routes render, including meaningful empty, loading, error, and success states.
- [ ] CTA → setup → game → reveal → lab navigation works end-to-end with the **real local API**.
- [ ] Responsive at 360px mobile, tablet, and desktop; no clipped content or overlapping controls.
- [ ] Usable with keyboard and visible focus; accessible button names, readable graphs, semantic headings.
- [ ] Reduced-motion mode and WebGL-disabled fallback preserve all critical gameplay and content.
- [ ] Animation cleanup: no extra GSAP ScrollTriggers, infinite effects, memory leak, or WebGL context accumulation after route changes.
- [ ] Build and typecheck pass; unit tests pass; run browser E2E when available.
- [ ] Source data / existing research results and simulated gameplay are visibly distinguished.

### Quality bar
A homepage full of animations **without a working real-model game is not a successful delivery**. A functional game with unfinished accessibility, broken mobile layouts, or deceptive model labels is also incomplete. Deliver a cohesive, verifiable MVP.

## 12. Delivery order and checkpoints

1. **Audit:** Confirm model interfaces, project files, environment compatibility, and loaded skills. Report major blockers and assumptions.
2. **Propose:** Show concise original design direction, page map, architecture, skill-use table, motion/3D performance plan. **Then continue implementation.**
3. **Backend first:** Implement API, fair opponent engine, inference adapter, session state and backend tests.
4. **Playable UI:** Complete setup → arena → outcome → results with real model responses.
5. **Visual system:** Apply thoughtful typography, color, motion states and scene integration.
6. **Research Lab:** Load verified research graphics/aggregates, comparisons, notes and scientific limitations.
7. **Validate:** Run automated checks, test keyboard/mobile/reduced-motion, fix actual failures, verify honest degraded states.
8. **Prepare deployment:** Add `.env.example` (no secrets), Dockerfile / hosting configs as appropriate, build scripts, one-command local instructions, Render-compatible API service and Vercel-compatible frontend steps (or one-service alternative), CORS settings, pinned backend runtime, model files availability, health endpoint, and free-tier sleep caveat.
9. **Report:** Explain what was built, files changed, skills actually loaded, tests executed, missing steps, and exactly how to run/deploy.

## 13. Non-goals / constraints

- No real-money rewards, financial transactions, or user authentication required.
- No forced social/multiplayer mode: current opponents are simulated, not real humans.
- No model retraining or data-science redesign unless an actual integration bug mandates it.
- No tracking of identifiable personal data, demographic collection, or displaying raw individual survey responses.
- No fabricated visuals that imply model validation or psychological certainty.
- No use of raw three.js as a second parallel graphics architecture simply to tick a skill box.
- No dependency on a paid service or external key for the basic experience.
- Do not ask for an extensive questionnaire; make sensible defaults grounded in this specification and document them.

---

**Source precedence:** Actual checked repository behavior and persisted artifact schemas > `README.md` / `PROJECT_NOTES.md` > this implementation brief > the outdated `docs/TrustGame_plan.pdf`. When they conflict, identify the conflict and preserve scientific correctness before coding.
