# Social generalization audit: courtmate-beneficial rescue

**Decision:** the candidate is not ready to become the production default. Six of 48 candidate sessions failed to return an opening selection under the matcher’s default search budget; production completed all 48. Keep the candidate opt-in while the frontier search limitation is addressed and revalidated.

The candidate completed 2,214 matches and 2,178 decisions across reached sessions. It made 55 completed one-pair concessions (2.525% of completed decisions), with aggregate conditional signed benefit of 35 T and 70 additional or preserved both-type windows. No completed concession had zero or negative conditional benefit. All six candidate failures occurred before the first assignment in the 16-player/two-court and 18-player/three-court scenarios (three seeds each). Production completed those sessions. A proposed follow-up is to improve frontier proof/pruning or schedule refill after both courts clear; neither correction is implemented here.

Report input: [benchmarks/generated/social-generalization/full-2026-10-06-v1/summary.json](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-generalization/full-2026-10-06-v1/summary.json). Detailed seed/checkpoint values: [checkpoint-metrics.csv](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/docs/social-beneficial-rescue-generalization-checkpoint-metrics.csv).

## Scenario-specific interpretation

At all 14 short checkpoints the candidate reached, its average courtmate breadth matched or exceeded production. Gains were modest at 8/6 (10.857→10.952) and larger at 12 players/two courts (5.778→7.222), where recent both-type coverage also rose from 2/36 to 32/36. This comes with more immediate replay in several short sessions: at 8/6, back-to-back assignments rose from 22.07% to 30.63%. Opponent breadth often fell in the 14-player cases. Similar mean rest therefore does not establish improvement in every rest or relationship measure.

The ten-player/two-court 5/5 scenario demonstrates that more courtmate coverage does not imply type recurrence. All three candidate seeds played only MIXED for 100 matches, so T stayed at 0.5. Production also averaged T=0.5, but one seed played only OWN_SIDE and reached four distinct courtmates per player; the candidate counterpart played only MIXED and reached nine.

After one MIXED court completes while the other remains busy, only 3 upper and 3 lower players are available: neither side can supply four players for OWN_SIDE. A MIXED refill restores the same state. An upper/lower OWN_SIDE opening instead leaves a 5/1 refill pool, forcing OWN_SIDE again. Both types remain structurally feasible in the full 5/5 roster. With one court, all ten players become available after each completion; every tested seed used 11 MIXED and 4 OWN_SIDE matches by the 15-match checkpoint.

In the 9/5 fixed-roster scenario, short-horizon both-type window coverage is 92.86% for the candidate versus production's 95.24%. In the 8/6 scenario, both arms have complete both-type coverage at the short checkpoint; at 100 the candidate is 97.62% and production is 100%. The candidate therefore does not improve this measure in every tested cohort.

For the played-departure-as-pause scenario, both arms cover all 78 unordered courtmate pairs among the 13 nonpaused players in all three seeds by 100. Full-roster mean C is 12.095 for production and 11.952 for the candidate because the paused player's possible pairs remain in the structural vocabulary; this is not surviving-player breadth failure. Candidate lower-side players can nevertheless remain at T=0.5 because the paused fourth lower-side player is needed to make OWN_SIDE feasible. Seed 4729 selected P13 at decision 92, after 91 matches: P13 was the only eligible lower-side player in decisions 83–91 while P11/P12 were busy and P14 was paused; upper-side OWN_SIDE was the only legal refill, and P13 was selected as soon as the other reservation cleared. This reflects the safety/availability constraints, not a starvation-certificate failure. A separate permanent-departure structural state would require a model change; none is implemented.

The all-one-side eight-player/two-court scenario has only OWN_SIDE as a feasible type. Both policies reach T=1, but play settles into fixed four-player cohorts with mean C=3 of 7, zero rest, and a 100% back-to-back rate. The beneficial rescue is inactive because there is no second feasible type. The longest assignment rest observed overall is 13, in seed 4729 under both arms during the indefinite-pause scenario; paused players do not accrue rest turns.

## Proposed follow-up, not implemented

1. Add generic frontier upper bounds and pruning that can certify the courtmate ceiling without weakening the signed-T guard or fairness/starvation ordering.
2. Evaluate a joint refill option that waits until both courts are clear before rebuilding a multi-court batch. This may restore type choice in opening states, with a possible tradeoff in court idle time and assignment latency.
3. Model permanent departure explicitly if the product needs departed players removed from structural opportunities. A pause is not departure and must continue to retain roster history and structural feasibility.

## Method and metric definitions

Short horizons use `round(1.5 × player count)` completed matches, which is six personal appearances per player on average because each match has four players. Selected long diagnostics end at 100 completed matches. There are three deterministic seeds per scenario, identical under production and candidate, with stable player strengths and asynchronous court completions. Completed-match count—not elapsed wall time—sets the horizon. Both these histories and the canonical reference omit completed timestamps, so time-based rematch penalties were not exercised; encounter-frequency and entropy ties remained active.

**C** reports distinct feasible courtmates per player and coverage against that player's structural courtmate set. **T** is the share of each player's feasible match types represented in their latest six completed personal appearances. A 5:1 and 3:3 type window both earn full T; there is no target ratio, quota, debt, or 50/50 requirement. Temporary busy/rest status does not shrink structural feasibility. Paused players remain in the structural roster and retain their history. Production opportunity metrics exclude paused players; candidate structural metrics keep them.

The engine preserves count/arrival-priority fairness, schedule and starvation safety before optimizing coverage. Arrival matchmaking credit is neutralized against active roster members; it does not grant aggressive catch-up. Count spread over the full roster, active spread excluding paused players, and effective active spread incorporating neutral credit are reported separately. Count spread and certification failures are distinct. A one-pair cost is exactly `Gmax − chosen gain = 1`; only a fully completed batch counts as completed cost. Conditional benefit compares chosen signed ΔT with the best full-Gmax signed ΔT from the same decision state and safety class. The independent scenario and audit suites include side-label symmetry and structural-feasibility checks.

## Structural feasibility and denominators

MIXED needs at least two players of each side. OWN_SIDE needs at least four players of that player's side. Each player's T denominator is the number of structurally feasible types (one or two), not the number available for the current refill. C coverage divides by that player's feasible peers; pair denominators are built from those opportunities.

| Structural roster | UPPER feasible types / T denominator | LOWER feasible types / T denominator | C peers per player / feasible pairs |
| --- | --- | --- | --- |
| 10: 5/5 | MIXED + OWN_SIDE / 2 | MIXED + OWN_SIDE / 2 | 9 / 45 |
| 12: 6/6 | MIXED + OWN_SIDE / 2 | MIXED + OWN_SIDE / 2 | 11 / 66 |
| 14: 7/7, 8/6, 9/5, 10/4 | MIXED + OWN_SIDE / 2 | MIXED + OWN_SIDE / 2 | 13 / 91 |
| 16: 8/8 | MIXED + OWN_SIDE / 2 | MIXED + OWN_SIDE / 2 | 15 / 120 |
| 18: 9/9 | MIXED + OWN_SIDE / 2 | MIXED + OWN_SIDE / 2 | 17 / 153 |
| 14: 11/3 | MIXED + OWN_SIDE / 2 | MIXED / 1 | 13 / 91 |
| 8: 8/0 | OWN_SIDE / 1 | No LOWER players | 7 / 28 |
| 6: 3/3 | MIXED / 1 | MIXED / 1 | 5 / 15 |
| 13: 10/3 before genuine join | MIXED + OWN_SIDE / 2 | MIXED / 1 | 12 / 78 |

The 10/3→10/4 join changes existing lower players' T denominator from one to two. The 12→14 arrival changes C denominators from 11 to 13 and pair opportunities from 66 to 91; existing encounter counts remain unchanged. Pauses retain the full structural vocabulary and personal completed history. During indefinite pause, production's separate 13-player opportunity vocabulary treats the three active lower players as MIXED-only; the candidate retains the 14-player vocabulary because the session model has no distinct played-player departure state. See [roster semantics and source evidence](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/docs/social-roster-semantics.md).

Global side-label reversal preserves MIXED/OWN_SIDE legality, feasible peer sets, and scores when IDs, strengths, fairness state, and history are mirrored consistently. Seeded mirror tests confirmed equivalent production and candidate selections and G/T profiles. Full mirrored cohorts were therefore omitted; there is no side-specific scoring bonus in this experiment.

## Primary short-horizon comparison

| Scenario (side split / courts) | Horizon | Reached seeds, candidate | Mean C: production → candidate | Mean T: production → candidate | Both-type T=1: production → candidate | MIXED / OWN_SIDE totals: production → candidate |
| --- | --- | --- | --- | --- | --- | --- |
| fixed-14-8-6-2c (8/6, 2 courts) | 21 | 3/3 | 10.857 → 10.952 | 1.0000 → 1.0000 | 42/42 → 42/42 | 38/25 → 40/23 |
| fixed-14-9-5-2c (9/5, 2 courts) | 21 | 3/3 | 10.524 → 10.905 | 0.9762 → 0.9643 | 40/42 → 39/42 | 37/26 → 39/24 |
| fixed-14-10-4-2c (10/4, 2 courts) | 21 | 3/3 | 10.571 → 10.810 | 0.9405 → 0.9881 | 37/42 → 41/42 | 30/33 → 29/34 |
| balanced-10-5-5-1c (5/5, 1 court) | 15 | 3/3 | 8.933 → 9.000 | 1.0000 → 1.0000 | 30/30 → 30/30 | 33/12 → 33/12 |
| balanced-10-5-5-2c (5/5, 2 courts) | 15 | 3/3 | 5.200 → 5.533 | 0.5000 → 0.5000 | 0/30 → 0/30 | 30/15 → 45/0 |
| balanced-12-6-6-2c (6/6, 2 courts) | 18 | 3/3 | 5.778 → 7.222 | 0.5278 → 0.9444 | 2/36 → 32/36 | 42/12 → 42/12 |
| balanced-16-8-8-2c (8/8, 2 courts) | 24 | 0/3 | 10.583 → not achieved | 0.9792 → not achieved | 46/48 → not achieved | 41/31 → not achieved |
| balanced-18-9-9-3c (9/9, 3 courts) | 27 | 0/3 | 11.370 → not achieved | 0.9815 → not achieved | 52/54 → not achieved | 48/33 → not achieved |
| edge-14-11-3-2c (11/3, 2 courts) | 21 | 3/3 | 9.619 → 9.667 | 0.8571 → 0.8690 | 21/33 → 22/33 | 24/39 → 24/39 |
| edge-8-8-0-2c (8/0, 2 courts) | 12 | 3/3 | 3.000 → 3.000 | 1.0000 → 1.0000 | not structurally feasible → not structurally feasible | 0/36 → 0/36 |
| edge-6-3-3-1c (3/3, 1 court) | 9 | 3/3 | 5.000 → 5.000 | 1.0000 → 1.0000 | not structurally feasible → not structurally feasible | 27/0 → 27/0 |
| dynamic-arrival-12-6-6-to-14-after-8 (6/6, 2 courts) | 21 | 3/3 | 9.429 → 9.857 | 0.7381 → 0.9524 | 20/42 → 38/42 | 55/8 → 41/22 |
| dynamic-feasibility-10-3-to-10-4-after-8 (10/3, 2 courts) | 21 | 3/3 | 10.381 → 10.571 | 0.8929 → 0.9048 | 33/42 → 34/42 | 32/31 → 31/32 |
| dynamic-pause-resume-14-7-7-p1-at-6-12 (7/7, 2 courts) | 21 | 3/3 | 10.571 → 11.333 | 1.0000 → 0.9881 | 42/42 → 41/42 | 36/27 → 44/19 |
| dynamic-played-departure-as-pause-14-10-4-p14-after-8 (10/4, 2 courts) | 21 | 3/3 | 10.048 → 10.286 | 0.8571 → 0.9286 | 30/42 → 36/42 | 26/37 → 26/37 |
| dynamic-pause-resume-14-10-4-p14-at-8-14 (10/4, 2 courts) | 21 | 3/3 | 10.333 → 11.095 | 0.9524 → 0.9524 | 38/42 → 38/42 | 32/31 → 30/33 |

## Unachieved endpoints

Missing candidate endpoints are not zero-valued measurements. All six candidate failures occurred at zero completed matches; the corresponding production sessions completed.

| Scenario | Seed | Arm | Completed matches | Stop reason | Search limit reached | Audit status |
| --- | --- | --- | --- | --- | --- | --- |
| balanced-16-8-8-2c | 1 | Beneficial rescue | 0 | matcher-search-limit-no-selection | true | no-selection |
| balanced-16-8-8-2c | 4729 | Beneficial rescue | 0 | matcher-search-limit-no-selection | true | no-selection |
| balanced-16-8-8-2c | 104729 | Beneficial rescue | 0 | matcher-search-limit-no-selection | true | no-selection |
| balanced-18-9-9-3c | 1 | Beneficial rescue | 0 | matcher-search-limit-no-selection | true | no-selection |
| balanced-18-9-9-3c | 4729 | Beneficial rescue | 0 | matcher-search-limit-no-selection | true | no-selection |
| balanced-18-9-9-3c | 104729 | Beneficial rescue | 0 | matcher-search-limit-no-selection | true | no-selection |

## Breadth and secondary relationship quality

| Scenario | Arm | Horizon | Mean C coverage | Mean minimum C | Worst-player C coverage | Unique C pairs / feasible | Players fully covered | Mean P / O peers | Mean P / O entropy |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fixed-14-8-6-2c | Production | 21 | 0.8352 | 8.667 | 0.6667 | 76.00 / 91.00 | 1.33 | 5.619 / 8.667 | 0.6634 / 0.7986 |
| fixed-14-8-6-2c | Beneficial rescue | 21 | 0.8425 | 9.333 | 0.7179 | 76.67 / 91.00 | 1.67 | 5.857 / 7.857 | 0.6846 / 0.7242 |
| fixed-14-8-6-2c | Production | 100 | 1.0000 | 13.000 | 1.0000 | 91.00 / 91.00 | 14.00 | 13.000 / 13.000 | 0.9783 / 0.9232 |
| fixed-14-8-6-2c | Beneficial rescue | 100 | 1.0000 | 13.000 | 1.0000 | 91.00 / 91.00 | 14.00 | 13.000 / 12.952 | 0.9716 / 0.9045 |
| fixed-14-9-5-2c | Production | 21 | 0.8095 | 7.667 | 0.5897 | 73.67 / 91.00 | 0.33 | 5.667 / 8.714 | 0.6678 / 0.8099 |
| fixed-14-9-5-2c | Beneficial rescue | 21 | 0.8388 | 9.000 | 0.6923 | 76.33 / 91.00 | 1.67 | 5.714 / 8.190 | 0.6713 / 0.7780 |
| fixed-14-10-4-2c | Production | 21 | 0.8132 | 8.667 | 0.6667 | 74.00 / 91.00 | 0.67 | 5.857 / 8.524 | 0.6846 / 0.7892 |
| fixed-14-10-4-2c | Beneficial rescue | 21 | 0.8315 | 9.333 | 0.7179 | 75.67 / 91.00 | 2.33 | 5.905 / 7.952 | 0.6889 / 0.7321 |
| fixed-14-10-4-2c | Production | 100 | 1.0000 | 13.000 | 1.0000 | 91.00 / 91.00 | 14.00 | 13.000 / 12.952 | 0.9782 / 0.9311 |
| fixed-14-10-4-2c | Beneficial rescue | 100 | 1.0000 | 13.000 | 1.0000 | 91.00 / 91.00 | 14.00 | 12.905 / 13.000 | 0.9728 / 0.9081 |
| balanced-10-5-5-1c | Production | 15 | 0.9926 | 8.667 | 0.9630 | 44.67 / 45.00 | 9.33 | 5.733 / 8.000 | 0.7874 / 0.9061 |
| balanced-10-5-5-1c | Beneficial rescue | 15 | 1.0000 | 9.000 | 1.0000 | 45.00 / 45.00 | 10.00 | 5.667 / 7.000 | 0.7804 / 0.8548 |
| balanced-10-5-5-2c | Production | 15 | 0.5778 | 4.000 | 0.4444 | 26.00 / 45.00 | 0.67 | 3.600 / 4.667 | 0.5491 / 0.6607 |
| balanced-10-5-5-2c | Beneficial rescue | 15 | 0.6148 | 3.667 | 0.4074 | 27.67 / 45.00 | 0.67 | 3.267 / 4.867 | 0.5051 / 0.6620 |
| balanced-10-5-5-2c | Production | 100 | 0.8148 | 7.333 | 0.8148 | 36.67 / 45.00 | 6.67 | 4.667 / 7.267 | 0.6805 / 0.8445 |
| balanced-10-5-5-2c | Beneficial rescue | 100 | 1.0000 | 9.000 | 1.0000 | 45.00 / 45.00 | 10.00 | 5.000 / 9.000 | 0.7092 / 0.9545 |
| balanced-12-6-6-2c | Production | 18 | 0.5253 | 4.000 | 0.3636 | 34.67 / 66.00 | 0.00 | 3.722 / 5.222 | 0.5082 / 0.6183 |
| balanced-12-6-6-2c | Beneficial rescue | 18 | 0.6566 | 5.000 | 0.4545 | 43.33 / 66.00 | 1.33 | 4.222 / 5.889 | 0.5604 / 0.6310 |
| balanced-16-8-8-2c | Production | 24 | 0.7056 | 7.333 | 0.4889 | 84.67 / 120.00 | 0.00 | 5.583 / 8.708 | 0.6215 / 0.7601 |
| balanced-16-8-8-2c | Beneficial rescue | 24 | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved |
| balanced-16-8-8-2c | Production | 100 | 1.0000 | 15.000 | 1.0000 | 120.00 / 120.00 | 16.00 | 14.917 / 14.875 | 0.9647 / 0.9159 |
| balanced-16-8-8-2c | Beneficial rescue | 100 | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved |
| balanced-18-9-9-3c | Production | 27 | 0.6688 | 7.333 | 0.4314 | 102.33 / 153.00 | 0.00 | 5.815 / 9.185 | 0.6127 / 0.7524 |
| balanced-18-9-9-3c | Beneficial rescue | 27 | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved |
| edge-14-11-3-2c | Production | 21 | 0.7399 | 7.000 | 0.5385 | 67.33 / 91.00 | 0.67 | 5.714 / 8.381 | 0.6758 / 0.7853 |
| edge-14-11-3-2c | Beneficial rescue | 21 | 0.7436 | 7.000 | 0.5385 | 67.67 / 91.00 | 0.33 | 5.714 / 7.762 | 0.6758 / 0.7496 |
| edge-8-8-0-2c | Production | 12 | 0.4286 | 3.000 | 0.4286 | 12.00 / 28.00 | 0.00 | 3.000 / 3.000 | 0.5473 / 0.5603 |
| edge-8-8-0-2c | Beneficial rescue | 12 | 0.4286 | 3.000 | 0.4286 | 12.00 / 28.00 | 0.00 | 3.000 / 3.000 | 0.5473 / 0.5603 |
| edge-6-3-3-1c | Production | 9 | 1.0000 | 5.000 | 1.0000 | 15.00 / 15.00 | 6.00 | 3.000 / 5.000 | 1.0000 / 0.9693 |
| edge-6-3-3-1c | Beneficial rescue | 9 | 1.0000 | 5.000 | 1.0000 | 15.00 / 15.00 | 6.00 | 3.000 / 5.000 | 1.0000 / 0.9693 |
| dynamic-arrival-12-6-6-to-14-after-8 | Production | 21 | 0.7253 | 7.000 | 0.5385 | 66.00 / 91.00 | 0.00 | 5.095 / 7.905 | 0.6151 / 0.7628 |
| dynamic-arrival-12-6-6-to-14-after-8 | Beneficial rescue | 21 | 0.7582 | 6.667 | 0.5128 | 69.00 / 91.00 | 0.33 | 5.381 / 7.619 | 0.6413 / 0.7398 |
| dynamic-arrival-12-6-6-to-14-after-8 | Production | 100 | 1.0000 | 13.000 | 1.0000 | 91.00 / 91.00 | 14.00 | 12.905 / 13.000 | 0.9559 / 0.9497 |
| dynamic-arrival-12-6-6-to-14-after-8 | Beneficial rescue | 100 | 1.0000 | 13.000 | 1.0000 | 91.00 / 91.00 | 14.00 | 12.714 / 12.952 | 0.9512 / 0.9403 |
| dynamic-feasibility-10-3-to-10-4-after-8 | Production | 21 | 0.7985 | 8.000 | 0.6154 | 72.67 / 91.00 | 1.00 | 5.810 / 8.095 | 0.6816 / 0.7714 |
| dynamic-feasibility-10-3-to-10-4-after-8 | Beneficial rescue | 21 | 0.8132 | 8.667 | 0.6667 | 74.00 / 91.00 | 1.33 | 5.714 / 7.857 | 0.6728 / 0.7457 |
| dynamic-pause-resume-14-7-7-p1-at-6-12 | Production | 21 | 0.8132 | 8.333 | 0.6410 | 74.00 / 91.00 | 0.67 | 5.857 / 8.571 | 0.6846 / 0.8027 |
| dynamic-pause-resume-14-7-7-p1-at-6-12 | Beneficial rescue | 21 | 0.8718 | 9.333 | 0.7179 | 79.33 / 91.00 | 1.00 | 5.810 / 8.952 | 0.6800 / 0.8167 |
| dynamic-pause-resume-14-7-7-p1-at-6-12 | Production | 100 | 1.0000 | 13.000 | 1.0000 | 91.00 / 91.00 | 14.00 | 12.952 / 13.000 | 0.9583 / 0.9490 |
| dynamic-pause-resume-14-7-7-p1-at-6-12 | Beneficial rescue | 100 | 1.0000 | 13.000 | 1.0000 | 91.00 / 91.00 | 14.00 | 12.905 / 12.905 | 0.9589 / 0.9344 |
| dynamic-played-departure-as-pause-14-10-4-p14-after-8 | Production | 21 | 0.7729 | 6.667 | 0.5128 | 70.33 / 91.00 | 0.33 | 5.762 / 8.190 | 0.6683 / 0.7696 |
| dynamic-played-departure-as-pause-14-10-4-p14-after-8 | Beneficial rescue | 21 | 0.7912 | 5.667 | 0.4359 | 72.00 / 91.00 | 0.00 | 5.857 / 7.905 | 0.6714 / 0.7412 |
| dynamic-played-departure-as-pause-14-10-4-p14-after-8 | Production | 100 | 0.9304 | 6.667 | 0.5128 | 84.67 / 91.00 | 6.67 | 11.190 / 11.810 | 0.8870 / 0.8747 |
| dynamic-played-departure-as-pause-14-10-4-p14-after-8 | Beneficial rescue | 100 | 0.9194 | 5.667 | 0.4359 | 83.67 / 91.00 | 5.67 | 11.000 / 11.714 | 0.8743 / 0.8534 |
| dynamic-pause-resume-14-10-4-p14-at-8-14 | Production | 21 | 0.7949 | 8.667 | 0.6667 | 72.33 / 91.00 | 0.67 | 5.762 / 8.571 | 0.6764 / 0.7929 |
| dynamic-pause-resume-14-10-4-p14-at-8-14 | Beneficial rescue | 21 | 0.8535 | 9.333 | 0.7179 | 77.67 / 91.00 | 1.33 | 5.952 / 8.095 | 0.6924 / 0.7619 |

## Rest, completed-count fairness, and certification

Rest summaries include the mean across assignments, mean per-seed p95, and worst observed assignment rest. Count spread includes the full roster; active spread excludes paused players, and effective active spread incorporates neutral matchmaking credit. All spread measures are outcomes and remain distinct from certificate failures.

| Scenario | Arm | Horizon | Reached seeds | Mean rest | Mean per-seed p95 | Worst assignment rest | B2B rate | Full-roster spread mean / max | Active spread mean / max | Effective active spread mean / max | Fairness cert failures | Starvation cert failures | Search-limit / incomplete audit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fixed-14-8-6-2c | Production | 21 | 3/3 | 1.318 | 3.333 | 4 | 22.07% | 0.67 / 2 | 0.67 / 2 | 0.67 / 2 | 0 | 0 | 0 / 0 |
| fixed-14-8-6-2c | Beneficial rescue | 21 | 3/3 | 1.311 | 4.000 | 4 | 30.63% | 0.67 / 2 | 0.67 / 2 | 0.67 / 2 | 0 | 0 | 0 / 0 |
| fixed-14-8-6-2c | Production | 100 | 3/3 | 1.459 | 3.667 | 6 | 17.26% | 2.67 / 4 | 2.67 / 4 | 2.67 / 4 | 0 | 0 | 0 / 0 |
| fixed-14-8-6-2c | Beneficial rescue | 100 | 3/3 | 1.459 | 3.000 | 6 | 18.29% | 2.67 / 4 | 2.67 / 4 | 2.67 / 4 | 0 | 0 | 0 / 0 |
| fixed-14-9-5-2c | Production | 21 | 3/3 | 1.322 | 4.000 | 5 | 27.48% | 0.67 / 2 | 0.67 / 2 | 0.67 / 2 | 0 | 0 | 0 / 0 |
| fixed-14-9-5-2c | Beneficial rescue | 21 | 3/3 | 1.299 | 4.000 | 4 | 32.43% | 0.67 / 2 | 0.67 / 2 | 0.67 / 2 | 0 | 0 | 0 / 0 |
| fixed-14-10-4-2c | Production | 21 | 3/3 | 1.326 | 3.667 | 4 | 22.07% | 0.67 / 2 | 0.67 / 2 | 0.67 / 2 | 0 | 0 | 0 / 0 |
| fixed-14-10-4-2c | Beneficial rescue | 21 | 3/3 | 1.303 | 4.000 | 4 | 29.73% | 0.67 / 2 | 0.67 / 2 | 0.67 / 2 | 0 | 0 | 0 / 0 |
| fixed-14-10-4-2c | Production | 100 | 3/3 | 1.459 | 3.333 | 6 | 17.35% | 2.67 / 4 | 2.67 / 4 | 2.67 / 4 | 0 | 0 | 0 / 0 |
| fixed-14-10-4-2c | Beneficial rescue | 100 | 3/3 | 1.459 | 3.333 | 6 | 19.06% | 2.67 / 4 | 2.67 / 4 | 2.67 / 4 | 0 | 0 | 0 / 0 |
| balanced-10-5-5-1c | Production | 15 | 3/3 | 1.367 | 3.000 | 3 | 10.67% | 0.00 / 0 | 0.00 / 0 | 0.00 / 0 | 0 | 0 | 0 / 0 |
| balanced-10-5-5-1c | Beneficial rescue | 15 | 3/3 | 1.367 | 3.000 | 3 | 14.00% | 0.00 / 0 | 0.00 / 0 | 0.00 / 0 | 0 | 0 | 0 / 0 |
| balanced-10-5-5-2c | Production | 15 | 3/3 | 0.432 | 2.000 | 7 | 71.60% | 2.67 / 4 | 2.67 / 4 | 2.67 / 4 | 0 | 0 | 0 / 0 |
| balanced-10-5-5-2c | Beneficial rescue | 15 | 3/3 | 0.427 | 1.667 | 4 | 66.67% | 2.00 / 2 | 2.00 / 2 | 2.00 / 2 | 0 | 0 | 0 / 0 |
| balanced-10-5-5-2c | Production | 100 | 3/3 | 0.489 | 2.333 | 13 | 67.94% | 7.33 / 16 | 7.33 / 16 | 7.33 / 16 | 0 | 0 | 0 / 0 |
| balanced-10-5-5-2c | Beneficial rescue | 100 | 3/3 | 0.488 | 2.000 | 7 | 63.28% | 5.00 / 9 | 5.00 / 9 | 5.00 / 9 | 0 | 0 | 0 / 0 |
| balanced-12-6-6-2c | Production | 18 | 3/3 | 0.855 | 3.000 | 4 | 34.38% | 0.67 / 2 | 0.67 / 2 | 0.67 / 2 | 0 | 0 | 0 / 0 |
| balanced-12-6-6-2c | Beneficial rescue | 18 | 3/3 | 0.868 | 3.333 | 4 | 39.58% | 0.67 / 2 | 0.67 / 2 | 0.67 / 2 | 0 | 0 | 0 / 0 |
| balanced-16-8-8-2c | Production | 24 | 3/3 | 1.763 | 4.000 | 5 | 15.08% | 2.00 / 2 | 2.00 / 2 | 2.00 / 2 | 0 | 0 | 3 / 3 |
| balanced-16-8-8-2c | Beneficial rescue | 24 | 0/3 | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved |
| balanced-16-8-8-2c | Production | 100 | 3/3 | 1.937 | 4.000 | 6 | 13.06% | 1.67 / 3 | 1.67 / 3 | 1.67 / 3 | 0 | 0 | 3 / 3 |
| balanced-16-8-8-2c | Beneficial rescue | 100 | 0/3 | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved |
| balanced-18-9-9-3c | Production | 27 | 3/3 | 1.282 | 3.667 | 6 | 27.55% | 2.00 / 2 | 2.00 / 2 | 2.00 / 2 | 0 | 0 | 3 / 3 |
| balanced-18-9-9-3c | Beneficial rescue | 27 | 0/3 | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved |
| edge-14-11-3-2c | Production | 21 | 3/3 | 1.314 | 4.000 | 6 | 27.48% | 1.67 / 3 | 1.67 / 3 | 1.67 / 3 | 0 | 0 | 0 / 0 |
| edge-14-11-3-2c | Beneficial rescue | 21 | 3/3 | 1.330 | 4.000 | 7 | 30.63% | 1.67 / 3 | 1.67 / 3 | 1.67 / 3 | 0 | 0 | 0 / 0 |
| edge-8-8-0-2c | Production | 12 | 3/3 | 0.000 | 0.000 | 0 | 100.00% | 2.67 / 4 | 2.67 / 4 | 2.67 / 4 | 0 | 0 | 0 / 0 |
| edge-8-8-0-2c | Beneficial rescue | 12 | 3/3 | 0.000 | 0.000 | 0 | 100.00% | 2.67 / 4 | 2.67 / 4 | 2.67 / 4 | 0 | 0 | 0 / 0 |
| edge-6-3-3-1c | Production | 9 | 3/3 | 0.444 | 1.000 | 2 | 56.67% | 0.00 / 0 | 0.00 / 0 | 0.00 / 0 | 0 | 0 | 0 / 0 |
| edge-6-3-3-1c | Beneficial rescue | 9 | 3/3 | 0.444 | 1.000 | 1 | 53.33% | 0.00 / 0 | 0.00 / 0 | 0.00 / 0 | 0 | 0 | 0 / 0 |
| dynamic-arrival-12-6-6-to-14-after-8 | Production | 21 | 3/3 | 1.133 | 4.000 | 5 | 28.83% | 2.33 / 3 | 2.33 / 3 | 1.33 / 2 | 0 | 0 | 0 / 0 |
| dynamic-arrival-12-6-6-to-14-after-8 | Beneficial rescue | 21 | 3/3 | 1.121 | 4.000 | 6 | 34.68% | 2.33 / 3 | 2.33 / 3 | 1.33 / 2 | 0 | 0 | 0 / 0 |
| dynamic-arrival-12-6-6-to-14-after-8 | Production | 100 | 3/3 | 1.417 | 3.667 | 6 | 21.71% | 3.33 / 4 | 3.33 / 4 | 2.67 / 4 | 0 | 0 | 0 / 0 |
| dynamic-arrival-12-6-6-to-14-after-8 | Beneficial rescue | 100 | 3/3 | 1.417 | 3.667 | 6 | 23.68% | 3.33 / 4 | 3.33 / 4 | 2.67 / 4 | 0 | 0 | 0 / 0 |
| dynamic-feasibility-10-3-to-10-4-after-8 | Production | 21 | 3/3 | 1.227 | 4.000 | 5 | 30.63% | 1.33 / 2 | 1.33 / 2 | 1.33 / 2 | 0 | 0 | 0 / 0 |
| dynamic-feasibility-10-3-to-10-4-after-8 | Beneficial rescue | 21 | 3/3 | 1.220 | 4.333 | 5 | 35.14% | 2.00 / 2 | 2.00 / 2 | 1.33 / 2 | 0 | 0 | 0 / 0 |
| dynamic-pause-resume-14-7-7-p1-at-6-12 | Production | 21 | 3/3 | 1.239 | 3.333 | 4 | 28.38% | 1.67 / 3 | 1.67 / 3 | 1.33 / 3 | 0 | 0 | 0 / 0 |
| dynamic-pause-resume-14-7-7-p1-at-6-12 | Beneficial rescue | 21 | 3/3 | 1.239 | 4.000 | 4 | 32.88% | 2.00 / 3 | 2.00 / 3 | 1.33 / 3 | 0 | 0 | 0 / 0 |
| dynamic-pause-resume-14-7-7-p1-at-6-12 | Production | 100 | 3/3 | 1.444 | 4.000 | 6 | 21.45% | 2.67 / 4 | 2.67 / 4 | 2.67 / 4 | 0 | 0 | 0 / 0 |
| dynamic-pause-resume-14-7-7-p1-at-6-12 | Beneficial rescue | 100 | 3/3 | 1.445 | 4.000 | 6 | 22.05% | 2.67 / 4 | 2.67 / 4 | 2.67 / 4 | 0 | 0 | 0 / 0 |
| dynamic-played-departure-as-pause-14-10-4-p14-after-8 | Production | 21 | 3/3 | 1.197 | 3.333 | 8 | 26.58% | 4.00 / 5 | 2.00 / 2 | 2.00 / 2 | 0 | 0 | 0 / 0 |
| dynamic-played-departure-as-pause-14-10-4-p14-after-8 | Beneficial rescue | 21 | 3/3 | 1.174 | 3.333 | 6 | 34.23% | 4.67 / 6 | 1.67 / 2 | 1.67 / 2 | 0 | 0 | 0 / 0 |
| dynamic-played-departure-as-pause-14-10-4-p14-after-8 | Production | 100 | 3/3 | 1.238 | 3.333 | 13 | 24.02% | 29.00 / 29 | 4.67 / 8 | 4.67 / 8 | 0 | 0 | 0 / 0 |
| dynamic-played-departure-as-pause-14-10-4-p14-after-8 | Beneficial rescue | 100 | 3/3 | 1.235 | 3.000 | 13 | 26.67% | 30.00 / 33 | 5.00 / 9 | 5.00 / 9 | 0 | 0 | 0 / 0 |
| dynamic-pause-resume-14-10-4-p14-at-8-14 | Production | 21 | 3/3 | 1.254 | 3.667 | 7 | 26.58% | 1.33 / 2 | 1.33 / 2 | 1.33 / 2 | 0 | 0 | 0 / 0 |
| dynamic-pause-resume-14-10-4-p14-at-8-14 | Beneficial rescue | 21 | 3/3 | 1.231 | 3.333 | 6 | 33.33% | 1.67 / 3 | 1.67 / 3 | 1.33 / 2 | 0 | 0 | 0 / 0 |

## Selected 100-match recurrence

| Scenario | Arm | Reached seeds | Mean T | T events 76–100 | Both-type coverage | Full C reached seeds / mean first event | Worst personal single-type run | MIXED / OWN_SIDE | Worst rest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| fixed-14-8-6-2c | Production | 3/3 | 1.0000 | 0.9790 | 100.0% | 3/3 / 53.7 | 10 | 168/132 | 6 |
| fixed-14-8-6-2c | Beneficial rescue | 3/3 | 0.9881 | 0.9905 | 97.6% | 3/3 / 32.3 | 9 | 167/133 | 6 |
| fixed-14-10-4-2c | Production | 3/3 | 0.9405 | 0.9129 | 88.1% | 3/3 / 50.0 | 16 | 143/157 | 6 |
| fixed-14-10-4-2c | Beneficial rescue | 3/3 | 0.9762 | 0.9743 | 95.2% | 3/3 / 31.3 | 8 | 140/160 | 6 |
| balanced-10-5-5-2c | Production | 3/3 | 0.5000 | 0.5000 | 0.0% | 2/3 / 35.5 | 48 | 200/100 | 13 |
| balanced-10-5-5-2c | Beneficial rescue | 3/3 | 0.5000 | 0.5000 | 0.0% | 3/3 / 52.3 | 44 | 300/0 | 7 |
| balanced-16-8-8-2c | Production | 3/3 | 0.9479 | 0.9746 | 89.6% | 3/3 / 63.0 | 13 | 165/135 | 6 |
| balanced-16-8-8-2c | Beneficial rescue | 0/3 | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved | not achieved |
| dynamic-arrival-12-6-6-to-14-after-8 | Production | 3/3 | 0.7619 | 0.9529 | 52.4% | 3/3 / 56.0 | 11 | 211/89 | 6 |
| dynamic-arrival-12-6-6-to-14-after-8 | Beneficial rescue | 3/3 | 0.9643 | 0.9852 | 92.9% | 3/3 / 45.0 | 10 | 203/97 | 6 |
| dynamic-pause-resume-14-7-7-p1-at-6-12 | Production | 3/3 | 0.6548 | 0.8586 | 31.0% | 3/3 / 41.7 | 13 | 208/92 | 6 |
| dynamic-pause-resume-14-7-7-p1-at-6-12 | Beneficial rescue | 3/3 | 0.9286 | 0.9481 | 85.7% | 3/3 / 33.3 | 10 | 187/113 | 6 |
| dynamic-played-departure-as-pause-14-10-4-p14-after-8 | Production | 3/3 | 0.7381 | 0.7438 | 47.6% | 0/3 / — | 31 | 127/173 | 13 |
| dynamic-played-departure-as-pause-14-10-4-p14-after-8 | Beneficial rescue | 3/3 | 0.7738 | 0.7590 | 54.8% | 0/3 / — | 30 | 124/176 | 13 |

## Dynamic roster events

This table condenses repeated seed/arm event traces. Pauses preserve structural vocabulary; joins show any vocabulary change for existing or new players. Full per-seed before/after evidence remains in the raw reports.

| Scenario | Event / user | Type | Application status | Scheduled / applied after | First assignment after | Vocabulary change | Credit change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| dynamic-arrival-12-6-6-to-14-after-8 | 0: P13, P14 | join | applied | 8 / 8 | P13@8, P14@8, P14@9 | P13:new→MIXED+OWN_SIDE; P14:new→MIXED+OWN_SIDE | P13:0→1, P14:0→1, P13:0→2, P14:0→2 |
| dynamic-feasibility-10-3-to-10-4-after-8 | 0: P14 | join | applied | 8 / 8 | P14@8, P14@9 | P11:MIXED→MIXED+OWN_SIDE; P12:MIXED→MIXED+OWN_SIDE; P13:MIXED→MIXED+OWN_SIDE; P14:new→MIXED+OWN_SIDE | P14:0→0, P14:0→1 |
| dynamic-pause-resume-14-7-7-p1-at-6-12 | 0: P1 | pause | applied | 6 / 9, 6, 8 | not observed | no structural vocabulary change | none |
| dynamic-pause-resume-14-7-7-p1-at-6-12 | 1: P1 | resume | applied | 12 / 12 | P1@12 | no structural vocabulary change | P1:0→0, P1:0→1, P1:0→2 |
| dynamic-played-departure-as-pause-14-10-4-p14-after-8 | 0: P14 | pause | applied | 8 / 8, 11 | not observed | no structural vocabulary change | none |
| dynamic-pause-resume-14-10-4-p14-at-8-14 | 0: P14 | pause | applied | 8 / 8, 11 | not observed | no structural vocabulary change | none |
| dynamic-pause-resume-14-10-4-p14-at-8-14 | 1: P14 | resume | applied | 14 / 14 | P14@14 | no structural vocabulary change | P14:0→0, P14:0→2 |

## Completed one-pair cost audit

A concession is counted only after the full batch completes by the checkpoint. Totals are per scenario, not pooled across changing structural denominators. The detailed 55-row decision ledger is in the linked raw summary.

| Scenario | Horizon | Completed concessions / decisions | Pairs conceded | Σ conditional T | Extra/preserved both-type windows | Positive / zero / negative conditional benefits |
| --- | --- | --- | --- | --- | --- | --- |
| fixed-14-8-6-2c | 21 | 7/60 | 7 pairs | 4.500000 | 9 | 7 positive; 0 zero; 0 negative |
| fixed-14-8-6-2c | 100 | 7/297 | 7 pairs | 4.500000 | 9 | 7 positive; 0 zero; 0 negative |
| fixed-14-9-5-2c | 21 | 5/60 | 5 pairs | 5.000000 | 10 | 5 positive; 0 zero; 0 negative |
| fixed-14-10-4-2c | 21 | 6/60 | 6 pairs | 3.000000 | 6 | 6 positive; 0 zero; 0 negative |
| fixed-14-10-4-2c | 100 | 6/297 | 6 pairs | 3.000000 | 6 | 6 positive; 0 zero; 0 negative |
| balanced-10-5-5-1c | 15 | 3/45 | 3 pairs | 1.500000 | 3 | 3 positive; 0 zero; 0 negative |
| balanced-10-5-5-2c | 15 | 0/42 | 0 pairs | 0.000000 | 0 | 0 positive; 0 zero; 0 negative |
| balanced-10-5-5-2c | 100 | 0/297 | 0 pairs | 0.000000 | 0 | 0 positive; 0 zero; 0 negative |
| balanced-12-6-6-2c | 18 | 1/51 | 1 pairs | 0.500000 | 1 | 1 positive; 0 zero; 0 negative |
| balanced-16-8-8-2c | 24 | not achieved | not achieved | not achieved | not achieved | not achieved |
| balanced-16-8-8-2c | 100 | not achieved | not achieved | not achieved | not achieved | not achieved |
| balanced-18-9-9-3c | 27 | not achieved | not achieved | not achieved | not achieved | not achieved |
| edge-14-11-3-2c | 21 | 2/60 | 2 pairs | 1.000000 | 2 | 2 positive; 0 zero; 0 negative |
| edge-8-8-0-2c | 12 | 0/33 | 0 pairs | 0.000000 | 0 | 0 positive; 0 zero; 0 negative |
| edge-6-3-3-1c | 9 | 0/27 | 0 pairs | 0.000000 | 0 | 0 positive; 0 zero; 0 negative |
| dynamic-arrival-12-6-6-to-14-after-8 | 21 | 4/60 | 4 pairs | 3.000000 | 6 | 4 positive; 0 zero; 0 negative |
| dynamic-arrival-12-6-6-to-14-after-8 | 100 | 11/297 | 11 pairs | 8.500000 | 17 | 11 positive; 0 zero; 0 negative |
| dynamic-feasibility-10-3-to-10-4-after-8 | 21 | 0/60 | 0 pairs | 0.000000 | 0 | 0 positive; 0 zero; 0 negative |
| dynamic-pause-resume-14-7-7-p1-at-6-12 | 21 | 6/60 | 6 pairs | 3.500000 | 7 | 6 positive; 0 zero; 0 negative |
| dynamic-pause-resume-14-7-7-p1-at-6-12 | 100 | 10/297 | 10 pairs | 6.000000 | 12 | 10 positive; 0 zero; 0 negative |
| dynamic-played-departure-as-pause-14-10-4-p14-after-8 | 21 | 4/60 | 4 pairs | 2.000000 | 4 | 4 positive; 0 zero; 0 negative |
| dynamic-played-departure-as-pause-14-10-4-p14-after-8 | 100 | 6/297 | 6 pairs | 3.000000 | 6 | 6 positive; 0 zero; 0 negative |
| dynamic-pause-resume-14-10-4-p14-at-8-14 | 21 | 4/60 | 4 pairs | 2.000000 | 4 | 4 positive; 0 zero; 0 negative |

Overall: 55 completed concessions from 55 started costs; 0 pending; exact conditional-T sum 35/1 (= 35.000000); 70 additional/preserved windows; zero-benefit 0, negative-benefit 0.

## Preserved canonical four-arm reference at 21 matches

Historical 7/7 reference from [the beneficial-rescue experiment report](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/docs/social-courtmate-beneficial-rescue-experiment.md). These values are context only, not pooled with the generalization scenarios.

| Policy | Mean C | Mean C coverage | Mean T | Both-type players | MIXED / OWN_SIDE | B2B rate | Mean rest | Mean p95 | Max rest | Completed one-pair costs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Production | 10.629 | 81.758% | 0.9786 | 67/70 | 69 / 36 | 23.14% | 1.4629 | 4.0 | 5 | 0 |
| Strict courtmate-first | 11.086 | 85.275% | 0.9000 | 56/70 | 79 / 26 | 28.29% | 1.4657 | 4.0 | 4 | 0 |
| Near-best rescue | 10.829 | 83.297% | 0.9929 | 69/70 | 76 / 29 | 27.71% | 1.4714 | 4.0 | 4 | 16 |
| Beneficial rescue | 11.057 | 85.055% | 1.0000 | 70/70 | 75 / 30 | 27.43% | 1.4600 | 3.8 | 4 | 9 |

## Concessions near saturation

The last one-pair cost started after completion 37; none occurred after 50 or 75 in the selected 100-match runs. Every admitted concession lost exactly one pair and had strictly positive conditional benefit. Dynamic vocabulary changes and in-flight assignment snapshots prevent a general endpoint telescoping identity; local benefit totals are not causal endpoint improvements. The complete decision ledger is [all-one-pair-concessions.csv](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-generalization/full-2026-10-06-v1/all-one-pair-concessions.csv).

## Provenance, validation, and limits

| Item | Recorded value |
| --- | --- |
| Manifest | [social-generalization-run-manifest.json](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-generalization/full-2026-10-06-v1/social-generalization-run-manifest.json) |
| Commit | 973081e7120bfd78f7c3808360aa37344b18e051 |
| Dirty at capture | true |
| Engine SHA-256 | c59a8092e4b2d1870a9cff1de2d47fc1b0f3aa95e7ec20ce59dc840c28ae00c4 |
| Measurement SHA-256 | e026ad046e38dfbba0f2ebac78fb574f0c6eded37b550be6731340b3fece7dbd |
| Reference reports SHA-256 | 1686d32a99e05e0675b098f1906e3c39828ab388b5fca8a2818073f833f5a0d3 |
| Seeds | 1, 4729, 104729 |
| Sessions complete | 90/96 |
| Tests | 418 passed; 11 skipped; 0 failed |
| TypeScript / targeted lint | passed |
| Validator corruption fixtures | 5 rejected |

The 96-session measurement is limited to three seeds per scenario and stable player strengths. Production completed 48/48 sessions; the candidate completed 42/48. All 974 applicable no-starvation counterfactuals certified (607 production, 367 candidate); the selected-set change counts were 123 and 47. Production had six incomplete exhaustive G/T opening audits with analytical safety certificates; every candidate decision in sessions that reached selection had a complete objective audit.

The candidate is not a production default recommendation. Further work should address the default-budget opening frontier without changing the objective or shrinking the structural denominator for busy players. The paused-player semantics and finite 100-match horizon limit recurrence claims. No production policy change, migration, or deployment was made.

Summary JSON: [summary.json](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-generalization/full-2026-10-06-v1/summary.json). Checkpoint CSV: [social-beneficial-rescue-generalization-checkpoint-metrics.csv](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/docs/social-beneficial-rescue-generalization-checkpoint-metrics.csv). The report does not claim universal type recurrence.
