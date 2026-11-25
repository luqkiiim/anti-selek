# Club Play

Club Play is an opt-in format for single-club sessions. It uses club ratings and draws from one pool. Mixed is the default and uses the existing Higher/Lower pairing sides, including overrides. Open allows unrestricted doubles when player-side data is unavailable or the host prefers it.

## How the matcher chooses a batch

1. Fill the largest legal set of requested courts. Compare batches by effective game counts, arrival priority and overdue-turn protection. The matcher respects pauses, active games, late-arrival credit and queue reservations.
2. Establish the best team balance within that fairness class. Apply the existing rating-based guardrail to team averages. Where its normal ceiling is infeasible, retain the best attainable worst and total team gaps.
3. Rank the remaining batches by skill fit, recent courtmates and doubles mix. Skill costs grow with rating gaps, including the widest individual gap. Mixed doubles compare raw Elo within each pairing side and relative ranks across sides. Players who are busy still inform the roster rankings.
4. Give an occasional play-up opportunity to players who have started two games without one. A stronger courtmate must be in the top fifth of the applicable roster or pairing side and at least 100 Elo higher. For Mixed players without a qualifying stronger peer on their side, a 25-percentile-point advantage across sides can qualify. At most one court in a batch gets this boost, with three intervening starts between boosts and two ordinary starts before a player can take part in another. Ordinary games can also fulfil the opportunity. The same team-balance and eligibility checks apply to every court.

Started matches count toward recent courtmates and play-up opportunities, regardless of who partnered whom. A queued game reserves players until its lineup is started or replaced. When a court opens, the automatic reservation and fresh lineup are compared under the same fairness, balance and quality rules. Manual reservations retain their lineups. The assignment transaction verifies the roster, ratings and matches used to make each automatic decision.

## Doubles mix and Elo limitations

- Match-type targets are soft. A roster's Higher/Lower shares determine its starting target and how it is projected when some doubles categories cannot form. Availability and fair turns can restrict the mix further. For example, seven players on each side can have exactly six games each in 21 one-court games. Even with identical skills, the strongest available-player game-count fairness rule requires at least nine mixed games, which rules out seven games of each category in that sequence.
- A side with only two eligible players needs mixed games to get turns. A side with one eligible player cannot form a conventional Mixed lineup. Hosts can choose Open to let that player participate.
- Current Elo uses opposing team strength and score margin. Separate historical pools provide no match evidence for their relative offset, and guests and new players may have little history behind their ratings. Cross-pool results add evidence over time without changing historical ratings. An offline comparison of opponent-graph connectivity, sample counts and rating error on later cross-pool matches would help assess rating confidence.
- Stored sessions and matches use the existing string and JSON fields. Club Play uses the existing rating-update rules for Rating sessions, including guest treatment.
