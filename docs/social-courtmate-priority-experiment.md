# Social courtmate priority experiment — 6 October 2026

The candidate improves early average courtmate breadth, but it does not improve both variety goals at the primary 21-match checkpoint. Recent match-type coverage falls from 95.7% to 80.0% of players. At 100 matches, both policies have complete courtmate coverage and the candidate has better recent type coverage. Keep the policy experimental: these results do not justify changing production yet.

The experiment stops at **100 completed matches**. The primary checkpoint is 21; 100 is a secondary diagnostic. No 400-match simulation was run for this experiment. This experiment supersedes the earlier four-arm scoring plan.

**Scenario and policy**

Latest `origin/main` was pulled before implementation; it was already current at `973081e7120bfd78f7c3808360aa37344b18e051`. The benchmark uses 14 players, seven on each mixed side, two courts with asynchronous completion, and paired seeds `1`, `4729`, `104729`, `130363`, `2097593`. Each policy produces five 100-match sessions. Only Social/MIXICANO is measured.

The candidate is enabled only through `socialPriorityPolicy: "courtmate-first"`. The default Social path remains active without that option; Balanced Points/Elo rejects the option. The candidate preserves legal whole-batch search, playing-time/arrival fairness and schedule precedence. Its objective order within that infrastructure is:

1. Preserve the existing fairness/arrival and schedule class, with the existing excessive-wait safety comparison.
2. Maximize new unordered courtmate pairs from completed history.
3. At equal raw courtmate gain, maximize the ascending per-player coverage profile lexicographically: improve the least-covered player first, then the next least-covered player.
4. Maximize the signed change in recent feasible match-type coverage.
5. Minimize immediate replays, then apply ordinary soft cadence.
6. Maximize new partner pairs, then new opponent pairs, then relationship entropy and existing repeat-quality tie-breakers.
7. Apply balance/points and randomness as late tie-breakers.

One fresh doubles match creates six courtmate pairs, two partner pairs and four opponent pairs. Coverage uses all 13 structurally feasible other players in this roster. Busy/paused state and the current scheduling profile do not reduce that vocabulary. The implementation supports uncapped structural opportunity counts; 13 is this roster's size, not a score cap.

For each player, `T = distinct feasible types in the latest six completed appearances / number of feasible types`. Both MIXED and OWN_SIDE are feasible here. A 5:1 window and a 3:3 window both have `T=1`; a single-type window has `T=0.5`. Candidate scoring includes losses when a type expires from the window. There are no ratio targets, quotas or debts.

The candidate disables the production minimum-replay/+1 admission envelope and its coverage gate, so ordinary replay comfort cannot exclude a higher-courtmate candidate. It retains the existing starvation vector before variety: minimize overdue available players left out, then the highest and total rest of those players. In this 14-player scenario the ideal rest gap is three; only an available player above three enters that safety comparison. Ordinary differences below that threshold remain after C and T. This preserves the existing event-based protection; it is not a new universal waiting guarantee under arbitrary incompatible constraints.

**Primary result: 21 completed matches**

Unless marked otherwise, values are means over five seeds. Percentages of fully covered players pool 70 player/session observations. “Mean session minimum” averages each session's worst player; “worst observed” takes the worst across all five sessions.

| Metric | Production baseline | Candidate |
|---|---:|---:|
| Average distinct courtmates/player | 10.63 | 11.09 |
| Average courtmate coverage | 81.76% | 85.27% |
| Mean session minimum distinct courtmates | 8.4 | 8.6 |
| Mean session worst-player coverage | 64.62% | 66.15% |
| Worst observed distinct courtmates | 7 | 7 |
| Players with all 13 courtmates, per session | 0.8 | 1.6 |
| Unique unordered courtmate pairs, out of 91 | 74.4 | 77.6 |
| Players with both types in their recent window | 67/70 (95.71%) | 56/70 (80.00%) |
| Mean recent T | 0.9786 | 0.9000 |
| MIXED / OWN_SIDE matches, per session | 13.8 / 7.2 | 15.8 / 5.2 |
| Back-to-back assignments | 81/350 (23.14%) | 99/350 (28.29%) |
| Mean assignment rest | 1.463 events | 1.466 events |
| Assignment rest p95, every seed | 4 events | 4 events |
| Maximum assignment rest, worst seed | 5 events | 4 events |
| Longest other-completion gap between appearances | 9 events | 8 events |
| Material starvation interventions, all seeds | 3 | 7 |
| Mean completed-match count spread | 0.4 | 0.4 |
| Fairness certificate failures | 0 | 0 |

The candidate wins average breadth in three seeds, ties one and loses one. Its minimum breadth improves in three seeds and worsens in two. Thus the equal-gain equity rule helps choose among tied batches, but does not guarantee a better worst-player result over the full session. Recent type coverage ties in three seeds and worsens in two; it improves in none at 21.

| Seed | Average courtmates B → C | Minimum courtmates B → C | Both recent types B → C | MIXED/OWN_SIDE B → C |
|---|---:|---:|---:|---|
| 1 | 10.29 → 10.86 | 8 → 7 | 13/14 → 13/14 | 15/6 → 13/8 |
| 4729 | 9.43 → 10.00 | 7 → 8 | 14/14 → 8/14 | 11/10 → 19/2 |
| 104729 | 11.29 → 11.29 | 9 → 10 | 13/14 → 8/14 | 15/6 → 19/2 |
| 130363 | 11.43 → 11.29 | 9 → 8 | 13/14 → 13/14 | 17/4 → 13/8 |
| 2097593 | 10.71 → 12.00 | 9 → 10 | 14/14 → 14/14 | 11/10 → 15/6 |

In candidate seed 4729, P1/P4/P5/P8/P10/P12 have `MMMMMM` at 21. In seed 104729, P1/P4/P5/P8/P9/P12 have `MMMMMM`. This is the concrete early tradeoff: absolute marginal courtmate priority can keep creating new relationships while a feasible match type remains absent from a player's recent experience.

**Fairness distributions**

The two policies have the same completed-count histogram in each seed at both checkpoints. `5×4` means four players have completed five matches. All 500 candidate selection decisions are independently certified against the fairness and objective order; there are no ranking discrepancies or search-limit failures. Completed-count spread can temporarily widen while one court remains busy; the comparison retains the existing asynchronous fairness rules.

| Seed | 21-match histogram, both policies | 100-match histogram, both policies | Maximum prefix count spread, through 100 |
|---|---|---|---:|
| 1 | 5×4, 6×6, 7×4 | 27×4, 29×8, 30×2 | 5 |
| 4729 | 6×14 | 26×4, 29×4, 30×6 | 6 |
| 104729 | 6×14 | 28×6, 29×8 | 3 |
| 130363 | 6×14 | 28×6, 29×8 | 3 |
| 2097593 | 6×14 | 28×6, 29×8 | 4 |

**Secondary result: 100 completed matches**

| Metric | Production baseline | Candidate |
|---|---:|---:|
| Average and minimum distinct courtmates/player | 13 / 13 | 13 / 13 |
| Full courtmate coverage | 70/70 players; 91/91 pairs every seed | 70/70 players; 91/91 pairs every seed |
| Mean event of complete roster coverage | 44.2 | 40.4 |
| Players with both recent types at 100 | 53/70 (75.71%) | 65/70 (92.86%) |
| Mean recent T at 100 | 0.8786 | 0.9643 |
| Mean T over events 76–100 | 0.9220 | 0.9497 |
| MIXED / OWN_SIDE matches, per session | 61.8 / 38.2 | 63.8 / 36.2 |
| Back-to-back assignments | 418/1930 (21.66%) | 451/1930 (23.37%) |
| Assignment rest p95, every seed | 4 events | 4 events |
| Maximum assignment rest | 6 events | 6 events |
| Longest other-completion gap between appearances | 16 events | 15 events |
| Material starvation interventions, all seeds | 18 | 17 |
| Longest run missing one feasible type, own appearances | 20 | 16 |
| Longest trailing run missing one feasible type at 100 | 12 | 9 |
| Final-50 average distinct courtmates/player | 11.94 | 11.89 |
| Final-50 mean session minimum distinct courtmates | 10.2 | 10.4 |

| Seed | All courtmate pairs covered at event B → C | Both recent types at 100 B → C | Final 25 MIXED/OWN_SIDE B → C | Final 50 MIXED/OWN_SIDE B → C |
|---|---:|---:|---|---|
| 1 | 36 → 38 | 12/14 → 14/14 | 12/13 → 12/13 | 23/27 → 23/27 |
| 4729 | 52 → 38 | 2/14 → 11/14 | 23/2 → 18/7 | 37/13 → 35/15 |
| 104729 | 65 → 32 | 12/14 → 12/14 | 15/10 → 19/6 | 30/20 → 34/16 |
| 130363 | 30 → 58 | 13/14 → 14/14 | 14/11 → 12/13 | 26/24 → 28/22 |
| 2097593 | 38 → 36 | 14/14 → 14/14 | 12/13 → 12/13 | 24/26 → 25/25 |

Both types appear in every seed's final 25 and final 50 matches. The candidate improves endpoint recent-type coverage in three seeds and ties two. However, a player can still miss a feasible type for 16 consecutive own appearances somewhere in the candidate run. Recent coverage is an objective, not a hard six-appearance recurrence guarantee.

Courtmate saturation occurs sooner in three seeds and later in two; the median saturation event is 38 for both policies. Final-50 breadth is similar, and no player is restricted to a small closed courtmate cohort in that window (the minimum is nine distinct courtmates for either policy). This finite run does not establish permanent absence or indefinite recurrence beyond 100.

**Partner/opponent tradeoffs**

| Metric, mean over seeds | Baseline at 21 | Candidate at 21 | Baseline at 100 | Candidate at 100 |
|---|---:|---:|---:|---:|
| Distinct partners/player | 5.80 | 5.60 | 13.00 | 12.80 |
| Mean session minimum partners | 5.00 | 4.60 | 13.00 | 11.80 |
| Distinct opponents/player | 8.74 | 8.49 | 13.00 | 12.91 |
| Mean session minimum opponents | 6.80 | 6.60 | 13.00 | 12.40 |
| Partner entropy, normalized by ln(13) | 0.6796 | 0.6621 | 0.9671 | 0.9575 |
| Opponent entropy, normalized by ln(13) | 0.8089 | 0.7901 | 0.9369 | 0.9317 |
| Repeated directed partner exposures/session | 2.8 | 5.6 | 218.0 | 220.8 |
| Repeated directed opponent exposures/session | 45.6 | 49.2 | 618.0 | 619.2 |

Lower-priority relationship breadth largely catches up after courtmate saturation, but does not fully match production by 100. The repeat metrics count each player's repeated exposure, so one repeated unordered pair contributes two directed repeats.

**Decision and limits**

The candidate offers approximately 0.46 additional distinct courtmates/player at 21, or 3.52 percentage points of average coverage. Rest comfort costs 5.14 percentage points of immediate replay, with unchanged p95 rest and no deterioration in the observed maximum wait. That rest tradeoff is compatible with the requested philosophy. The larger concern is the 15.71-point loss in early recent-type coverage and the two seeds with worse minimum breadth. The 100-match improvement in type coverage should not override that primary result.

Keep this as an opt-in experiment. No matcher-policy change was pushed to `main`, and no deployment or database operation was performed. A further experiment would need to make the permitted tradeoff between a small courtmate gain and a missing recent type explicit, while retaining the chosen fairness-first philosophy; this run does not establish a universally optimal ordering.

The evidence covers the standard 7/7 roster and fixed availability pattern. Other side ratios, arrivals/departures, persistent player-group/court restrictions and larger rosters need separate matcher validation. The simulation's completed history intentionally has no completion timestamps, matching the production baseline fixture: time-decayed partner/opponent/exact-rematch penalties are therefore zero in this benchmark. Lifetime exposure/repeat measurements and shared-court frequency remain meaningful; the experiment does not test those dated penalties.

Indicative ordinary-call runtime averages are 12.90 ms for baseline versus 16.93 ms for candidate through 100. These cohorts exclude starvation-wrapper calls and have different cohort sizes (389 versus 403); they are not a controlled production latency test. Full benchmark time includes the independent exhaustive audit and must not be presented as request latency.

**Validation and reproduction**

All five baseline first-21 completed layouts match the frozen current-policy fixture. Existing checkpoint metrics match after removing runtime timing fields, normalizing JSON nonfinite/negative-zero values, and allowing only a few floating-point ulps in fractional metrics. Candidate ranking is independently enumerated for opening batches and court refills. The run rejects missing certificates, ranking/fairness/starvation failures, search limits, incomplete counterfactuals and source changes. All 500 candidate decisions and 97 started no-starvation counterfactual audits pass; completed overdue-decision accounting is kept separate from started-call accounting.

The matcher and Social API regression sweep passed 350 tests with five skipped, excluding the long Social/Balanced simulation suites. The smaller legacy benchmark checks passed eight with three skipped, excluding their 120-match probe. The final focused contract suite passed all 15 tests, including a separate exhaustive two-court oracle, actual selected-layout diagnostic checks, count/arrival fairness, excessive-wait safety, replay priority, rolling-window expiry and structural vocabulary cases. TypeScript, targeted ESLint and diff whitespace checks passed. Several focused cases overlap the regression sweep; these counts are not additive.

Engine SHA-256: `39a4c95e377339a273173153519d37a5346c9222524ba3538b278a5128ecae4e`.

Measurement SHA-256: `7bb34c59ff18b11513141bbd3500b20d9c9827f15e492ac2304b38c718f729f4`.

Validated raw reports, full per-player recent windows, prefixes and cohort diagnostics are under `benchmarks/generated/social-courtmate-priority/full-2026-10-06-v1/`, with separate baseline/candidate JSON, a paired run manifest and comparison-summary JSON/Markdown. The summarizer independently reconstructs C/P/O and rolling T from completed layouts and verifies the paired run's provenance/certificates. These generated artifacts are ignored locally; the report records their exact source hashes.

```sh
node scripts/run-social-courtmate-priority-benchmark.mjs --pilot --out-dir benchmarks/generated/social-courtmate-priority/new-pilot
node scripts/run-social-courtmate-priority-benchmark.mjs --out-dir benchmarks/generated/social-courtmate-priority/new-full
node scripts/summarize-social-courtmate-priority.mjs benchmarks/generated/social-courtmate-priority/new-full
```

The runner defaults to 100, accepts only 21 or 100, and refuses to overwrite reports. Its pilot is seed 1 at 21. Longer legacy regression simulations were excluded from this task's verification.
