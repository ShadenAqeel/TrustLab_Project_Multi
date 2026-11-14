# TrustLab — The Last Grid

## Narrative layer for the existing multiplayer game

**Two districts. One power grid. A stranger you must trust.**

The city has gone dark. Only one power grid remains operational, connecting two isolated districts. The visitor becomes the controller of one district and is matched with another real human who controls the other district.

The controllers have never met, cannot communicate in-game, and do not know the other person's current choice. Each round is a new *energy-distribution cycle*.

- **Cooperate / Share power:** Contribute to the shared grid. If both cooperate, both districts benefit.
- **Defect / Divert power:** Prioritize your own district. If the other contributes, you gain more at their expense.

Both choices are locked and revealed only when the two humans have submitted. Each player remains with the same opponent for the complete match.

### Unchanged payoff rules

| Controller's choice | Other controller's choice | Points (controller / other) | Narrative explanation |
|---|---|---|---|
| Cooperate | Cooperate | 3 / 3 | The grid stabilizes. Both districts benefit. |
| Cooperate | Defect | 0 / 4 | Your district contributes but is exploited. |
| Defect | Cooperate | 4 / 0 | Your district diverts energy and gains the advantage. |
| Defect | Defect | 1 / 1 | Both divert power and receive minimal returns. |

### The observer

An AI observes **each player's previous decisions** and predicts their next cooperate/defect choice, before that player's next move. The AI does not control the human opponent. At the end, K-Means assigns an *exploratory behavioral cluster profile* based on the player's decision history; this is not a diagnosis or validated psychological classification.

### End of the game

> The final cycle is complete. The grid recorded your choices. But the real experiment was never about electricity. It was about you, your opponent, and the patterns behind every decision.

The application transitions directly to the original behavioral report (strategy profile, prediction accuracy, decision history and points). The power-grid scenario is **fictional**. The underlying game is the **repeated Prisoner's Dilemma**, with existing scoring, multiplayer matchmaking, model predictions, and K-Means analysis left unchanged.

## Where the story is implemented

1. Landing page: one-sentence setting and invitation to play.
2. Multiplayer match setup (`/multiplayer`): cinematic mission briefing, power-sharing and diversion descriptions, and a direct button to the existing nickname/matchmaking form.
3. Arena (`/multiplayer/arena`): energy-cycle terminology around the existing choices, the waiting state, and four narrative consequences after both moves are revealed.
4. Results (`/multiplayer/results`): the final-story reveal before the existing ML report.

No backend endpoints, serialized models, experiments, payoff calculation, or match state are changed. `frontend/src/app.jsx` is the editable source and `web/app.js` is its prebuilt, Docker-served output. Run `node scripts/build_frontend.js` after future edits to the JSX source.
