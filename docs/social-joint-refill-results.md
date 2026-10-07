# Social joint-refill results

**The 12-player / 3-court run is an extreme low-reserve stress scenario — 4 players per court.** It is retained as evidence about asynchronous topology and is not a primary production-design target; the more realistic 10/2 and 12/2 results should carry more weight when considering normal Anti-Selek sessions.

The 36-session run completed and passed independent trace validation. Across the four roster/court scenarios and three fixed seeds, immediate refill and conditional waiting each completed 100 matches per session: 3,600 completed matches in total. The data supports conditional waiting as a research option when the next completion creates a meaningful joint refill, especially with three courts; its cost is extra simulated idle time, and its benefit varies by roster and seed. These results do not enable the policy by default.

The validated analysis artifact is [the combined summary JSON](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-joint-refill/full-2026-10-07-v1/social-joint-refill-summary-v2.json). It retains every checkpoint and per-seed paired comparison, raw-report hashes, operational counters, and session summaries. Summary v1 remains in the ignored output directory but is superseded: v2 corrects derived type-coverage paths and adds the completed same-four replay audit. The four independently validated raw reports are [8 upper / 0 lower](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-joint-refill/full-2026-10-07-v1/edge-8-8-0-2c.json), [5 upper / 5 lower](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-joint-refill/full-2026-10-07-v1/balanced-10-5-5-2c.json), [6 / 6 on two courts](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-joint-refill/full-2026-10-07-v1/balanced-12-6-6-2c.json), and [6 / 6 on three courts](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-joint-refill/full-2026-10-07-v1/balanced-12-6-6-3c.json). The [run manifest](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-joint-refill/full-2026-10-07-v1/social-joint-refill-run-manifest.json) records the validation status and measurement fingerprints.

The frozen measurement fingerprint was `9903c7260a3c17e960fefbca971d7f3bfeb526d90b8f1ce216c06721af5499cf`; matcher-source fingerprint was `4c0b336d294b273e6d86cd4b99417b07ae4bf9d2e9ed527c10fc10d4cdd7bd5e` (`socialBatch.ts` `3fac6611ba7d116aab040b36e2f5e13b9ddfd1cbdd5d81f43d5051c83294ceb7`, frontier bounds `e03536aaefc90b70b89c4fbd0341a7663740c0f5f1b3ea733ef20c4645c193b0`). The combined analysis script is separately identified as `scripts/summarize-social-joint-refill-experiment.mjs`, SHA-256 `1ec8c75f7027e18685e9e2d13499f7465097f2ee17e0c79dae51f298a6ee897d`; it is a read-only postprocessor and is not part of measurement provenance. The recorded commit was `973081e7120bfd78f7c3808360aa37344b18e051`, with a dirty working tree.

At 100 matches, the largest benefit appears in the six-player-per-side, three-court case. Conditional waiting raised mean distinct courtmates from 3 to 11 of 11 possible, mean rolling-six type coverage from 0.500 to 0.944, and coverage of both feasible types from 0 to 0.889. All 53 waits there refilled two free courts while the third remained busy. The two-court 6 / 6 case had little endpoint change: both arms reached mean `T=1` and full courtmate coverage, while waiting added 0.562 percentage points of idle-court time.

In the 5 / 5, two-court case, a full legal batch cannot combine one OWN_SIDE and one MIXED court: that needs six players on one side. Full batches are either MIXED+MIXED or an upper-side OWN_SIDE match plus a lower-side OWN_SIDE match. Conditional waiting therefore switches between type episodes rather than mixing types within each refill. The beneficial engine with conditional waiting reached mean `T=0.867` and both-type coverage `0.733`, compared with `T=0.500` and `0` under immediate refill. The production engine with conditional waiting reached `T=0.967` and both-type coverage `0.933`. Results varied by seed: for the beneficial conditional arm, `T` was `1.0`, `1.0`, and `0.6` for seeds 1, 4729, and 104729. Seed 104729 had 2 of 10 players at `T=1` and 8 at `T=0.5`; the mean across seeds conceals that late shortfall. Production seed 4729 opened with two OWN_SIDE matches and remained OWN_SIDE-only under immediate refill, while its conditional arm completed 54 MIXED and 46 OWN_SIDE matches. The mean longest single-type run for the beneficial conditional arm fell from 40 appearances under immediate refill to 9.7; its worst seed still had a 12-appearance run. These are observed traces, not a target type ratio.

The eight-player, one-side scenario reached full courtmate coverage in all three conditional runs by completed match 6, 10, and 6, respectively. The conditional mean was already seven distinct courtmates and full courtmate coverage at the 12-match checkpoint, compared with three and 0.429 under immediate refill. All players there have only OWN_SIDE structurally feasible, so `T=1` in both arms does not indicate mixed-type diversity. By match 100, partner/opponent normalized entropy in the beneficial conditional arm averaged 0.617 / 0.652 rather than 1.0, and 282 of 294 completed refill assignments (95.9%) repeated the exact four-player quartet that was most recent for each selected player. The corresponding immediate arm repeated 294 of 294 quartets. Lifetime courtmate coverage therefore did not mean that the schedule kept rotating cohorts after its pair universe was exhausted.

## Endpoint breadth and type coverage

Values are means across the three seeds. Each cell shows immediate refill → conditional wait. `Both` is the share of players with both MIXED and OWN_SIDE structurally feasible who saw both types in their latest six appearances; it is not applicable for the one-side roster.

| Roster / courts | Engine | Courtmates: mean peers / coverage | Partner / opponent coverage | Mean T / T=1 fraction | Both-type coverage | Longest single-type run: mean / worst seed | P / O normalized entropy |
|---|---|---:|---:|---:|---:|---:|---:|
| 8 upper / 0 lower · 2 | Production | 3.00 / 0.429 → 7.00 / 1.000 | 0.429 / 0.429 → 0.714 / 1.000 | 1.000 / 1.000 → 1.000 / 1.000 | N/A → N/A | 50.3 / 51 → 50.3 / 51 | 0.564 / 0.565 → 0.642 / 0.667 |
| 8 upper / 0 lower · 2 | Beneficial | 3.00 / 0.429 → 7.00 / 1.000 | 0.429 / 0.429 → 0.619 / 0.905 | 1.000 / 1.000 → 1.000 / 1.000 | N/A → N/A | 50.3 / 51 → 50.3 / 51 | 0.564 / 0.565 → 0.617 / 0.652 |
| 5 upper / 5 lower · 2 | Production | 7.33 / 0.815 → 9.00 / 1.000 | 0.519 / 0.815 → 1.000 / 1.000 | 0.500 / 0.000 → 0.967 / 0.933 | 0.000 → 0.933 | 40 / 40 → 12.3 / 16 | 0.697 / 0.873 → 0.996 / 0.917 |
| 5 upper / 5 lower · 2 | Beneficial | 9.00 / 1.000 → 9.00 / 1.000 | 0.556 / 1.000 → 1.000 / 1.000 | 0.500 / 0.000 → 0.867 / 0.733 | 0.000 → 0.733 | 40 / 40 → 9.7 / 12 | 0.731 / 0.994 → 0.996 / 0.922 |
| 6 upper / 6 lower · 2 | Beneficial | 11.00 / 1.000 → 11.00 / 1.000 | 1.000 / 0.980 → 0.985 / 0.975 | 1.000 / 1.000 → 1.000 / 1.000 | 1.000 → 1.000 | 7.7 / 10 → 6 / 7 | 0.963 / 0.874 → 0.946 / 0.872 |
| 6 upper / 6 lower · 3 | Beneficial | 3.00 / 0.273 → 11.00 / 1.000 | 0.222 / 0.273 → 0.980 / 0.990 | 0.500 / 0.000 → 0.944 / 0.889 | 0.000 → 0.889 | 34.3 / 35 → 13 / 15 | 0.364 / 0.444 → 0.952 / 0.868 |

## Checkpoint path

The early checkpoint is `round(1.5 × initial roster size)`: 12, 15, or 18 completed matches. The table reports mean courtmate coverage, mean `T`, both-type coverage, and idle-court percentage as immediate → conditional wait. The 50-match and endpoint rows are included so gains that arrive early or persist can be distinguished.

| Roster / courts | Engine | Matches | Courtmate coverage | Mean T | Both-type | Idle % |
|---|---|---:|---:|---:|---:|---:|
| 8 / 2 | Production | 12 | 0.429 → 1.000 | 1.000 → 1.000 | N/A → N/A | 0.000 → 2.425 |
| 8 / 2 | Production | 50 | 0.429 → 1.000 | 1.000 → 1.000 | N/A → N/A | 0.000 → 0.583 |
| 8 / 2 | Production | 100 | 0.429 → 1.000 | 1.000 → 1.000 | N/A → N/A | 0.000 → 0.295 |
| 8 / 2 | Beneficial | 12 | 0.429 → 1.000 | 1.000 → 1.000 | N/A → N/A | 0.000 → 2.105 |
| 8 / 2 | Beneficial | 50 | 0.429 → 1.000 | 1.000 → 1.000 | N/A → N/A | 0.000 → 0.504 |
| 8 / 2 | Beneficial | 100 | 0.429 → 1.000 | 1.000 → 1.000 | N/A → N/A | 0.000 → 0.254 |
| 5 / 5 · 2 | Production | 15 | 0.800 → 0.985 | 0.500 → 1.000 | 0.000 → 1.000 | 0.000 → 2.594 |
| 5 / 5 · 2 | Production | 50 | 0.815 → 1.000 | 0.500 → 0.733 | 0.000 → 0.467 | 0.000 → 1.270 |
| 5 / 5 · 2 | Production | 100 | 0.815 → 1.000 | 0.500 → 0.967 | 0.000 → 0.933 | 0.000 → 1.095 |
| 5 / 5 · 2 | Beneficial | 15 | 1.000 → 0.985 | 0.500 → 1.000 | 0.000 → 1.000 | 0.000 → 2.655 |
| 5 / 5 · 2 | Beneficial | 50 | 1.000 → 1.000 | 0.500 → 0.917 | 0.000 → 0.833 | 0.000 → 1.626 |
| 5 / 5 · 2 | Beneficial | 100 | 1.000 → 1.000 | 0.500 → 0.867 | 0.000 → 0.733 | 0.000 → 1.297 |
| 6 / 6 · 2 | Beneficial | 18 | 0.939 → 0.980 | 1.000 → 0.986 | 1.000 → 0.972 | 0.000 → 1.758 |
| 6 / 6 · 2 | Beneficial | 50 | 1.000 → 1.000 | 1.000 → 1.000 | 1.000 → 1.000 | 0.000 → 0.855 |
| 6 / 6 · 2 | Beneficial | 100 | 1.000 → 1.000 | 1.000 → 1.000 | 1.000 → 1.000 | 0.000 → 0.562 |
| 6 / 6 · 3 | Beneficial | 18 | 0.273 → 0.697 | 0.500 → 0.944 | 0.000 → 0.889 | 0.000 → 3.025 |
| 6 / 6 · 3 | Beneficial | 50 | 0.273 → 0.965 | 0.500 → 0.944 | 0.000 → 0.889 | 0.000 → 2.654 |
| 6 / 6 · 3 | Beneficial | 100 | 0.273 → 1.000 | 0.500 → 0.944 | 0.000 → 0.889 | 0.000 → 2.158 |

## Time, rest, and fairness at 100

| Roster / courts | Engine | Simulated elapsed minutes | Idle-court time | Mean refill delay | Back-to-back rate / eligible denominator | Mean count spread | Mean assignment rest turns | Mean elapsed rest minutes |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| 8 / 2 | Production | 993.841 → 996.519 | 0.000% → 0.295% | 0.000 → 0.059 min | 100.0% / 392 → 97.3% / 392 | 0.667 → 0.667 | 0.000 → 0.027 | 0.000 → 0.060 |
| 8 / 2 | Beneficial | 993.841 → 996.021 | 0.000% → 0.254% | 0.000 → 0.051 min | 100.0% / 392 → 98.0% / 392 | 0.667 → 0.667 | 0.000 → 0.020 | 0.000 → 0.052 |
| 5 / 5 · 2 | Production | 993.841 → 1006.512 | 0.000% → 1.095% | 0.000 → 0.223 min | 59.7% / 390 → 57.9% / 390 | 0.000 → 1.333 | 0.496 → 0.584 | 4.905 → 5.158 |
| 5 / 5 · 2 | Beneficial | 993.841 → 1006.898 | 0.000% → 1.297% | 0.000 → 0.264 min | 51.6% / 390 → 57.1% / 390 | 0.000 → 1.333 | 0.497 → 0.593 | 4.908 → 5.218 |
| 6 / 6 · 2 | Beneficial | 993.841 → 1000.875 | 0.000% → 0.562% | 0.000 → 0.114 min | 13.9% / 388 → 13.8% / 388 | 1.000 → 1.000 | 1.000 → 1.048 | 9.867 → 10.056 |
| 6 / 6 · 3 | Beneficial | 673.006 → 685.431 | 0.000% → 2.158% | 0.000 → 0.448 min | 100.0% / 388 → 81.8% / 388 | 2.000 → 2.333 | 0.000 → 0.182 | 0.000 → 0.457 |

The back-to-back column is the mean of the three per-seed rates; its denominator is the mean number of eligible post-first player appearances per seed, shown after the slash. Match-count spread is the per-seed maximum minus minimum number of completed appearances; the table shows its across-seed mean. Elapsed rest is simulated time from one player's previous match finish to that player's next assignment start, not a wall-clock observation. The longest-run column counts consecutive appearances of one type for any player in the session; it is a finite-history diagnostic, not an extinction proof.

| Roster / courts | Engine | Worst count spread | Mean per-seed p95 / worst rest turns | Mean per-seed p95 / worst elapsed rest minutes |
|---|---|---:|---:|---:|
| 8 / 2 | Production | 2 → 2 | 0.00 / 0 → 0.00 / 1 | 0.00 / 0.00 → 0.00 / 4.52 |
| 8 / 2 | Beneficial | 2 → 2 | 0.00 / 0 → 0.00 / 1 | 0.00 / 0.00 → 0.00 / 4.52 |
| 5 / 5 · 2 | Production | 0 → 2 | 1.33 / 3 → 2.00 / 3 | 19.04 / 23.97 → 21.59 / 34.66 |
| 5 / 5 · 2 | Beneficial | 0 → 2 | 1.00 / 2 → 2.00 / 3 | 18.09 / 22.63 → 21.83 / 27.37 |
| 6 / 6 · 2 | Beneficial | 1 → 1 | 2.00 / 3 → 2.00 / 3 | 20.72 / 23.27 → 21.28 / 27.14 |
| 6 / 6 · 3 | Beneficial | 3 → 4 | 0.00 / 0 → 1.00 / 1 | 0.00 / 0.00 → 3.82 / 5.00 |

The two rest cells show `mean of per-seed p95 / worst seed-level maximum`, immediate → conditional wait.

## Paired scheduler changes

Each row is the mean of three seed-paired differences, conditional wait minus immediate refill. Signed values are retained. Idle and back-to-back deltas are percentage points; `Δ P/O` is the mean of partner- and opponent-coverage deltas. The JSON contains all per-seed comparisons.

| Roster / courts | Engine | Matches | Δ elapsed min | Δ idle pp | Δ C coverage | Δ P/O coverage | Δ mean T | Δ both-type | Δ B2B pp | Δ count spread | Δ rest turns | Δ elapsed rest min |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 8 / 2 | Production | 12 | 3.584 | 2.425 | 0.571 | 0.429 | 0.000 | N/A | -26.667 | 0.000 | 0.267 | 0.589 |
| 8 / 2 | Production | 100 | 2.678 | 0.295 | 0.571 | 0.429 | 0.000 | N/A | -2.721 | 0.000 | 0.027 | 0.060 |
| 8 / 2 | Beneficial | 12 | 3.265 | 2.105 | 0.571 | 0.333 | 0.000 | N/A | -20.000 | 0.000 | 0.200 | 0.507 |
| 8 / 2 | Beneficial | 100 | 2.181 | 0.254 | 0.571 | 0.333 | 0.000 | N/A | -2.041 | 0.000 | 0.020 | 0.052 |
| 5 / 5 · 2 | Production | 15 | 4.898 | 2.594 | 0.185 | 0.156 | 0.500 | 1.000 | -18.000 | 0.000 | 0.293 | 0.869 |
| 5 / 5 · 2 | Production | 100 | 12.671 | 1.095 | 0.185 | 0.333 | 0.467 | 0.933 | -1.795 | 1.333 | 0.088 | 0.253 |
| 5 / 5 · 2 | Beneficial | 15 | 4.898 | 2.655 | -0.015 | 0.037 | 0.500 | 1.000 | -6.667 | 1.333 | 0.300 | 0.701 |
| 5 / 5 · 2 | Beneficial | 100 | 13.057 | 1.297 | 0.000 | 0.222 | 0.367 | 0.733 | 5.470 | 1.333 | 0.096 | 0.310 |
| 6 / 6 · 2 | Beneficial | 18 | 1.718 | 1.758 | 0.040 | 0.018 | -0.014 | -0.028 | -3.333 | 0.000 | 0.172 | 0.444 |
| 6 / 6 · 2 | Beneficial | 100 | 7.034 | 0.562 | 0.000 | -0.010 | 0.000 | 0.000 | -0.086 | 0.000 | 0.048 | 0.189 |
| 6 / 6 · 3 | Beneficial | 18 | 0.971 | 3.025 | 0.424 | 0.265 | 0.444 | 0.889 | -26.667 | 0.000 | 0.267 | 0.720 |
| 6 / 6 · 3 | Beneficial | 100 | 12.425 | 2.158 | 0.727 | 0.737 | 0.444 | 0.889 | -18.213 | 0.333 | 0.182 | 0.457 |

## Waits, certificates, and per-seed traces

| Conditional-wait cohort | Waits taken / seeds | Declined: forecast over 5 min | Declined: no material gain | Accepted two-court refill with third busy |
|---|---:|---:|---:|---:|
| 8 / 2 · Production | 8 / 3 | 211 | 67 | 0 |
| 8 / 2 · Beneficial | 6 / 3 | 211 | 71 | 0 |
| 5 / 5 · Production | 28 / 3 | 190 | 49 | 0 |
| 5 / 5 · Beneficial | 30 / 3 | 177 | 57 | 0 |
| 6 / 6 · 2 courts · Beneficial | 14 / 3 | 189 | 77 | 0 |
| 6 / 6 · 3 courts · Beneficial | 53 / 3 | 121 | 67 | 53 |

Across the grid, there were 3,461 actual matcher calls, 3,461 immediate previews, and 1,626 future previews. Every call/preview was certified and accepted where executed; all reported search-limit counts were zero. Selection, court-count, fairness, starvation, replay, and coverage-certificate booleans were true on the recorded previews and executions. The beneficial engine also certified Gmax and priority on every one of its 2,297 actual calls. Those fields are not applicable to production. Its coverage-gate status is intentionally DISABLED; the reported boolean is not evidence that the production gate ran. Production's raw `reportedVarietyOptimal` flag was true on all 1,164 executed production batches, with zero false or missing values.

Conditional arms declined 401 production and 698 beneficial previews because the next-completion forecast exceeded five minutes, and declined 116 and 272, respectively, for no material gain. Current/future uncertified declines and rejected executions were zero. There were 36 production waits and 103 beneficial waits in all conditional sessions. In the 12-player, three-court case each of the 53 waits filled exactly the two newly available courts while one physical court remained busy; the trace's remaining-busy list had one court at every such refill.

The per-seed opening court-type patterns were stable across the two schedulers within an engine. All 8/0 sessions opened OWN_SIDE+OWN_SIDE. In 5/5, production seeds 1 and 104729 opened MIXED+MIXED, while seed 4729 opened OWN_SIDE+OWN_SIDE; all beneficial runs opened MIXED+MIXED. In 6/6 on two courts, seed 1 opened MIXED+MIXED and seeds 4729 and 104729 opened OWN_SIDE+OWN_SIDE. The three-court openings were, respectively, OWN_SIDE+OWN_SIDE+MIXED, MIXED+MIXED+MIXED, and MIXED+OWN_SIDE+OWN_SIDE.

The completed-refill same-four replay rate uses only completed assignments after each court's opening. An assignment counts when the exact selected quartet matches the latest completed quartet for each selected player, using the player's `priorMatchesPlayed` snapshot to take the correct completed-history prefix at assignment time. Among the three seeds combined, conditional-wait replay rates were 94.6% (production) and 95.9% (beneficial) for 8/0, 0.7% and 0.3% for 5/5, 56.5% for 6/6 on two courts, and 63.6% for 6/6 on three courts. Corresponding immediate rates were 100%, 100%, 1.7%, 2.7%, 60.9%, and 100%. The 12/3 reduction reflects two-court refills changing completed groupings while the third court continued its assignment; the 8/0 result shows that full pair coverage can coexist with repeated use of the same four-player cohorts.

## Interpretation limits

The cohorts are three fixed seeds per scenario and a 100-completion cap. Simulated match durations are seeded uniformly by physical court from 16 to 24 minutes; these are scenario clocks, not observed venue elapsed time. The protocol's wait rule forecasts only the next completion group, caps a wait at five minutes, and requires certified current and future previews. A wait occurs if either forecast gain threshold is met: at least one new courtmate pair per refilled court or at least 0.5 signed rolling-six type gain per court.

`T` counts how many of a player's structurally feasible types appear in the latest six appearances. It does not enforce a 50/50 match-type frequency. Players unavailable because they are busy/resting remain in the structural denominator. Checkpoints compute structural scores only; the opportunity score is null. No players were paused in these runs. Pair coverage is lifetime coverage and can saturate early. Entropy, rolling type coverage, same-four replay, and rest provide evidence about what repeated scheduling looks like after that point; none of these finite runs proves permanent match-type extinction or generalizes to other rosters and timing distributions.

The experiment knows each simulated court's next finish time from the fixed seed and duration stream. A live service would have to estimate that next completion group and validate the estimate; these results do not measure forecasting error.
