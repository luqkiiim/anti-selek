# Social: strictly beneficial recent-type rescue

Experiment date: 6 October 2026. Production Social is unchanged. The new policy is opt-in through `socialPriorityPolicy: "courtmate-beneficial-rescue"` and is not wired into production generation. Strict courtmate-first and the existing one-pair rescue remain available unchanged.

**Result:** the hypothesis is supported in this five-seed, 7/7 scenario. At 21 completed matches, the new candidate achieves **11.057 average courtmates/player** and **70/70 players with both recent types**. It retains **93.75%** of strict courtmate-first’s average breadth improvement over production, compared with **43.75%** for the existing rescue. Completed one-pair concessions fall from **16 to 9**; all nine strictly improve T over the best full-gain alternative. Zero-benefit and negative-benefit concessions are both **zero**.

**Recommendation:** use this stricter rule as the leading candidate for the next experiment, while keeping production unchanged. It nearly retains strict’s early average breadth while exceeding the previous rescue’s recent-type result. It still increases back-to-back play over production, and strict has slightly better type coverage at 100. Validate unequal side ratios and changing rosters before considering production adoption; these runs establish the tradeoff in the tested scenario, not universal superiority.

## Exact selection rule

The first exhaustive pass certifies the strongest playing-time/arrival fairness, schedule rank and excessive-wait/starvation class. Within that class it finds `Gmax`, the maximum new unordered courtmate-pair gain, and `TmaxAtGmax`, the best signed aggregate rolling-T change at exactly Gmax. A court contributes at most six new pairs; an opening two-court batch contributes at most twelve.

For each player, `T = represented structurally feasible match types in latest 6 completed personal appearances / feasible type count`. The candidate appearance is appended hypothetically, with the oldest appearance expiring if necessary. Signed changes include restored types and expired-type losses. Both 5:1 and 3:3 type splits have T = 1. Structural feasibility uses the full roster, including temporarily busy players; completed history determines coverage. There are no quotas, ratios, debt or 50/50 targets.

The second pass admits every candidate at Gmax. A Gmax−1 candidate is admitted only when its signed ΔT is **strictly greater** than TmaxAtGmax. Larger deficits are rejected. Among admitted candidates the order is signed T, higher raw courtmate gain, ascending per-player courtmate coverage profile, immediate replay/soft cadence, new partners, new opponents, entropy/repeat quality, and existing late/random tie-breakers. Courtmate equity cannot justify a one-pair concession on its own. All admission and primary comparisons use exact signed integer units.

| Example | Full Gmax ΔT | One-pair ΔT | Admission |
| --- | ---: | ---: | ---: |
| A | 0 | 0.5 | admit |
| B | 0.5 | 0.5 | reject |
| C | 0 | 0 | reject |
| D | -0.5 | 0 | admit |

A search limit in either pass leaves the policy uncertified. The independent benchmark oracle separately enumerates legal candidates, calculates the frontier and checks admission/ranking. The measured benchmark has default rank-zero schedules; it does not certify arbitrary externally supplied schedules or locks.

## Protocol and interpretation

Four arms use identical deterministic seeds (`1, 4729, 104729, 130363, 2097593`), 14 fixed players split 7 upper/7 lower, and two asynchronously completed/refilled courts. The primary checkpoint is 21 completed matches; 100 is secondary. No measured run or regression simulation in this task exceeds 100 matches. The three control arms reproduce their prior validated first-100 layouts and checkpoint measurements; timing is excluded from preservation comparisons and tiny floating-point roundoff is tolerated.

Unless labeled total or maximum, values below are unweighted means across five equal-sized sessions. Each checkpoint covers 70 player-windows. Rest is measured in completed-match events while available, excluding first assignments; its overall mean is weighted by eligible assignments. Reported p95 is the mean of five session p95 values, not a pooled percentile. Other-completion gaps also include time spent playing. Partner/opponent entropy is Shannon entropy normalized by the 13-peer feasible vocabulary, and is a later tie-break rather than the T objective.

Concession cost is `Gmax − chosen gain`, counted once per decision and included only when the whole assigned batch completes by the checkpoint. Started/pending decisions are separate. Safety counterfactuals do not enter actual cost totals. Conditional benefit compares the chosen signed ΔT against the best full-Gmax alternative in the same state and safety class. Two feasible types make one extra/preserved both-type window worth 0.5 T. These repeated local windows can involve the same player; they are not counts of distinct people or a causal decomposition of endpoint differences. Summed local pair costs likewise do not equal the final pair-count difference between policies, because later states diverge and pairs can be recovered.

The full-Gmax diagnostic independently finds the **same-state strict courtmate-first winner**, with coverage profile before T. This is distinct from TmaxAtGmax. Comparing the new winner against it isolates the immediate benefit of putting T before equity without conceding a courtmate pair. Positive actual signed T includes first-type acquisition, so it is reported separately from benefit versus the strict winner.

## Primary checkpoint: 21 completed matches

| Metric | Production | Strict courtmate-first | Existing one-pair rescue | Strictly beneficial rescue |
| --- | ---: | ---: | ---: | ---: |
| Average distinct courtmates/player | 10.629 | 11.086 | 10.829 | 11.057 |
| Mean session minimum courtmates | 8.4 | 8.6 | 8.8 | 8.8 |
| Lowest observed player courtmates | 7 | 7 | 7 | 7 |
| Average courtmate coverage | 81.758% | 85.275% | 83.297% | 85.055% |
| Mean worst-player coverage | 64.615% | 66.154% | 67.692% | 67.692% |
| Mean unique unordered courtmate pairs / 91 | 74.4 | 77.6 | 75.8 | 77.4 |
| Players with all 13 courtmates, total | 4/70 | 8/70 | 3/70 | 7/70 |
| Players with both recent types, total | 67/70 (95.71%) | 56/70 (80.00%) | 69/70 (98.57%) | 70/70 (100.00%) |
| Mean recent T | 0.9786 | 0.9000 | 0.9929 | 1.0000 |
| MIXED / OWN_SIDE matches, total | 69 / 36 | 79 / 26 | 76 / 29 | 75 / 30 |
| Longest single-type run in latest six | 6 | 6 | 6 | 5 |
| Back-to-back completed appearances | 81/350 (23.14%) | 99/350 (28.29%) | 97/350 (27.71%) | 96/350 (27.43%) |
| Mean assignment rest | 1.4629 | 1.4657 | 1.4714 | 1.4600 |
| Mean session p95 assignment rest | 4.0 | 4.0 | 4.0 | 3.8 |
| Maximum assignment rest | 5 | 4 | 4 | 4 |
| Longest other-completion gap | 9 | 8 | 8 | 8 |
| Starvation interventions, total | 3 | 7 | 8 | 7 |
| Average distinct partners | 5.800 | 5.600 | 5.686 | 5.743 |
| Average distinct opponents | 8.743 | 8.486 | 8.457 | 8.400 |
| Mean normalized partner entropy | 0.6796 | 0.6621 | 0.6694 | 0.6748 |
| Mean normalized opponent entropy | 0.8089 | 0.7901 | 0.7936 | 0.7896 |
| Fairness certificate failures | 0 | 0 | 0 | 0 |

The new candidate gains 0.428571 courtmates/player over production, against strict’s 0.457143: `0.428571 / 0.457143 = 93.75%`. Its mean pair count is just 0.2 below strict per session, while recent two-type coverage rises from strict’s 56/70 and the existing rescue’s 69/70 to 70/70. It shares the existing rescue’s mean minimum of 8.8 and has seven fully covered players, compared with strict’s eight and the old rescue’s three.

Back-to-back play is 27.43%, versus production’s 23.14% (+4.29 percentage points) and strict’s 28.29%. Mean rest, p95 and observed maximum do not worsen; the new p95 values are 4, 4, 4, 4 and 3. Partner breadth and entropy improve over strict and the old rescue, while opponent breadth and entropy are slightly lower. These later-quality tradeoffs remain visible despite the strong primary result.

Per-seed entries in the last two columns use production / strict / existing rescue / new candidate order:

| Seed | Production avg C | Strict avg C | Old rescue avg C | New avg C | Minimum C | Both-type players / 14 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 10.286 | 10.857 | 10.286 | 11.143 | 8 / 7 / 7 / 7 | 13 / 13 / 14 / 14 |
| 4729 | 9.429 | 10.000 | 10.286 | 10.286 | 7 / 8 / 9 / 9 | 14 / 8 / 14 / 14 |
| 104729 | 11.286 | 11.286 | 11.000 | 11.000 | 9 / 10 / 9 / 9 | 13 / 8 / 13 / 14 |
| 130363 | 11.429 | 11.286 | 11.286 | 11.286 | 9 / 8 / 9 / 9 | 13 / 13 / 14 / 14 |
| 2097593 | 10.714 | 12.000 | 11.286 | 11.571 | 9 / 10 / 10 / 10 | 14 / 14 / 14 / 14 |

## Fairness and safety

All four arms have the same completed-count histogram and spread for every seed at each checkpoint. Individual player identities can differ. Histogram notation is count × number of players:

| Seed | At 21 histogram | Spread | At 100 histogram | Spread |
| --- | ---: | ---: | ---: | ---: |
| 1 | 5×4, 6×6, 7×4 | 2 | 27×4, 29×8, 30×2 | 3 |
| 4729 | 6×14 | 0 | 26×4, 29×4, 30×6 | 4 |
| 104729 | 6×14 | 0 | 28×6, 29×8 | 1 |
| 130363 | 6×14 | 0 | 28×6, 29×8 | 1 |
| 2097593 | 6×14 | 0 | 28×6, 29×8 | 1 |

The new arm has zero fairness, starvation-safety, ranking, Gmax-certification, admission, incomplete-audit or search-limit failures. It certifies all 105 started decisions and 20 independently recomputed no-starvation counterfactuals at 21; through 100, it certifies all 500 started decisions and 94 counterfactuals. The completed-decision cohorts are 100 and 495 respectively. Its maximum observed assignment rest is 4 at 21 and 6 through 100. These are observed bounds; the existing fairness/safety precedence does not impose a new hard waiting cap.

## Completed concession cost and full-gain benefits

| Cost / benefit | Old at 21 | New at 21 | Old through 100 | New through 100 |
| --- | ---: | ---: | ---: | ---: |
| Completed decisions | 100 | 100 | 495 | 495 |
| Completed one-pair concessions | 16 | 9 | 23 | 21 |
| Total pairs deliberately conceded | 16 | 9 | 23 | 21 |
| Positive conditional T concessions | 8 | 9 | 15 | 21 |
| Zero-benefit concessions | 8 | 0 | 8 | 0 |
| Negative-benefit concessions | 0 | 0 | 0 | 0 |
| Aggregate conditional T benefit | 5 | 6.5 | 8.5 | 15.5 |
| Extra/preserved both-type player-windows | 10 | 13 | 17 | 31 |
| Started decisions, including pending | 105 | 105 | 500 | 500 |
| Started one-pair concessions | 18 | 9 | 23 | 21 |

Every completed new concession satisfies `chosenDeltaT > TmaxAtGmax`; the guard is also validated on started decisions and safety counterfactuals. At 21, nine pairs buy 13 extra/preserved both-type windows (+6.5 aggregate T), against the previous policy’s 16 pairs buying 10 windows. All nine have positive absolute ΔT. Through 100 there are 21 concessions: 13 increase net type coverage, five avoid a net loss and three reduce a loss that the best full-gain choice would incur. The last group has negative absolute ΔT but **positive conditional benefit**, exactly as required by the signed rule. No concession exceeds one pair.

| Full-gain diagnostic | At 21 | Through 100 |
| --- | ---: | ---: |
| Completed decisions at full Gmax | 91 | 474 |
| Full-Gmax decisions with positive actual signed ΔT | 32 | 78 |
| Full-Gmax decisions better than same-state strict winner | 2 | 4 |
| Aggregate T benefit versus strict winner | 2.5 | 3.5 |
| Extra/preserved both-type windows versus strict winner | 5 | 7 |

At 21, 32/91 full-gain decisions have positive actual ΔT (35.16%). Two of the 91 decisions (2.20%) improve T over the same-state strict winner, preserving full gain and buying five additional both-type windows. Through 100 these figures are 78/474 (16.46%) and 4/474 (0.84%), with seven windows. The immediate full-gain and concession comparisons are separate from the end-to-end policy comparison; their sums must not be interpreted as the number of extra distinct players at the endpoint.

| Seed | Chosen after completion | Completed at | Full gain | Chosen ΔT | Strict winner ΔT | Extra T | Extra both-type windows | At 21 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 22 | 26 | 1 | 0 | -0.5 | 0.5 | 1 | no |
| 1 | 28 | 29 | 1 | 0 | -0.5 | 0.5 | 1 | no |
| 4729 | 13 | 18 | 4 | 1 | 0 | 1 | 2 | yes |
| 130363 | 7 | 9 | 4 | 1.5 | 0 | 1.5 | 3 | yes |

Seeds 4729 and 130363 have no completed pair concessions at 21, yet benefit from full-gain T-before-equity choices. This confirms the value of preserving Step 2 independently of the one-pair allowance.

## Secondary checkpoint: 100 completed matches

| Metric | Production | Strict courtmate-first | Existing one-pair rescue | Strictly beneficial rescue |
| --- | ---: | ---: | ---: | ---: |
| Average distinct courtmates/player | 13.000 | 13.000 | 13.000 | 13.000 |
| Mean session minimum courtmates | 13.0 | 13.0 | 13.0 | 13.0 |
| Lowest observed player courtmates | 13 | 13 | 13 | 13 |
| Average courtmate coverage | 100.000% | 100.000% | 100.000% | 100.000% |
| Mean worst-player coverage | 100.000% | 100.000% | 100.000% | 100.000% |
| Mean unique unordered courtmate pairs / 91 | 91.0 | 91.0 | 91.0 | 91.0 |
| Players with all 13 courtmates, total | 70/70 | 70/70 | 70/70 | 70/70 |
| Players with both recent types, total | 53/70 (75.71%) | 65/70 (92.86%) | 63/70 (90.00%) | 64/70 (91.43%) |
| Mean recent T | 0.8786 | 0.9643 | 0.9500 | 0.9571 |
| MIXED / OWN_SIDE matches, total | 309 / 191 | 319 / 181 | 308 / 192 | 311 / 189 |
| Longest single-type run in latest six | 6 | 6 | 6 | 6 |
| Back-to-back completed appearances | 418/1930 (21.66%) | 451/1930 (23.37%) | 445/1930 (23.06%) | 436/1930 (22.59%) |
| Mean assignment rest | 1.4953 | 1.4943 | 1.4922 | 1.4933 |
| Mean session p95 assignment rest | 4.0 | 4.0 | 4.0 | 4.0 |
| Maximum assignment rest | 6 | 6 | 6 | 6 |
| Longest other-completion gap | 16 | 15 | 14 | 14 |
| Starvation interventions, total | 18 | 17 | 17 | 14 |
| Average distinct partners | 13.000 | 12.800 | 12.886 | 12.829 |
| Average distinct opponents | 13.000 | 12.914 | 13.000 | 12.914 |
| Mean normalized partner entropy | 0.9671 | 0.9575 | 0.9576 | 0.9544 |
| Mean normalized opponent entropy | 0.9369 | 0.9317 | 0.9302 | 0.9297 |
| Fairness certificate failures | 0 | 0 | 0 | 0 |

| Additional recurrence diagnostic | Production | Strict courtmate-first | Existing one-pair rescue | Strictly beneficial rescue |
| --- | ---: | ---: | ---: | ---: |
| Mean T over events 76–100 | 0.9220 | 0.9497 | 0.9354 | 0.9383 |
| Longest personal single-type run anywhere in first 100 | 20 | 16 | 14 | 13 |

All arms reach every possible courtmate relationship by 100. The new candidate’s 64/70 recent two-type windows (91.43%) exceed production’s 53/70 and the old rescue’s 63/70, but are one below strict’s 65/70. Its events-76–100 mean T is also below strict. Its longest observed personal single-type run is shortest (13), and back-to-back play is below both experimental controls while remaining above production. The primary improvement therefore does not establish dominance at every horizon or permanent prevention of one-type runs.

## Reproduction, checks and scope

`git pull --ff-only origin main` reported already up to date. Base HEAD is `973081e7120bfd78f7c3808360aa37344b18e051` on `codex/rolling-social-variety`; pre-existing experiment work was preserved. No commit, push, deployment or database migration was performed. Default Social and Balanced production paths remain unchanged, and all three existing controls reproduce their prior outputs.

The four-arm pilot and full run passed. Engine, harness, validation and three reference-report hashes were frozen before measurement and checked around each arm. The runner refuses overwrites and promotes reports from pending status only after validation. The formatter independently reconciles signed completed T with endpoint T and reconstructs concession coverage profiles from completed layouts. A separate read-only review checked matcher/oracle agreement; an independent aggregate audit checked the resulting reports.

- Engine: `c59a8092e4b2d1870a9cff1de2d47fc1b0f3aa95e7ec20ce59dc840c28ae00c4`
- Measurement: `3b94c61648cd51398cea610d65f040e8306e5c5120242ab6ce021383d0fd4ef3`
- Prior control reports: `bfdf5fcbd1f75ccf309d4104517032a057607846b9908e1318797b964aaecd56`

Successful commands (use fresh output directories when repeating):

```sh
node scripts/run-social-courtmate-beneficial-rescue-benchmark.mjs --pilot --out-dir benchmarks/generated/social-courtmate-beneficial-rescue/pilot-2026-10-06-v1
node scripts/run-social-courtmate-beneficial-rescue-benchmark.mjs --out-dir benchmarks/generated/social-courtmate-beneficial-rescue/full-2026-10-06-v1
node scripts/summarize-social-courtmate-beneficial-rescue.mjs benchmarks/generated/social-courtmate-beneficial-rescue/full-2026-10-06-v1
```

Focused matcher, independent-oracle and validator tests passed, as did TypeScript, targeted ESLint and `git diff --check`. Bounded regression checks passed **393 tests**, with ten intentional skips and zero failures, including Social API integration and default/Balanced regressions. Long benchmark gates were disabled; 400-match simulations and the old 120-match coverage probe were excluded. The new runner rejects horizons above 100.

Five paired seeds support this fixed-roster 7/7 scenario. Unequal side ratios, arrivals/pauses, other roster sizes and court counts remain unmeasured here. The preserved historical benchmark contains no `completedAt` dates, so date-based partner/opponent/exact-rematch recency penalties are inactive, while encounter-frequency and entropy tie-breaks remain active. No claim of production readiness or future type guarantees follows from these finite results.

Local artifacts:

- [Aggregate summary](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-courtmate-beneficial-rescue/full-2026-10-06-v1/summary.json)
- [Every old/new concession with layouts, coverage profiles and type windows](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-courtmate-beneficial-rescue/full-2026-10-06-v1/one-pair-sacrifices.csv)
- [Full-gain benefits with chosen and strict-reference layouts](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-courtmate-beneficial-rescue/full-2026-10-06-v1/full-gain-type-benefits.csv)
- [Run manifest](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-courtmate-beneficial-rescue/full-2026-10-06-v1/social-courtmate-beneficial-rescue-100-run-manifest.json)
- [Production raw report](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-courtmate-beneficial-rescue/full-2026-10-06-v1/baseline/social-courtmate-beneficial-rescue-100-baseline-production.json)
- [Strict courtmate-first raw report](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-courtmate-beneficial-rescue/full-2026-10-06-v1/strict/social-courtmate-beneficial-rescue-100-strict-courtmate-first.json)
- [Existing one-pair rescue raw report](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-courtmate-beneficial-rescue/full-2026-10-06-v1/rescue/social-courtmate-beneficial-rescue-100-rescue-courtmate-near-best.json)
- [Strictly beneficial rescue raw report](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-courtmate-beneficial-rescue/full-2026-10-06-v1/beneficial/social-courtmate-beneficial-rescue-100-beneficial-courtmate-rescue.json)

Generated data are ignored local artifacts. The source and this report preserve the workflow and findings.

## Every completed new one-pair concession

All 21 rows complete by 100; nine complete by 21. Every row concedes exactly one pair and has strictly positive conditional T benefit. The two signed columns give explicit proof of `chosenDeltaT > TmaxAtGmax`. Classification describes absolute chosen ΔT; it does not change the conditional-benefit rule. The linked CSV additionally stores each player’s type windows and both court layouts.

| Seed | Chosen after completion | Completed at | Gmax → chosen | Chosen ΔT | Best Gmax ΔT | Conditional ΔT | Extra/preserved both-type windows | Classification | At 21 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 6 | 7 | 4 → 3 | 0.5 | 0 | 0.5 | 1 | net coverage increase | yes |
| 1 | 14 | 15 | 4 → 3 | 1.5 | 0 | 1.5 | 3 | net coverage increase | yes |
| 1 | 27 | 30 | 2 → 1 | 0.5 | -0.5 | 1 | 2 | net coverage increase | no |
| 1 | 34 | 35 | 1 → 0 | 0 | -1 | 1 | 2 | avoids net loss | no |
| 1 | 35 | 41 | 1 → 0 | -0.5 | -1 | 0.5 | 1 | reduces net loss | no |
| 1 | 50 | 53 | 1 → 0 | 0 | -0.5 | 0.5 | 1 | avoids net loss | no |
| 1 | 53 | 54 | 1 → 0 | 1 | -0.5 | 1.5 | 3 | net coverage increase | no |
| 4729 | 25 | 27 | 3 → 2 | 0 | -0.5 | 0.5 | 1 | avoids net loss | no |
| 104729 | 3 | 8 | 5 → 4 | 2 | 1.5 | 0.5 | 1 | net coverage increase | yes |
| 104729 | 4 | 5 | 6 → 5 | 1.5 | 1 | 0.5 | 1 | net coverage increase | yes |
| 104729 | 6 | 7 | 5 → 4 | 1 | 0 | 1 | 2 | net coverage increase | yes |
| 104729 | 16 | 19 | 2 → 1 | 0.5 | 0 | 0.5 | 1 | net coverage increase | yes |
| 104729 | 21 | 23 | 3 → 2 | 0 | -0.5 | 0.5 | 1 | avoids net loss | no |
| 130363 | 25 | 26 | 2 → 1 | -0.5 | -1 | 0.5 | 1 | reduces net loss | no |
| 2097593 | 3 | 4 | 5 → 4 | 2 | 1.5 | 0.5 | 1 | net coverage increase | yes |
| 2097593 | 7 | 8 | 5 → 4 | 1 | 0 | 1 | 2 | net coverage increase | yes |
| 2097593 | 10 | 11 | 4 → 3 | 0.5 | 0 | 0.5 | 1 | net coverage increase | yes |
| 2097593 | 27 | 28 | 2 → 1 | 0 | -0.5 | 0.5 | 1 | avoids net loss | no |
| 2097593 | 29 | 31 | 1 → 0 | -1 | -1.5 | 0.5 | 1 | reduces net loss | no |
| 2097593 | 31 | 32 | 1 → 0 | 0.5 | -1 | 1.5 | 3 | net coverage increase | no |
| 2097593 | 33 | 41 | 1 → 0 | 0.5 | 0 | 0.5 | 1 | net coverage increase | no |
