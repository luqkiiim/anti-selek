# Club Play

Club Play is an opt-in format for single-club sessions. It uses club ratings and draws from one pool. Mixed is the default and uses the existing Higher/Lower pairing sides, including overrides. Open allows unrestricted doubles when player-side data is unavailable or the host prefers it.

## How the matcher chooses a batch

1. Fill the largest legal set of requested courts. Compare batches by effective game counts, arrival priority and overdue-turn protection. The matcher respects pauses, active games, late-arrival credit and queue reservations.
2. Establish the best team balance within that fairness class. Apply the existing rating-based guardrail to team averages. Where its normal ceiling is infeasible, retain the best attainable worst and total team gaps.
3. Find the best quartet fit within those bounds. Compare raw Elo distance, tied rating positions and unusually large adjacent gaps in the available skill neighborhoods. Players already on court still inform the neighborhoods. In Mixed, use within-side gaps and match the two sides by their relative standing. Club Play can use any legal quartet if availability and fairness require it.
4. Use the local spacing of the roster to determine how much fit can vary. Inside that range, consider the session's match-type mix and each player's exposure, then preserve good fit, competitive teams, rest and relationship variety. The same search and time budget applies to reshuffles.

Counts for session exposure come from started and completed matches. A queued game reserves players without adding exposure. When a court opens, an automatic reservation must still meet fairness, balance and skill requirements. In Mixed mode, it also competes with the fresh lineup on session mix first, then player exposure. Manual reservations retain their lineups. The assignment transaction verifies the roster, ratings and matches used to make each automatic decision.

## Doubles mix and Elo limitations

- Match-type targets are soft. A roster's Higher/Lower shares determine its starting target and how it is projected when some doubles categories cannot form. Availability and fair turns can restrict the mix further. For example, seven players on each side can have exactly six games each in 21 one-court games. Even with identical skills, the strongest available-player game-count fairness rule requires at least nine mixed games, which rules out seven games of each category in that sequence.
- A side with only two eligible players needs mixed games to get turns. A side with one eligible player cannot form a conventional Mixed lineup. Hosts can choose Open to let that player participate.
- Current Elo uses opposing team strength and score margin. Separate historical pools provide no match evidence for their relative offset, and guests and new players may have little history behind their ratings. Cross-pool results add evidence over time without changing historical ratings. An offline comparison of opponent-graph connectivity, sample counts and rating error on later cross-pool matches would help assess rating confidence.
- Stored sessions and matches use the existing string and JSON fields. Club Play uses the existing rating-update rules for Rating sessions, including guest treatment.
