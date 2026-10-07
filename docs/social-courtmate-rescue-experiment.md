# Social: one-pair courtmate envelope and recent-type rescue

Experiment date: 6 October 2026. Production policy is unchanged. The new policy is available only through the opt-in `socialPriorityPolicy: "courtmate-near-best"`; it is not wired into production generation.

**Result:** the rescue policy recovered early recent-type variety, but retained only **43.75%** of strict courtmate-first's average breadth improvement over production. At 21 matches, average courtmates were **10.629 / 11.086 / 10.829** for production / strict / rescue, while recent two-type coverage was **95.71% / 80.00% / 98.57%**. Fairness and excessive-wait certificates remained intact. The hypothesis was partly supported: type variety recovered, but most of the average breadth gain was not retained.

**Recommendation:** keep production unchanged. This is a useful experimental tradeoff, but it does not yet meet the stated objective of retaining most of strict's early breadth improvement. The next focused comparison should permit a one-pair concession only when it strictly improves T over the best full-gain alternative, retaining full gain on T ties. Half the completed early concessions in this experiment had zero T benefit. That refinement is a proposal; it has not been implemented or measured here. Unequal side ratios also need validation before any production decision.

## Question and selection rule

The previous strict courtmate-first experiment improved early breadth but reduced the number of players experiencing both MIXED and OWN_SIDE in their recent appearances. This experiment tests whether allowing at most one fewer new unordered courtmate pair can recover that variety while retaining most of the breadth improvement.

The matcher first certifies the strongest playing-time/arrival fairness, schedule-precedence and excessive-wait class. Within that class it finds the maximum new unordered courtmate-pair gain, `Gmax`. A court contributes at most six pairs; a two-court opening is one batch and contributes at most twelve. Candidates with gain below `Gmax − 1` are rejected.

Within this envelope the matcher maximizes the signed change in aggregate rolling T. For each player, T is the number of represented feasible types in their latest six completed personal appearances divided by their feasible-type count. Candidate appearances are appended hypothetically and the oldest appearance expires when necessary. Restoring a type earns credit; losing a type incurs a penalty. Both 5:1 and 3:3 splits have T = 1. There are no target ratios, quotas or debt.

T ties are resolved by the ascending per-player courtmate-coverage profile, then immediate replay, soft cadence, new partners, new opponents, relationship entropy/repeats and existing late/random tie-breaks. Raw courtmate gain is an admission condition and is not an additional tie-break inside the envelope. Consequently a one-pair sacrifice with zero incremental T benefit can occur when courtmate equity improves. The report counts these explicitly.

Two exhaustive search passes certify the frontier and then the envelope winner. A branch/time limit in either pass leaves the policy uncertified. The independent benchmark oracle enumerates legal candidates separately and checks Gmax, envelope membership, signed T, ranking and safety. It audits this benchmark's unconstrained, rank-zero schedules.

## Protocol and attribution

Three arms use the same five deterministic seeds (`1, 4729, 104729, 130363, 2097593`), 14 fixed players split 7 upper/7 lower, and two asynchronously completed/refilled courts. The primary checkpoint is 21 completed matches; the secondary checkpoint is 100. No run in this experiment exceeds 100 matches. Completed history determines relationship coverage and rolling T; active reservations contribute neither. Rest uses completed-match events while a player is available, and excludes their first assignment.

Production and strict courtmate-first are pinned to the saved, validated prior first-100 layouts and checkpoint measurements. Timing fields are excluded from this preservation comparison; tiny floating-point roundoff is tolerated. The runner hashes engine, harness, validators and reference reports before/after each arm, refuses overwrites and promotes a raw report only after validation. Failed or incomplete runs remain pending.

Sacrifice cost is `Gmax − chosen gain` per decision, counted once for a two-court opening. The primary cost totals include only decisions whose entire assigned batch has completed by the checkpoint. Started/pending decisions are reported separately. Counterfactual safety audits never enter actual cost totals.

For each sacrifice, its conditional benefit is the chosen signed aggregate T change minus the best signed T change attainable at exactly Gmax in the same state and safety class. With two feasible types, a net extra player window containing both types is worth 0.5 T. Repeated decisions may rescue the same player; these are window improvements, not distinct people. A zero-benefit sacrifice is an equity tie-break, not a type rescue.

The policy also moves T ahead of courtmate equity when gain equals Gmax. Overall endpoint changes therefore include both that ordering change and the one-pair allowance. The conditional witness comparison isolates the immediate benefit of the allowance; it does not establish that all endpoint improvement was purchased by sacrificing pairs. Similarly, the summed local pair costs do not equal the final pair-count difference between policies, because their later states diverge and pairs can be recovered.

## Scope limits

Five paired seeds provide evidence for this specific 7/7, fixed-roster scenario, not a statistical guarantee for arbitrary sessions. Unequal side ratios, arrivals, pauses, other roster sizes and court counts need separate validation before production adoption. The historical benchmark supplies no `completedAt` dates, so date-based partner/opponent/exact-rematch recency penalties are inactive; completed encounter-frequency and entropy tie-breaks remain active. This history convention is preserved across all three arms to retain the controls.

## Results and validation

Unless labeled total or observed maximum, values below are means across five sessions. Each checkpoint covers 70 player-windows. Match-type counts are pooled across all five sessions. Partner/opponent entropy is Shannon entropy normalized by the 13-peer feasible vocabulary; it is a later tie-break, not the optimized recent-T metric.

### Primary checkpoint: 21 completed matches

| Metric | Production | Strict courtmate-first | One-pair rescue |
|---|---:|---:|---:|
| Average distinct courtmates/player | 10.629 | 11.086 | 10.829 |
| Mean session minimum courtmates | 8.4 | 8.6 | 8.8 |
| Lowest observed player courtmates | 7 | 7 | 7 |
| Average courtmate coverage | 81.758% | 85.275% | 83.297% |
| Mean session worst-player coverage | 64.615% | 66.154% | 67.692% |
| Mean unique courtmate pairs / 91 | 74.4 | 77.6 | 75.8 |
| Players with all 13 courtmates, total | 4/70 | 8/70 | 3/70 |
| Players with both recent types, total | 67/70 (95.71%) | 56/70 (80.00%) | 69/70 (98.57%) |
| Mean recent T | 0.9786 | 0.9000 | 0.9929 |
| MIXED / OWN_SIDE matches, total | 69 / 36 | 79 / 26 | 76 / 29 |
| Longest single-type run in latest six | 6 | 6 | 6 |
| Back-to-back completed appearances | 81/350 (23.14%) | 99/350 (28.29%) | 97/350 (27.71%) |
| Mean assignment rest | 1.4629 | 1.4657 | 1.4714 |
| Mean session p95 assignment rest | 4 | 4 | 4 |
| Maximum assignment rest | 5 | 4 | 4 |
| Longest other-completion gap | 9 | 8 | 8 |
| Starvation interventions, total | 3 | 7 | 8 |
| Average distinct partners | 5.800 | 5.600 | 5.686 |
| Average distinct opponents | 8.743 | 8.486 | 8.457 |
| Mean normalized partner entropy | 0.6796 | 0.6621 | 0.6694 |
| Mean normalized opponent entropy | 0.8089 | 0.7901 | 0.7936 |
| Fairness certificate failures | 0 | 0 | 0 |

Rescue keeps +0.200 courtmates/player over production, compared with strict's +0.457: `0.200 / 0.457142857 = 43.75%`. It improves the mean worst-player breadth beyond both controls, while fewer players complete all 13 courtmates early. Its back-to-back rate remains 4.57 percentage points above production and 0.57 points below strict. The one-pair limit controls each decision's concession; it does not guarantee a small cumulative breadth cost.

Per-seed outcomes use production / strict / rescue order in the last three columns:

| Seed | Production avg C | Strict avg C | Rescue avg C | Minimum C | Unique pairs | Both-type players / 14 |
|---|---:|---:|---:|---|---|---|
| 1 | 10.286 | 10.857 | 10.286 | 8 / 7 / 7 | 72 / 76 / 72 | 13 / 13 / 14 |
| 4729 | 9.429 | 10.000 | 10.286 | 7 / 8 / 9 | 66 / 70 / 72 | 14 / 8 / 14 |
| 104729 | 11.286 | 11.286 | 11.000 | 9 / 10 / 9 | 79 / 79 / 77 | 13 / 8 / 13 |
| 130363 | 11.429 | 11.286 | 11.286 | 9 / 8 / 9 | 80 / 79 / 79 | 13 / 13 / 14 |
| 2097593 | 10.714 | 12.000 | 11.286 | 9 / 10 / 10 | 75 / 84 / 79 | 14 / 14 / 14 |

### Fairness and safety

All three arms have the same count histogram and checkpoint spread for each seed. Histogram notation is completed count × number of players. Player identities can differ between policies; the histograms and independent selection certificates are the comparison.

| Seed | 21-match histogram | Spread | 100-match histogram | Spread |
|---|---|---:|---|---:|
| 1 | 5×4, 6×6, 7×4 | 2 | 27×4, 29×8, 30×2 | 3 |
| 4729 | 6×14 | 0 | 26×4, 29×4, 30×6 | 4 |
| 104729 | 6×14 | 0 | 28×6, 29×8 | 1 |
| 130363 | 6×14 | 0 | 28×6, 29×8 | 1 |
| 2097593 | 6×14 | 0 | 28×6, 29×8 | 1 |

There were zero fairness, starvation-safety, ranking, Gmax, admission or search-limit failures. Rescue certified all 105 started decisions and 22 no-starvation counterfactuals at 21; through 100 it certified all 500 started decisions and 103 counterfactuals. Its completed-decision cohorts were 100 and 495 respectively. Every concession was exactly one pair. Maximum observed available rest was 4 at 21 and 6 through 100 for rescue, the same as its maximum assignment rest. These are observed bounds, not a new hard waiting cap: existing fairness and safety precedence is unchanged. Other-completion gaps include time spent playing and are separate from available-player rest.

### Pair cost and the coverage it bought

| Rescue cost | At 21 | Through 100 |
|---|---:|---:|
| Fully completed decisions | 100 | 495 |
| Completed one-pair concessions | 16 (16.00%) | 23 (4.65%) |
| Concessions with positive conditional T benefit | 8 | 15 |
| Concessions with zero T benefit | 8 | 8 |
| Concessions with negative T benefit | 0 | 0 |
| Total pairs deliberately conceded | 16 | 23 |
| Aggregate conditional T benefit | +5.0 | +8.5 |
| Extra/preserved both-type player-windows vs best Gmax alternative | 10 | 17 |
| Started decisions, including pending | 105 | 500 |
| Started one-pair concessions | 18 | 23 |

At the primary checkpoint, eight pairs bought ten additional/preserved both-type windows in the immediate candidate comparisons; another eight pairs bought better courtmate equity with equal T. Across all 16 pairs, that is 0.625 extra/preserved windows per pair; among the positive-benefit concessions it is 1.25. These are repeated local window outcomes, not ten unique players and not a causal explanation of the endpoint difference. At 21 there are two additional started concessions still pending; their cost is excluded until completion.

| Seed | Completed pairs conceded at 21 | Conditional T benefit | Extra/preserved both-type windows | Pairs conceded through 100 | Conditional T benefit |
|---|---:|---:|---:|---:|---:|
| 1 | 5 | 1.0 | 2 | 6 | 1.5 |
| 4729 | 0 | 0.0 | 0 | 1 | 0.5 |
| 104729 | 5 | 2.0 | 4 | 7 | 3.0 |
| 130363 | 0 | 0.0 | 0 | 1 | 0.5 |
| 2097593 | 6 | 2.0 | 4 | 8 | 3.0 |

Seeds 4729 and 130363 had no completed pair concessions by 21, yet their both-type counts improved over strict. This demonstrates why moving T before equity at full gain also matters. For every zero-benefit concession, reconstructing the chosen and Gmax coverage profiles from completed history confirms a strictly better ascending profile for the chosen candidate. The full per-decision appendix below shows all costs and signed benefits; the CSV additionally retains both court layouts, coverage profiles and each player's before/after type window.

### Secondary diagnostic: 100 completed matches

| Metric | Production | Strict courtmate-first | One-pair rescue |
|---|---:|---:|---:|
| Average / minimum distinct courtmates | 13 / 13 | 13 / 13 | 13 / 13 |
| Unique courtmate pairs | 91/91 | 91/91 | 91/91 |
| Players with all courtmates | 70/70 | 70/70 | 70/70 |
| Both recent types | 53/70 (75.71%) | 65/70 (92.86%) | 63/70 (90.00%) |
| Mean recent T | 0.8786 | 0.9643 | 0.9500 |
| Mean T across completion events 76–100 | 0.9220 | 0.9497 | 0.9354 |
| MIXED / OWN_SIDE matches, total | 309 / 191 | 319 / 181 | 308 / 192 |
| Longest personal single-type run anywhere in first 100 | 20 | 16 | 14 |
| Back-to-back rate | 21.66% | 23.37% | 23.06% |
| Mean assignment rest | 1.4953 | 1.4943 | 1.4922 |
| Mean session p95 / maximum assignment rest | 4 / 6 | 4 / 6 | 4 / 6 |
| Longest other-completion gap | 16 | 15 | 14 |
| Starvation interventions | 18 | 17 | 17 |
| Average partners / opponents | 13.000 / 13.000 | 12.800 / 12.914 | 12.886 / 13.000 |
| Normalized partner / opponent entropy | 0.9671 / 0.9369 | 0.9575 / 0.9317 | 0.9576 / 0.9302 |

Rescue improves recent type coverage over production at 100, but is slightly below strict on both the endpoint and events 76–100 mean. Its longest observed personal single-type run is shorter. The early result therefore does not establish overall dominance, and none of these finite observations establishes permanent type disappearance or its prevention.

### Reproduction and integrity

`git pull --ff-only origin main` reported already up to date before this work. Base HEAD was `973081e7120bfd78f7c3808360aa37344b18e051`; branch `codex/rolling-social-variety` includes pre-existing experiment work and remains uncommitted. No production change, push, deployment or database migration was performed.

The first pilot failed a reporting crosscheck that compared raw Shannon entropy against normalized entropy. Its directory remains pending. The correction kept the check and fixed the units; a fresh pilot-v2 and full-v1 passed all three arms. No failed pilot data enters the tables above.

Frozen full-run hashes:

- Engine: `c60993c0385b1abce15281e9eb762e6eb914af84f2e460bc5160edd82f9b6f3d`
- Measurement: `8faf8521e9c48707963bc4d42786d9b76210d5859eb116fa071f6ffbc042cc44`
- Prior control reports: `c32df95f99571a8f23eec3e57ea4aced9a730237251e145d70ed602a6d9cd771`

Successful measurement commands (choose fresh output directories when rerunning):

```sh
node scripts/run-social-courtmate-rescue-benchmark.mjs --pilot --out-dir benchmarks/generated/social-courtmate-rescue/pilot-2026-10-06-v2
node scripts/run-social-courtmate-rescue-benchmark.mjs --out-dir benchmarks/generated/social-courtmate-rescue/full-2026-10-06-v1
node scripts/summarize-social-courtmate-rescue.mjs benchmarks/generated/social-courtmate-rescue/full-2026-10-06-v1
```

Checks passed: TypeScript, targeted ESLint, five focused rescue oracle/limit tests, three validator tests and the existing 39 matcher/strict-priority tests. The broader bounded regression runs passed **368 tests**, with nine intentional skips, including the Social API integration and default/Balanced regressions. The 400-match simulation suites and a 120-match historical probe were excluded; gated long benchmarks were disabled. Pilot and full measured tests passed separately. The formatter also reconciled signed completed T with independently measured endpoint T, reconstructed every concession's coverage profile and verified all zero-T concessions were equity improvements. A separate read-only agent checked the raw reports and totals.

Local artifacts:

- [Aggregate summary](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-courtmate-rescue/full-2026-10-06-v1/summary.json)
- [Every one-pair concession, with type windows and alternative layouts](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-courtmate-rescue/full-2026-10-06-v1/one-pair-sacrifices.csv)
- [Run manifest](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-courtmate-rescue/full-2026-10-06-v1/social-courtmate-rescue-100-run-manifest.json)
- [Production raw report](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-courtmate-rescue/full-2026-10-06-v1/baseline/social-courtmate-rescue-100-baseline-production.json)
- [Strict raw report](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-courtmate-rescue/full-2026-10-06-v1/strict/social-courtmate-rescue-100-strict-courtmate-first.json)
- [Rescue raw report](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-courtmate-rescue/full-2026-10-06-v1/rescue/social-courtmate-rescue-100-rescue-courtmate-near-best.json)

These generated raw artifacts are ignored local files; the source and this report preserve the workflow and findings.

## Every completed one-pair concession

All 23 rows have completed by 100. “At 21” includes a row only when its selected match completed by that checkpoint. Signed T values are aggregate changes, including prevented losses. Rows with zero extra T were courtmate-equity improvements.

| Seed | Chosen after completion | Match completed at | Gmax → chosen | Chosen ΔT | Best Gmax ΔT | Extra T | Extra/preserved both-type windows | At 21 |
|---|---:|---:|---|---:|---:|---:|---:|---|
| 1 | 6 | 7 | 4 → 3 | 0.5 | 0 | 0.5 | 1 | yes |
| 1 | 11 | 12 | 4 → 3 | 0.5 | 0.5 | 0 | 0 | yes |
| 1 | 14 | 15 | 5 → 4 | 0 | 0 | 0 | 0 | yes |
| 1 | 16 | 19 | 3 → 2 | 0 | 0 | 0 | 0 | yes |
| 1 | 20 | 21 | 3 → 2 | 0.5 | 0 | 0.5 | 1 | yes |
| 1 | 27 | 30 | 2 → 1 | 0 | -0.5 | 0.5 | 1 | no |
| 4729 | 25 | 27 | 3 → 2 | 0 | -0.5 | 0.5 | 1 | no |
| 104729 | 3 | 8 | 5 → 4 | 2 | 1.5 | 0.5 | 1 | yes |
| 104729 | 4 | 5 | 6 → 5 | 1.5 | 1 | 0.5 | 1 | yes |
| 104729 | 6 | 7 | 5 → 4 | 1 | 0 | 1 | 2 | yes |
| 104729 | 9 | 15 | 5 → 4 | 0 | 0 | 0 | 0 | yes |
| 104729 | 16 | 19 | 2 → 1 | 0 | 0 | 0 | 0 | yes |
| 104729 | 20 | 22 | 3 → 2 | 0 | -0.5 | 0.5 | 1 | no |
| 104729 | 21 | 23 | 3 → 2 | -0.5 | -1 | 0.5 | 1 | no |
| 130363 | 25 | 26 | 2 → 1 | -0.5 | -1 | 0.5 | 1 | no |
| 2097593 | 3 | 4 | 5 → 4 | 2 | 1.5 | 0.5 | 1 | yes |
| 2097593 | 6 | 10 | 5 → 4 | 0 | 0 | 0 | 0 | yes |
| 2097593 | 7 | 8 | 5 → 4 | 1 | 0 | 1 | 2 | yes |
| 2097593 | 11 | 14 | 4 → 3 | 0 | 0 | 0 | 0 | yes |
| 2097593 | 14 | 15 | 4 → 3 | 0 | 0 | 0 | 0 | yes |
| 2097593 | 18 | 19 | 2 → 1 | 0.5 | 0 | 0.5 | 1 | yes |
| 2097593 | 20 | 23 | 3 → 2 | 0 | -0.5 | 0.5 | 1 | no |
| 2097593 | 24 | 27 | 1 → 0 | 0.5 | 0 | 0.5 | 1 | no |
