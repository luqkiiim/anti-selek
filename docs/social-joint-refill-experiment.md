# Social joint-refill experiment

This is a deterministic, simulation-only comparison of the existing immediate refill schedule and one conditional-wait rule. It compares the production Social selector with the opt-in courtmate-beneficial-rescue selector where both are scheduled. It does not change the matcher or production scheduling path.

The conditional-wait rule may delay one refill for at most five minutes, and only to the next group of currently busy assignments that complete together. Waiting is eligible only when both the immediate preview and the post-completion preview return batches with `varietyOptimal === true` and the other required matcher certificates, and the future-minus-immediate score is at least one normalized new courtmate pair per court or at least `0.5` signed rolling-T units per court. Production may still execute an ordinary legal selection when its search returns a non-optimal result; that selection is recorded as non-optimal and never qualifies a wait preview. If either preview is incomplete, the threshold is not reached, the forecast group is beyond the wait limit, or the preview has no batch, the scheduler refills immediately. It does not chain another wait after that wake.

The previews use cloned player, completed-history, active-reservation, and random-generator state. Only the selected real refill consumes the session's matcher random stream. A future-state preview includes the next completion group in completed history and updates its players' match and rest counts before scoring the potential batch. The simulator releases every member of a tied completion group before matching again, then applies match-count and rest updates in stable physical-court order. Production scoring receives active reservations as social history; the candidate's courtmate/type priority uses completed history only, as its matcher contract specifies.

Each assignment receives a deterministic exogenous duration drawn from a Park–Miller stream seeded from the experiment seed and physical court, with one draw per court assignment ordinal. Duration is `20 minutes × (0.8 + 0.4 × draw)`, in the range 16–24 minutes. Therefore both schedulers see the same duration for the same seed/court/ordinal even when a wait changes start time. The evaluation horizon is capped at exactly 100 completed matches. If a simultaneous completion group would cross that cap, only the assignments through match 100 enter the completed history; the remaining assignments in that tied group are censored at the same clock time.

The cohort contains three seeds (`1`, `4729`, and `104729`) for each requested row below:

| Scenario | Engine | Scheduler arms |
|---|---|---|
| 8 upper-side players, two courts | Production and courtmate-beneficial-rescue | Immediate and conditional-wait |
| 10 balanced players (5/5), two courts | Production and courtmate-beneficial-rescue | Immediate and conditional-wait |
| 12 balanced players (6/6), two courts | Courtmate-beneficial-rescue | Immediate and conditional-wait |
| 12 balanced players (6/6), three courts | Courtmate-beneficial-rescue, partial-joint control | Immediate and conditional-wait |

This yields 36 sessions. The nominal six-appearance checkpoint is 12 completed matches for eight players, 15 for ten players, and 18 for twelve players. The report also checkpoints 50 and 100 matches when reached. A completed-match count before 100 remains an explicit censored horizon; no projected matches are added.

The runner records both preview proofs, the immediate choice, the conditional-wait eligibility and reason, the predicted completion group and forecast improvement, the actual wait and refill batch, physical court and assignment ordinal, actual start/completion times, and every failed or incomplete preview. Its independent validator reconstructs assignments, history, busy state, exogenous durations, completion order, rest and fairness cohorts, wait decisions, and checkpoint scores from the trace. An uncertified preview or actual proposal is never counted as a certified decision or executed assignment.

The 12-player/three-court row is a partial-joint control: after one court frees, the policy considers waiting for the next completion group so two courts can refill together, even while the third remains busy. It does not wait for the whole session to drain.

The outcome report covers courtmate, partner, and opponent breadth/coverage; completed-only rolling six-appearance match-type coverage; the count of players with both feasible types; each player's longest personal single-type run; fairness match-count spread; completed-cohort rest-turn and elapsed-rest-minute samples plus back-to-back assignments; elapsed-match duration, court utilization and idle time; refill delay; conditional-wait eligibility, declines and lookahead-limit cases; and actual/counterfactual certificate rates. Every endpoint reports its denominator and whether a wait remained unresolved at the 100th completion.

The scheduler uses an exact next-finish forecast in this simulator. That gives the wait rule more timing information than a live service would ordinarily have, so this is a bounded, favorable-condition research experiment. Results describe these deterministic scenarios and thresholds only; they are not a production recommendation or a request to change scheduling behavior.
