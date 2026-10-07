# Social matcher and scheduler readiness — 7 October 2026

**Keep beneficial rescue as the leading experimental matcher and joint refill experimental. Hold the production-default switch.** The existing exact-search optimization resolves the original opening failures in the tested 16/2 and 18/3 sessions. The realistic grid completed 90/90 sessions to 100 matches, with all 5,828 accepted candidate batch decisions fully certified. Larger joint-state certification remains a measured blocker.

The matcher objective, rolling-six T, strict one-pair admission, fairness/schedule/starvation ordering, secondary priorities, default budgets, and conditional-wait thresholds were unchanged during this audit. Production Social, Balanced Points/Elo, deployment, and database behavior were not changed.

## Answers to the nine production questions

1. **Normal-budget safety at 16/2 and 18/3:** yes for every actual opening/refill in the tested sessions; no general guarantee for arbitrary joint states. All original short and 100-match reruns certified. The conditional 16/2 clock runs had 81 uncertified future previews, and six isolated all-court 18/3 probes at prefixes 20/50 failed certification. No uncertified candidate was executed or used to justify waiting.
2. **Exhaustive equivalence:** every completed comparison agreed. Three eight-player fixtures enumerate all 81 legal unordered two-court layouts, independently recompute C/T, compare the full admission set, and check every pairwise primary ordering. Eight original-engine fixtures verify complete winners and late ties. The 16/2 opening matches the unlimited original winner exactly. The 18/3 original exceeded its 90-second diagnostic cap, leaving that direct comparison inconclusive. These finite checks do not constitute a universal mechanical proof.
3. **Fairness, starvation, hierarchy:** preserved. All 5,828 accepted candidate executions and 5,828 current previews fully certify. All 158 one-pair concessions have strictly positive conditional signed-T benefit; zero/negative conditional benefit is zero and maximum deficit is one. Different schedules can still have different global count spread under the same local fairness objective.
4. **Benefit across realistic sizes:** broad but uneven. Immediate beneficial rescue improves endpoint mean T in eight profiles, ties at 10/2, and is lower at 16/2 (0.958 versus production 0.990). It reaches full lifetime courtmate coverage in all ten profiles; production falls short in 10/2, 12/2, and 16/3. Early breadth is lower than production in 16/2 and 14/9+5. Exact local ranking does not guarantee improvement at every later checkpoint; these trajectories do not establish an objective bug.
5. **When waiting materially helps at ≥5 players/court:** clearest lasting benefit is 10/2: T 0.500 → 0.867; both-type coverage 0 → 0.733. Three-court 15/16/18 rosters gain about 7.0/8.1/7.4 percentage points of courtmate coverage by roughly six appearances/player. At 100, immediate refill already has full breadth and nearly perfect T there.
6. **Worth the idle cost:** enough to continue research, not to enable waiting broadly. At 10/2, 73.3 percentage points of both-type coverage costs 1.297% simulated court idle time, but B2B rises 51.6% → 57.1%, count spread increases, and the worst conditional seed ends at T=0.6. The larger-roster benefit mainly arrives earlier, costing about 1.4–2.2% idle time at the short checkpoint.
7. **Joint-refill decision:** retain the optional experiment. Consider narrowly conditional production use only after exact joint-state certification and live forecast/coordination validation. Do not enable it merely by roster size or drop it despite the realistic 10/2 benefit.
8. **Default-matcher blockers:** joint-state/boundary search limits, the unfinished 18/3 original-control comparison, and production acceptance gates for candidate certificates. Returned diagnostic selections must never be accepted as certified winners. Waiting has additional forecasting and coordination prerequisites.
9. **Classification:** exact-search — joint-state limits, 20/3 opening boundary, larger-reference validation limit; scheduler/topology — asynchronous type trapping and early gains from synchronized availability; product/forecasting — full-proof acceptance and reliable bounded waiting. Matcher-objective — no demonstrated semantic failure requiring redesign. The eight-player post-saturation quartet issue remains a separate deferred variety investigation.

## Protocol and evidence

Seeds are 1, 4729, 104729. First, the original legacy completion-order protocol ran 16/2 to 24 completions and 18/3 to 27, then both to 100. Every history matched its previous frozen current-engine reference. The separate realistic grid is ten profiles × three arms × three seeds, with checkpoints round(1.5 × roster), 50, and 100. Arrows below mean production immediate → beneficial immediate → beneficial conditional, unless stated otherwise.

Per-court duration streams produce 16–24 simulated minutes and are shared across arms by physical court/assignment ordinal. Preview RNG is cloned; only actual assignments advance it. Waiting considers only the next completion group, at most once per refill decision, with the existing five-minute cap and either ≥1 new courtmate pair/court or ≥0.5 signed rolling-T gain/court. No thresholds were retuned.

The normal bounded path retains **50,000 branches and 2,000 ms per phase**. Existing small-roster search (≤14 active players and ≤2 courts) remains unlimited. Frontier and final-ranking phases have separate caps, so a combined call can exceed two seconds while certifying. Unlimited original-engine runs were diagnostic only.

Matcher source-set SHA-256: `4c0b336d294b273e6d86cd4b99417b07ae4bf9d2e9ed527c10fc10d4cdd7bd5e`. Clock measurement SHA-256: `4b7daaa34df4d022578f6796ef84634584b83ea8331e0a252d1024474a645af0`. Preflight, postflight, and final current-file checks agree. The scheduler source remains `14aff372…09e1cb`; the old validator only gained a public session adapter. Earlier pending v1/v2 instrumentation diagnostics are excluded.

[Validated manifest](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-readiness/full-2026-10-07-v3/real-clock-grid/social-readiness-clock-run-manifest.json), [full summary JSON](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-readiness/full-2026-10-07-v3/real-clock-grid/social-readiness-summary-v1.json), [270 per-seed checkpoint rows](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-readiness/full-2026-10-07-v3/real-clock-grid/social-readiness-session-checkpoints-v1.csv), [20,424 matcher calls](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-readiness/full-2026-10-07-v3/real-clock-grid/social-readiness-search-calls-v1.csv), [rescue audit](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-readiness/full-2026-10-07-v3/real-clock-grid/social-readiness-rescue-costs-v1.csv), [paired deltas and cost ratios](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-readiness/full-2026-10-07-v3/real-clock-grid/social-readiness-paired-deltas-v1.csv).

## Original failed-session reruns

Each row has 3/3 successful openings and fully certified refills, with zero actual limits or fairness/starvation/Gmax/full-priority failures. Counts exclude hypothetical joint probes. Short and 100-match runs overlap and must not be added as distinct histories.

| Run | Certified calls | Refills | Worst opening ms | Refill p95 ms | Explored | Pruned | Prune ratio % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| short-16-8-8-2c | 72/72 | 69 | 362.3 | 34.2 | 74321 | 8327 | 10.08 |
| short-18-9-9-3c | 81/81 | 78 | 2562.9 | 15.0 | 163557 | 18669 | 10.24 |
| 100-16-8-8-2c | 300/300 | 297 | 302.6 | 29.7 | 254783 | 8327 | 3.16 |
| 100-18-9-9-3c | 300/300 | 297 | 1535.6 | 12.1 | 238187 | 18669 | 7.27 |

The cold short 18/3 opening took 2,562.9 ms combined and still certified within separate phase caps. Pruned/(explored+pruned) is a recorded event ratio, not the proportion of all mathematical layouts eliminated; overlap/symmetry skips are not all counted.

The legacy short raw report saved only its older 21-match checkpoint. Independent derivation supplies the true 24/27 endpoints and matched 186 saved checkpoint scalars before deriving them. Counts map appearances → number of players.

| Profile | Seed | Matches | Counts | Mean C peers | Min peers | C | Worst C | Pairs | Full C players | T | Both | M/O | Longest mono |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 16-8-8-2c | 1 | 24 | {"5":4,"6":8,"7":4} | 13.00 | 11 | 0.867 | 0.733 | 104/120 | 1 | 1.000 | 1.000 | 20/4 | 5 |
| 16-8-8-2c | 4729 | 24 | {"5":4,"6":8,"7":4} | 10.25 | 5 | 0.683 | 0.333 | 82/120 | 0 | 1.000 | 1.000 | 13/11 | 4 |
| 16-8-8-2c | 104729 | 24 | {"5":4,"6":8,"7":4} | 10.75 | 8 | 0.717 | 0.533 | 86/120 | 0 | 1.000 | 1.000 | 12/12 | 5 |
| 18-9-9-3c | 1 | 27 | {"5":4,"6":10,"7":4} | 12.11 | 8 | 0.712 | 0.471 | 109/153 | 0 | 0.972 | 0.944 | 15/12 | 6 |
| 18-9-9-3c | 4729 | 27 | {"4":1,"5":4,"6":7,"7":6} | 12.33 | 8 | 0.725 | 0.471 | 111/153 | 0 | 0.972 | 0.944 | 19/8 | 4 |
| 18-9-9-3c | 104729 | 27 | {"5":4,"6":10,"7":4} | 11.78 | 8 | 0.693 | 0.471 | 106/153 | 0 | 1.000 | 1.000 | 17/10 | 4 |

[True short endpoints](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-readiness/full-2026-10-07-v3/legacy-short-endpoints-independent.json) include P/O breadth, entropy, rest, B2B, gaps, and available rest. Legacy mean rest includes first appearances; the clock rest cohort excludes them. Do not pool those protocols.

The 16/2 normal winner (307 ms; 6,559 explored / 2,776 pruned) exactly matches the unlimited original (5,805 ms; 3,950,156 explored). The 18/3 reference timed out at 90 seconds, and its entire process group was terminated. See [proof and oracle scope](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/docs/social-frontier-search-proof.md) and [original-control evidence](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-frontier-scalability/control/exactness-diagnostic-results.json).

## Realistic matcher benefit at 100

Cells are three-seed means. C is lifetime feasible courtmate coverage; T and Both use the latest six appearances. All grid players structurally have both types feasible. Longest mono is the longest personal consecutive single-type appearance run in each history.

| Players / sides / courts | C at 100 | T at 100 | Both at 100 | Longest mono |
| --- | --- | --- | --- | --- |
| 10 / 5+5 / 2 | 0.815 → 1.000 → 1.000 | 0.500 → 0.500 → 0.867 | 0.000 → 0.000 → 0.733 | 40.0 → 40.0 → 9.7 |
| 12 / 6+6 / 2 | 0.919 → 1.000 → 1.000 | 0.500 → 1.000 → 1.000 | 0.000 → 1.000 → 1.000 | 33.3 → 7.7 → 6.0 |
| 14 / 7+7 / 2 | 1.000 → 1.000 → 1.000 | 0.548 → 0.976 → 1.000 | 0.095 → 0.952 → 1.000 | 13.0 → 7.0 → 6.7 |
| 16 / 8+8 / 2 | 1.000 → 1.000 → 1.000 | 0.990 → 0.958 → 0.990 | 0.979 → 0.917 → 0.979 | 6.3 → 6.3 → 5.3 |
| 14 / 8+6 / 2 | 1.000 → 1.000 → 1.000 | 0.976 → 1.000 → 1.000 | 0.952 → 1.000 → 1.000 | 7.3 → 6.0 → 5.3 |
| 14 / 9+5 / 2 | 1.000 → 1.000 → 1.000 | 0.810 → 1.000 → 0.988 | 0.619 → 1.000 → 0.976 | 12.7 → 9.0 → 7.3 |
| 14 / 10+4 / 2 | 1.000 → 1.000 → 1.000 | 0.976 → 1.000 → 1.000 | 0.952 → 1.000 → 1.000 | 8.3 → 6.7 → 6.0 |
| 15 / 8+7 / 3 | 1.000 → 1.000 → 1.000 | 0.911 → 0.978 → 1.000 | 0.822 → 0.956 → 1.000 | 14.0 → 11.7 → 7.7 |
| 16 / 8+8 / 3 | 0.972 → 1.000 → 1.000 | 0.562 → 1.000 → 1.000 | 0.125 → 1.000 → 1.000 | 25.0 → 8.7 → 6.0 |
| 18 / 9+9 / 3 | 1.000 → 1.000 → 1.000 | 0.991 → 1.000 → 0.991 | 0.981 → 1.000 → 0.981 | 9.0 → 7.0 → 6.7 |

Every candidate profile covers all feasible lifetime courtmate pairs and every player has complete coverage at 100; minimum peers is roster size minus one. The canonical 14/2 matcher supplies the large recurrence gain. The 16/2 endpoint regression and early exceptions are retained; exact local ranking is not a global endpoint optimizer.

## Early scheduler benefit and cost

Arrows here are beneficial immediate → conditional. Ratios divide the seed-mean coverage difference by seed-mean idle percentage points; they do not promise linear returns.

| Profile | Matches | C | T | Both | Wait idle % | Δ C pp / 1 idle pp | Δ elapsed min |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10 / 5+5 / 2 | 15 | 1.000 → 0.985 | 0.500 → 1.000 | 0.000 → 1.000 | 2.655 | -0.56 | 4.90 |
| 12 / 6+6 / 2 | 18 | 0.939 → 0.980 | 1.000 → 0.986 | 1.000 → 0.972 | 1.758 | 2.30 | 1.72 |
| 14 / 7+7 / 2 | 21 | 0.908 → 0.949 | 0.988 → 1.000 | 0.976 → 1.000 | 1.551 | 2.60 | 4.61 |
| 16 / 8+8 / 2 | 24 | 0.872 → 0.933 | 1.000 → 1.000 | 1.000 → 1.000 | 0.909 | 6.73 | 2.03 |
| 14 / 8+6 / 2 | 21 | 0.956 → 0.941 | 0.988 → 1.000 | 0.976 → 1.000 | 1.593 | -0.92 | 4.69 |
| 14 / 9+5 / 2 | 21 | 0.901 → 0.934 | 0.976 → 0.964 | 0.952 → 0.929 | 1.170 | 2.82 | 3.53 |
| 14 / 10+4 / 2 | 21 | 0.923 → 0.934 | 1.000 → 0.952 | 1.000 → 0.905 | 0.805 | 1.37 | 1.84 |
| 15 / 8+7 / 3 | 23 | 0.829 → 0.898 | 1.000 → 0.989 | 1.000 → 0.978 | 1.541 | 4.53 | 1.98 |
| 16 / 8+8 / 3 | 24 | 0.786 → 0.867 | 1.000 → 1.000 | 1.000 → 1.000 | 2.243 | 3.59 | 2.94 |
| 18 / 9+9 / 3 | 27 | 0.808 → 0.882 | 1.000 → 1.000 | 1.000 → 1.000 | 1.400 | 5.29 | 3.25 |

Waiting improves early breadth in the three-court profiles but can reduce early type coverage or breadth elsewhere. At 10/2 it mainly unlocks recurring types rather than additional lifetime breadth. Short-session cost is less diluted than endpoint idle percentages.

## Scheduler time, rest, and fairness at 100

Arrows are beneficial immediate → conditional. Primary wait rate is all attempted non-opening refills: **172/2,798 = 6.147%**. Thirty terminal decisions at 99 completions assign new matches that are later censored; they remain in that denominator. Restricting to future-preview/horizon-eligible decisions yields 172/2,768 = 6.214%. Mean wait is 2.285 minutes, p95 4.564, maximum 4.909.

| Profile | Waits / opportunities | Mean wait min | Max wait min | Idle % | Δ elapsed min | B2B % | Count spread | Mean rest | Mean p95 rest | Worst rest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 / 5+5 / 2 | 30/267 (11.24%) | 2.61 | 4.91 | 1.297 | 13.06 | 51.62 → 57.09 | 0.00 → 1.33 | 0.50 → 0.59 | 1.00 → 2.00 | 2 → 3 |
| 12 / 6+6 / 2 | 14/283 (4.95%) | 2.42 | 4.77 | 0.562 | 7.03 | 13.92 → 13.83 | 1.00 → 1.00 | 1.00 → 1.05 | 2.00 → 2.00 | 3 → 3 |
| 14 / 7+7 / 2 | 17/280 (6.07%) | 2.76 | 4.35 | 0.785 | 7.91 | 10.02 → 8.46 | 1.00 → 1.00 | 1.49 → 1.55 | 3.00 → 3.00 | 4 → 5 |
| 16 / 8+8 / 2 | 12/285 (4.21%) | 2.19 | 4.56 | 0.442 | 3.46 | 5.99 → 4.69 | 0.00 → 0.00 | 2.00 → 2.04 | 3.67 → 3.33 | 4 → 5 |
| 14 / 8+6 / 2 | 9/288 (3.12%) | 2.24 | 4.56 | 0.339 | 4.18 | 6.22 → 4.66 | 1.00 → 1.00 | 1.50 → 1.53 | 2.33 → 3.00 | 4 → 5 |
| 14 / 9+5 / 2 | 10/287 (3.48%) | 1.81 | 3.74 | 0.302 | 3.19 | 10.28 → 9.33 | 1.00 → 1.00 | 1.49 → 1.53 | 3.00 → 3.00 | 5 → 5 |
| 14 / 10+4 / 2 | 8/289 (2.77%) | 2.55 | 4.77 | 0.338 | 1.85 | 7.60 → 7.60 | 1.00 → 1.00 | 1.50 → 1.52 | 3.00 → 3.00 | 4 → 5 |
| 15 / 8+7 / 3 | 24/273 (8.79%) | 1.95 | 4.44 | 0.770 | 2.97 | 39.22 → 36.19 | 1.00 → 1.00 | 0.75 → 0.82 | 2.00 → 2.00 | 5 → 4 |
| 16 / 8+8 / 3 | 27/270 (10.00%) | 1.94 | 4.87 | 0.862 | 3.48 | 19.88 → 16.32 | 0.00 → 0.00 | 1.00 → 1.09 | 2.00 → 2.00 | 4 → 4 |
| 18 / 9+9 / 3 | 21/276 (7.61%) | 2.36 | 4.79 | 0.811 | 5.63 | 15.10 → 13.09 | 1.00 → 1.00 | 1.49 → 1.57 | 3.33 → 3.33 | 6 → 6 |

Actual candidate fairness/starvation failures are zero. Maximum observed available-player rest is six completed-match turns. Rest excludes busy/paused time; B2B uses post-first appearances with rest=0. The CSV preserves per-player counts/distributions, p95 and maxima, completion-to-next-assignment gaps, completion-to-completion gaps, and elapsed-rest diagnostics. Completion gaps can include time when a player is busy, so they differ from available rest.

At 10/2, B2B increases 5.47 percentage points and mean count spread becomes 1.33 (worst 2). At 18/3, waiting has slightly lower endpoint T despite earlier breadth and lower B2B. Small idle cost alone does not establish a universal benefit.

## Secondary relationships at 100

Arrows use all three arms. Entropy is normalized encounter-frequency entropy. M/O totals are seed-mean completed match counts, not targets.

| Profile | Partner coverage | Opponent coverage | Partner entropy | Opponent entropy | MIXED / OWN_SIDE |
| --- | --- | --- | --- | --- | --- |
| 10 / 5+5 / 2 | 0.519 → 0.556 → 1.000 | 0.815 → 1.000 → 1.000 | 0.697 → 0.731 → 0.996 | 0.873 → 0.994 → 0.922 | 66.7/33.3 → 100.0/0.0 → 54.3/45.7 |
| 12 / 6+6 / 2 | 0.616 → 1.000 → 0.985 | 0.919 → 0.980 → 0.975 | 0.658 → 0.963 → 0.946 | 0.772 → 0.874 → 0.872 | 77.7/22.3 → 58.0/42.0 → 60.7/39.3 |
| 14 / 7+7 / 2 | 1.000 → 1.000 → 0.996 | 1.000 → 1.000 → 1.000 | 0.964 → 0.970 → 0.970 | 0.959 → 0.945 → 0.947 | 70.0/30.0 → 64.7/35.3 → 63.7/36.3 |
| 16 / 8+8 / 2 | 1.000 → 0.858 → 0.836 | 1.000 → 0.867 → 0.903 | 0.977 → 0.884 → 0.888 | 0.933 → 0.821 → 0.844 | 56.0/44.0 → 53.3/46.7 → 58.7/41.3 |
| 14 / 8+6 / 2 | 1.000 → 1.000 → 1.000 | 1.000 → 1.000 → 1.000 | 0.988 → 0.974 → 0.976 | 0.928 → 0.919 → 0.931 | 53.3/46.7 → 60.3/39.7 → 60.3/39.7 |
| 14 / 9+5 / 2 | 1.000 → 1.000 → 1.000 | 1.000 → 0.996 → 1.000 | 0.976 → 0.981 → 0.977 | 0.952 → 0.939 → 0.935 | 59.0/41.0 → 55.0/45.0 → 54.7/45.3 |
| 14 / 10+4 / 2 | 1.000 → 1.000 → 1.000 | 1.000 → 1.000 → 1.000 | 0.989 → 0.982 → 0.982 | 0.929 → 0.927 → 0.932 | 42.0/58.0 → 47.3/52.7 → 48.0/52.0 |
| 15 / 8+7 / 3 | 0.981 → 0.981 → 0.987 | 1.000 → 0.997 → 1.000 | 0.955 → 0.958 → 0.955 | 0.938 → 0.922 → 0.938 | 68.3/31.7 → 66.3/33.7 → 65.7/34.3 |
| 16 / 8+8 / 3 | 0.647 → 0.908 → 0.869 | 0.958 → 0.917 → 0.872 | 0.768 → 0.920 → 0.890 | 0.890 → 0.849 → 0.840 | 83.3/16.7 → 57.3/42.7 → 62.0/38.0 |
| 18 / 9+9 / 3 | 0.987 → 0.904 → 0.924 | 0.993 → 0.932 → 0.963 | 0.971 → 0.934 → 0.943 | 0.938 → 0.920 → 0.925 | 59.7/40.3 → 63.0/37.0 → 61.7/38.3 |

Secondary quality also has material tradeoffs. At 16/2, immediate beneficial rescue lowers partner/opponent coverage from production's 1.000/1.000 to 0.858/0.867; at 18/3 it lowers 0.987/0.993 to 0.904/0.932. These are preserved observations under the fixed courtmate/type-first hierarchy, not evidence that every facet improves together. The tables and per-seed data should inform the later adoption decision.

## Search diagnostics and boundaries

Actual invocations below are batch selections, not individual court matches.

| Arm | Phase | Calls | Mean ms | Median ms | p95 ms | Max ms | Explored | Pruned | Prune ratio % | Limits |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| production-immediate | opening | 30 | 210.06 | 231.83 | 335.57 | 355.27 | 8619285 | 0 | 0.00 | 12 |
| production-immediate | refill | 2970 | 7.74 | 8.17 | 21.80 | 26.38 | 953351 | 0 | 0.00 | 0 |
| beneficial-immediate | opening | 30 | 254.71 | 109.34 | 1186.70 | 1366.31 | 247130 | 67045 | 21.34 | 0 |
| beneficial-immediate | refill | 2970 | 8.31 | 8.80 | 22.06 | 30.60 | 842788 | 0 | 0.00 | 0 |
| beneficial-conditional-wait | opening | 30 | 239.41 | 82.68 | 1131.73 | 1217.02 | 247130 | 67045 | 21.34 | 0 |
| beneficial-conditional-wait | refill | 2798 | 13.52 | 9.00 | 25.78 | 629.62 | 5005670 | 158272 | 3.06 | 0 |

All 5,828 accepted candidate executions fully certify with zero limits. Production has 12 actual opening soft-limit results at 16/2 and 15/16/18 on three courts; fairness/starvation remain certified and production accepts them under its existing contract. There are 12 matching limited current previews. Candidate Gmax/full-priority fields are not production requirements.

Of 2,768 future previews, **81 hit limits, all in 16/2**. Six return no selection and lack fairness/starvation proof; five lack Gmax proof; all 81 lack full-priority/variety proof. No uncertified preview justified waiting. The decline reason is `future-preview-uncertified` for 22; the other 59 limited previews were first rejected by the >5-minute forecast gate.

Future-preview mean/p95/max runtime is 96.30/234.27/713.14 ms; total measured future-preview CPU is 266.56 seconds. Candidate immediate execution mean/p95/max is 10.77/22.79/1,366.31 ms; conditional actual execution is 15.91/33.16/1,217.02 ms. Simulated idle and elapsed tables omit matcher computation, UI delay, and score-entry delay; they do not measure total live operational cost.

All six legacy all-court 18/3 probes at prefixes 20/50 remain uncertified and unexecuted. The separate 20/10+10/3 opening probe returns diagnostic selections in all three seeds but hits the final-phase limit: explored 53,609/53,625/53,601; pruned 5,211/5,243/5,262; combined runtime 1,628/1,454/1,178 ms. Fairness/starvation/Gmax certify; full priority does not. No probe match executes. See [boundary manifest](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-readiness/full-2026-10-07-v3/boundary-20-10-10-3c/social-frontier-scalability-run-manifest.json).

## One-pair rescue audit

158/5,828 candidate decisions are one-pair concessions (2.711%): immediate 85/3,000; conditional 73/2,828. All have strict conditional benefit, minimum 0.5, maximum 2.5, total 119.5. Zero benefit = 0; negative conditional benefit = 0; maximum deficit = 1. All concession-assigned courts completed before the cap; none was censored.

For this grid, 2 × conditional T benefit gives **239 comparative net both-type-window units** relative to the best T at full Gmax. These are counterfactual batch comparisons, not 239 distinct players or measured cumulative endpoint gains. There are 136 concessions after all players' first completion and 22 earlier. Startup gains cancel: T = (nonempty-window indicator + both-type indicator)/2; the full fairness count vector fixes the number of selected zero-count players; baseline equals completed count; all players have two feasible types. Thus the first-window term cancels between admitted and full-Gmax batches. Negative absolute chosen ΔT is distinct from negative conditional benefit.

## Separate topology and product prerequisites

**10/2 topology:** a MIXED opening leaves 3+3 available after one court finishes, temporarily preventing OWN_SIDE. Immediate MIXED refills recreate the state. Waiting changes available cohorts; full-roster structural feasibility and scoring stay unchanged.

**Extreme low-reserve stress scenario — 4 players per court:** the retained 12/3 result (C 0.273 → 1.000, T 0.500 → 0.944) is topology evidence, not the primary production design target. Every new primary profile has at least five players/court.

**8 one-side / 2 courts:** immediate refill freezes four-player cohorts (3/7 lifetime courtmates), the same availability topology. Waiting reaches all seven peers, yet 282/294 completed refills repeat each selected player's latest quartet. That denominator includes all post-opening completed refills; it is not restricted to the period after saturation. Lifetime coverage does not ensure continuing rotation. This separate post-saturation question remains deferred. See [prior scheduler results](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/docs/social-joint-refill-results.md) and [topology note](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/docs/social-asynchronous-refill-topology.md).

**Forecasting:** the simulator knows exact future finish times. Production needs credible estimates of the next court/group likely to finish within five minutes, current court/score progress or completion signals, forecast uncertainty/error measurement, and revised-estimate/late-score handling. Joint selection also needs atomic cohort reservations, bounded wait/cancel behavior, and availability revalidation. These inputs and mechanisms were not implemented or tested here.

**Candidate acceptance:** before adoption, every candidate selection/replacement path must require fairness/starvation/Gmax/full-priority/variety proof before accepting a returned selection. Existing routes accept a returned selection before limit handling in some paths, e.g. [selection.ts:1604](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/src/app/api/sessions/[code]/generate-match/selection.ts:1604) and [selection.ts:2138](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/src/app/api/sessions/[code]/generate-match/selection.ts:2138). The experimental candidate is not the default there; this is a future integration prerequisite, not a current candidate production incident. Routes remain unchanged.

## Verification and reproducibility

The new focused oracle/control suite passes 18/18; TypeScript and scoped ESLint pass. Ten raw reports passed independent state/score/scheduler/telemetry validation and rejected branch-evidence and valid wait-reason tampering. Summary pins guard raw hashes, seed/arm/profile inventory, budget snapshots, certificates, and rescue invariants. A final independent check verified 5,400 checkpoint scalar comparisons, all 270 CSV horizons, 20,424 call counts, rejected-preview certificate fields, wait-rate denominators, and rescue invariants. Its [saved verification result](/Users/shazlinsalamat/Documents/Codex/2026-10-05/s/outputs/anti-selek/benchmarks/generated/social-readiness/full-2026-10-07-v3/real-clock-grid/social-readiness-independent-summary-check.json) pins the final summary and analysis-script hashes.

Regenerate endpoints with `python3 scripts/derive-social-readiness-legacy-endpoints.py`, then run `node scripts/summarize-social-readiness.mjs --force`. This reads validated raw reports and replaces generated summary/CSV outputs only. Measurements used a dirty working tree at commit `973081e7120bfd78f7c3808360aa37344b18e051`; source hashes identify the actual code.

Three seeds, static roster profiles, simulated durations, and 100-completion horizons limit these conclusions. Short-session metrics carry more practical weight than saturated lifetime coverage at 100. Keep objective and wait thresholds fixed while addressing search and product prerequisites. Production adoption, deployment, and migration remain held.
