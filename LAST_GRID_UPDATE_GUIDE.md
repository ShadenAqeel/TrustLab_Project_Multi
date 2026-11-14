# TrustLab: The Last Grid — Multiplayer Story Update

This update adds the **fictional The Last Grid story** to the **existing multiplayer application**. It does not change game rules, participant matchmaking, scores, original ML models, predictions, or the backend API.

## Changed files

- `frontend/src/app.jsx`: mission briefing, city-grid illustration, arena copy, four outcome narratives, final report transition
- `web/app.js`: precompiled browser application (already updated; no Node.js build required on Render)
- `web/styles.css`: desktop/mobile styles for the mission, effects, and results transition
- `web/index.html`: page title and description
- `docs/THE_LAST_GRID_STORY.md`: story and mapping to the Prisoner's Dilemma
- `MULTIPLAYER_README.md`: story-layer documentation
- `LAST_GRID_UPDATE_GUIDE.md`: this guide

## Apply to an existing site

1. Back up your current multiplayer project, including any edits you have made after downloading the previous ZIP.
2. Extract the **story update patch**. Copy its `TrustLab_Project/` contents into the matching `TrustLab_Project/` directory of the Git repository that your Render service **actually deploys**. Merge or review conflicts rather than overwriting unrelated newer changes.
3. Commit and push the changes. If Render has auto-deploy enabled for that branch, it will rebuild. Otherwise, trigger **Deploy latest commit** from the Render dashboard.
4. Test `/multiplayer` (new briefing and join form), `/multiplayer/arena` (energy-cycle descriptions and outcome messages), and `/multiplayer/results` (story epilogue before the original ML results).

No environment variables, Python packages, or database changes are required. The included `web/app.js` is precompiled and Docker serves it directly.

## Checks performed for this update

- JSX compiled successfully using `node scripts/build_frontend.js`.
- Compiled script passed `node --check web/app.js`.
- Existing unit/API test suite: 21 passed (with `PYTHONPATH=.`).
- A browser screenshot test could not be completed in the current sandbox due to browser navigation restrictions. Check the deployed desktop/mobile presentation after publishing.

## Narrative accuracy

This is a story wrapper around the repeated Prisoner's Dilemma. The electricity system is fictional. The other multiplayer participant is a real human. Both ML predictions and K-Means clustering use the preexisting model artifacts. Short-session profiles remain exploratory.
