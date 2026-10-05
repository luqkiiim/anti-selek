# Matchmaking benchmark artifacts

## Artifact storage and publication

Keep benchmark code, reviewed Markdown reports, compact `*.summary.json`
snapshots, and source provenance in Git. Normal runs write raw JSON, reports,
and summaries under ignored `benchmarks/generated/`. Raw JSON, compressed raw
JSON, incomplete `.pending` outputs, and `.writing` files elsewhere under
`benchmarks/` are also ignored unless explicitly listed as frozen fixtures.

The 19 historical session dumps present at `c0c033af` are frozen lossless
`.json.gz` fixtures. Their original 200.63 MiB of JSON occupies 8.58 MiB as
archives. Each has a readable summary and an entry in
[fixtures.manifest.json](fixtures.manifest.json) recording original and archive
byte counts, SHA-256 hashes, the summary hash, original source provenance, and
retention reason. No raw history was truncated or rescored during archival.
Older reports without validation status are explicitly marked as unrecorded,
not retroactively certified.

Ten fixtures are the five canonical 21/400 policy runs and their five matching
21-match horizon runs; comparisons and independent prefix audits need the full
completed histories, schedules, and structural evidence. Four older 20/400
runs and five pilot session dumps remain frozen to support exact rerendering
and existing historical comparison commands. Small comparison JSONs remain
tracked because they already contain compact metrics and provenance.

The three largest retained archives are the coverage-gated canonical run
(77.83 MiB raw → 2.81 MiB gzip), ungated replay-envelope canonical run
(28.55 → 1.26 MiB), and older 20/400 current run (26.84 → 1.21 MiB). The first
two support current policy comparisons; the older run preserves the previous
measurement cohort. These are frozen compatibility fixtures, not destinations
for subsequent benchmark runs. Ordinary writes refuse to overwrite existing
run artifacts. Git history is unchanged, so existing clones/history retain
their old blobs; this cleanup reduces checkout size and prevents future raw
dump commits rather than shrinking history.

Benchmark readers accept an explicit `.json.gz` path or resolve an old `.json`
argument to its compressed sibling when the plain file is absent. Summaries
are deliberately rejected as full-fixture inputs: they cannot certify layout
prefixes or witness diagnostics. Verify all frozen contents with:

```sh
node scripts/verify-benchmark-fixtures.mjs
```

Run the default legacy matcher against the official 21-match KPI with:

```sh
node scripts/run-social-horizon-benchmark.mjs --only-policy current
node scripts/compare-social-horizon-benchmarks.mjs
```

Both commands write only into ignored generated directories. For another run,
use a fresh `--out-dir benchmarks/generated/<run-name>`. Once reviewed, publish
a compact snapshot (maximum 1 MiB) and selected human report deliberately:

```sh
node scripts/summarize-benchmark.mjs benchmarks/generated/social-horizon-321/current/social-horizon-21-current-legacy-gate.json benchmarks/results/my-run.summary.json
```

Copy the corresponding Markdown report into `benchmarks/results/` if it is
useful for review. Summaries retain source hashes, raw-content hash, cohort,
per-seed checkpoint coverage/KPI, B2B, event rest, fairness, balance and
certification counters; unbounded witness lists and raw assignment histories
remain in local generated output. New runs do not need new frozen archives.

## Primary social-horizon 3:2:1 score

The current benchmark's primary score is the structural relationship horizon score. For each player, courtmate coverage `C` is distinct feasible courtmates seen divided by `min(feasible courtmates, 13)`, opponent coverage `O` uses cap 12, and partner coverage `P` uses cap 6. The player score is `(3C + 2O + P) / active weight`; empty facets are excluded and the remaining weights are renormalized. The session score is the average across players with at least one feasible facet. Feasibility comes from the full structural roster vocabulary and never shrinks for availability, pauses, or the Balanced guardrail. Only completed tuples count at a checkpoint.

This score is distinct from normalized Shannon entropy: the horizon asks how much capped feasible variety a player has reached, while entropy measures how evenly experiences have been distributed. The earlier equal-weight relationship VCS remains a secondary metric. On the five shared narrow seeds, the independently rescored 21-match horizon means and normalized entropy means are:

| Policy | Horizon score, Social / Points / Elo | Normalized entropy, Social / Points / Elo |
|---|---|---|
| Entropy first | 81.746% / 81.746% / 81.716% | 81.7% / 81.7% / 81.7% |
| Strict cadence | 71.890% / 71.400% / 72.180% | 55.8% / 55.8% / 54.4% |
| Type entropy first | 74.770% / 74.770% / 74.590% | 80.6% / 80.6% / 80.7% |
| Ungated replay envelope | 79.850% / 79.850% / 79.970% | 80.5% / 80.5% / 80.5% |
| Legacy-metric coverage gate | 81.160% / 81.160% / 81.680% | 79.4% / 79.4% / 79.5% |
| Experimental 3:2:1 coverage gate | 81.160% / 81.160% / 80.293% | 77.8% / 77.8% / 79.7% |

The default remains the legacy-metric coverage gate. The experimental 3:2:1 gate, measured at source revision `248eb35f4dbadacdafd7db0afe1d4f5e6589dfb0`, did not improve the 21-match averages: Social and Points are essentially unchanged (+0.00305 percentage points in paired raw means), while Elo is lower by 1.38 percentage points. Pooled B2B is unchanged for Social and Points (23.1% each) and decreases from 23.4% to 22.9% for Elo. The comparison report includes each seed's paired score and B2B count deltas.

The machine-readable per-seed result and full human report are [social-horizon-policy-comparison.json](social-horizon-321/social-horizon-policy-comparison.json) and [social-horizon-policy-comparison.md](social-horizon-321/social-horizon-policy-comparison.md). They include C/O/P facet means, average distinct counts, the legacy VCS, per-seed completed counts, B2B, rest, fairness, starvation, match-type counts, and the previously measured 400-match secondary results. Aggregate B2B is pooled as total zero-rest assignments divided by total eligible post-first-match assignments. The displayed aggregate rest p95 is the mean of per-seed p95s; the worst maximum is the maximum across seeds.

The old five-policy data are rescored without simulation from saved completed tuples. To rerender that comparison:

```powershell
node scripts/compare-social-horizon-benchmarks.mjs
```

The opt-in matcher variant uses the same 3:2:1 coverage delta for its replay gate. A 400-target run contains both the exact 21 and 400 completed-match checkpoints. It can be run and added to the comparison with:

```powershell
node scripts/run-social-horizon-benchmark.mjs --only-policy current --target-matches 400 --coverage-gain-metric social-horizon-321 --out-dir benchmarks/generated/horizon-manual-rerun
node scripts/compare-social-horizon-benchmarks.mjs --horizon-321-gated benchmarks/generated/horizon-manual-rerun/current/social-horizon-400-current-horizon-321-gate.json
```

That opt-in variant's 400 score, normalized entropy, uncapped relationship VCS/facets, starvation, rest, fairness, and early/late match types are reported separately; the earlier policy rows remain unchanged.

## Historical equal-weight relationship VCS benchmark (21/400)

The current benchmark models 14 fixed players (P1–P7 men and P8–P14 women with FEMALE_FLEX), Mixed doubles on two courts, and asynchronous completion: one seeded court completes per event and is refilled. At each seed, formats and policies share the same identities, genders, preferences, skill ranks, and completion schedule. The narrow skill profile maps rank to Points/Social strength as `10 + 0.1 × rank` and Rating strength as `900 + 4 × rank`; the wide sensitivity profile uses `10 + 1 × rank` and `900 + 40 × rank`. `pointDiff` is zero because this is a matchmaking benchmark, not a match-outcome simulation.

The standard run has five narrow seeds (`1, 4729, 104729, 130363, 2097593`) across Social, Balanced Points, and Balanced Rating/Elo, plus three wide seeds (`30011, 65537, 999983`) for both Balanced formats: 21 sessions per policy. Checkpoints are taken after exactly 21 and 400 matches have completed. Active, unfinished assignments are excluded from those checkpoint histories. The 21-match checkpoint also stores every player's completed-match count; the theoretical 84 player-slots are not assumed to be evenly distributed.

The five historical policies use the same benchmark harness and schedule. The experimental horizon-gated policy is a separate opt-in measurement at source revision `248eb35f4dbadacdafd7db0afe1d4f5e6589dfb0`; it does not replace the legacy gate by default:

| Policy | Engine revision | Measurement snapshot | 21/400 artifact paths |
|---|---|---|---|
| Entropy first | `de0254f84adef7414b512e3d3fd936033d65bef8` | Recorded per JSON provenance | `social-coverage-21/social-coverage-full21-entropy-first.{json,md}` |
| Strict cadence | `93262f36336b9533ba96b4e4bec5d7e8061eef6e` | Recorded per JSON provenance | `social-coverage-21/social-coverage-full21-strict-cadence.{json,md}` |
| Type entropy first | `bcf07fb22cded580c7e2c0c72d6a5a58bc4eb49d` | Recorded per JSON provenance | `social-coverage-21/type-first-final/social-coverage-full21-type-entropy-first.{json,md}` |
| Ungated replay envelope | `7ab071ad0102ff8a2012a267d8cfe796a1f325a8` | Recorded per JSON provenance | `social-coverage-21/replay-envelope/social-coverage-full21-replay-envelope.{json,md}` |
| Legacy-metric coverage gate | Engine implementation `39e0d351924f40411e7eb33564b04825b76f8049` | Measured snapshot `71927c6cbc70e13e6ec28b4a534fcdf8481a95c1` | `social-coverage-21/coverage-gated/social-coverage-full21-coverage-gated.{json,md}` |

Each JSON records the engine commit, tracked-source status, and hashes for the engine and measurement harness. The measurement harness is copied into historical worktrees; the report records that instrumentation and the engine source separately. The current policy keeps the Balanced admissibility envelope fixed, then certifies the minimum immediate-replay count. A batch at that minimum is admitted; a batch with one more immediate replay is admitted only when its normalized first-exposure coverage gain strictly exceeds the maximum gain at the minimum. Candidates beyond that allowance are rejected. The gate scores each player's equal-weight mean of feasible first-exposure partner, opponent, courtmate, and (in Mixed) match-type facets. The primary Variety Coverage Score remains the three relationship facets; match-type coverage is reported separately. Combined normalized entropy and soft cadence rank admitted choices afterward.

## Five-policy results on the narrow profile

The values below are means over the same five narrow seeds and three formats. The full comparison report includes normalized entropy facets, rest distributions, fairness, starvation, per-player checkpoint-21 counts, wide-profile results, missing pairs, and counterfactual witnesses.

| Policy | VCS at 21 (Social / Points / Elo) | VCS at 400 | B2B rate at 400 | OWN_SIDE completed at 400 | OWN_SIDE, last 100 |
|---|---|---|---|---|---|
| Entropy first | 64.9% / 64.9% / 64.9% | 100.0% / 100.0% / 100.0% | 29.5% / 29.7% / 29.8% | 173.4 / 174.0 / 173.8 | 43.2 / 44.2 / 44.4 |
| Strict cadence | 56.9% / 56.6% / 57.2% | 84.9% / 84.9% / 84.6% | 12.6% / 12.6% / 12.6% | 0.4 / 0.4 / 0.0 | 0 / 0 / 0 |
| Type entropy first | 59.6% / 59.6% / 59.5% | 100.0% / 100.0% / 100.0% | 26.3% / 26.3% / 26.6% | 199.2 / 199.2 / 199.2 | 50.2 / 50.2 / 51.0 |
| Ungated replay envelope | 63.4% / 63.4% / 63.6% | 100.0% / 100.0% / 100.0% | 24.9% / 24.7% / 24.8% | 175.2 / 173.8 / 173.8 | 43.8 / 44.8 / 45.2 |
| Legacy-metric coverage gate | 64.5% / 64.5% / 64.9% | 100.0% / 100.0% / 100.0% | 14.7% / 14.7% / 14.6% | 40.4 / 40.4 / 41.6 | 0 / 0 / 0 |

The legacy-metric coverage-gated policy reached 100% relationship coverage in all five narrow seeds for each format. At exactly 21 completed matches, four of five seeds in each format had all fourteen players at exactly six matches; seed 1 had a 5–7 count range (spread 2). At 400, normalized entropy averaged 83.3% for Social and Points and 83.6% for Elo, so full relationship coverage did not mean even repetition. The worst assignment-rest maxima across seeds were 7, 6, and 6 for Social, Points, and Elo; mean p95 assignment rest was 3.4 for each. Back-to-back rates were 14.7%, 14.7%, and 14.6%.

At 400, starvation changed the selected set on 49/1,995, 46/1,995, and 49/1,995 completed rotation decisions for Social, Points, and Elo (2.5%, 2.3%, and 2.5% overall). Among overdue decisions, the rates were 15.1%, 14.4%, and 14.8%; each format had zero uncertified counterfactuals. This completed-decision cohort differs from the gate's issued-refill cohort, even though both total 1,995 here. Gate decision counts and candidate counts are distinct and can overlap across a refill when both eligible and rejected +1 candidates exist:

| Format | +1 available | +1 coverage-eligible | +1 selected | +1 rejected without improved coverage | Higher-entropy candidates beyond best+1 replay allowance |
|---|---:|---:|---:|---:|---:|
| Social | 1,182 decisions / 53,498 candidates | 120 / 1,364 | 105 / 105 | 1,178 / 52,134 | 656 decisions / 13,459 candidates |
| Balanced Points | 1,182 / 53,567 | 120 / 1,364 | 105 / 105 | 1,178 / 52,203 | 643 / 13,287 |
| Balanced Rating/Elo | 1,186 / 53,546 | 121 / 1,323 | 102 / 102 | 1,181 / 52,223 | 635 / 13,104 |

The wide profile reached 98.5% relationship coverage for Points and 95.6% for Elo. Its unseen structurally feasible pairs were all balance-envelope exclusions, repeated in all three wide seeds: Points partners P1–P2, P13–P14, P6–P7, and P8–P9; Elo partners P1–P2, P1–P3, P1–P8, P8–P10, P12–P14, P13–P14, P7–P14, P5–P7, P6–P7, and P8–P9, plus opponents P1–P14 and P7–P8. No narrow-format relationship pairs remained unseen at 400.

Run the current policy and compare it against the saved historical JSONs with:

```powershell
npm run benchmark:matchmaking -- --baseline-json benchmarks/social-coverage-21/social-coverage-full21-entropy-first.json --strict-json benchmarks/social-coverage-21/social-coverage-full21-strict-cadence.json --type-first-json benchmarks/social-coverage-21/type-first-final/social-coverage-full21-type-entropy-first.json --replay-envelope-json benchmarks/social-coverage-21/replay-envelope/social-coverage-full21-replay-envelope.json --out-dir benchmarks/generated/social-coverage-21
```

The default seed lists and 21/400 checkpoints are used unless overridden. `--seeds` and `--wide-seeds` accept comma-separated seed lists. `--out-dir` isolates report output. To rerun one historical policy, use `--only-policy baseline|strict|type-first|replay-envelope` with the matching `--baseline-worktree`, `--strict-worktree`, `--type-first-worktree`, or `--replay-envelope-worktree` option and an explicit `--out-dir`. The worktree must be at the pinned revision named above. The current policy can be run alone with `--only-policy current --out-dir <path>`.

The comparison command above saves the legacy-metric current run as `social-coverage-full21-coverage-gated.{json,md}` and its five-policy comparison as `social-coverage-full21-policy-comparison.{json,md}` inside `coverage-gated/`. Without `--out-dir`, the runner writes to ignored `benchmarks/generated/social-coverage-21/`.

## Metrics and interpretation

Relationship Variety Coverage Score is based on the shared structural opportunity vocabulary, not every roster member or exact four-player layout. For each player it averages the experienced/feasible ratios for partner, opponent, and courtmate facets with nonempty opportunity sets; the session score averages those player scores. Reaching 100% means every structurally feasible people relationship has occurred, but it does not imply even repetition entropy or continuing match-type variety. Entropy is separate and measures how evenly experiences are distributed. MIXED and OWN_SIDE match-type coverage/counts are reported separately. The Balanced denominator does not shrink when a relationship is outside the balance envelope; reports distinguish finite-session guardrail exclusions from opportunities that were inside the recorded policy frontier but unchosen.

Rest is measured in completed-match events while a player is available. Assignment-rest values are sampled only for completed assignments; inter-completion gaps are a separate diagnostic because they include time spent playing. Back-to-back rates exclude initial assignments. At checkpoint N, refill/replay/gate counters cover assignments made after completions 1 through N−1, so the final refill may still be active; the opening two-court decision is outside that refill-decision cohort. Starvation counterfactual rates show certified and unknown decisions explicitly. Long-rest linkage to an accepted +1 decision is decision-level and does not claim that a particular player was the marginal extra replay.

The primary product horizon is 21 completed matches (about six appearances per player), evaluated using the 3:2:1 Social Coverage score and reasonable event-based rest. The multi-seed 400-completion benchmark is intentionally manual and secondary: use it to detect starvation, permanent player exclusions, extreme cohort locking, or fairness failures. Late OWN_SIDE recurrence is monitored without a quota or a mandatory test failure. The bounded asynchronous and 400-match simulations still run their legality, fairness, starvation, balance, and relationship checks and log late-window match-type diagnostics.

The gate has four Mixed facets, including match type. Once all four are covered, every immediate coverage gain is zero, so no +1 replay can pass the strict-improvement test; when the minimum-replay class then offers only MIXED, that can lock out OWN_SIDE. This is a consequence of the specified gate, not a claim that every session enters the same state. Reports include late-window types and distinguish +1 available, coverage-eligible, selected, and rejected candidates; decision and candidate totals are separate, and decision-level counts can overlap when a refill has both eligible and rejected candidates.

The final narrow Points seed-1 run gives a concrete late-session witness at event 397: the chosen MIXED batch `P3–P13` vs. `P6–P8` had zero immediate replays, coverage gain `0/1456`, combined entropy gain `−0.014792419949`, and balance gap `0.1`. A legal OWN_SIDE batch `P8–P13` vs. `P9–P12` in the same fairness/starvation class and inside the balance envelope had one immediate replay, the same zero coverage gain, higher combined entropy gain `+0.114959326167`, and balance gap `0`. It was rejected by the strict coverage improvement gate, demonstrating a gate tradeoff rather than a Mixed legality, fairness, starvation, or balance exclusion. This witness is from engine implementation `39e0d351924f40411e7eb33564b04825b76f8049`, measured by the benchmark at `71927c6cbc70e13e6ec28b4a534fcdf8481a95c1`.

## Preserved 20/400 reports and pilots

The root-level `social-coverage-full-*.{json,md}` files are earlier, historical four-policy reports with a 20-match checkpoint. They remain unchanged and must not be relabeled as 21-match results. The 21-match checkpoint files above are the current comparison set.

`split-cadence-pilot/` preserves the rejected immediate-replay-first experiment, which reduced back-to-back assignments but suppressed OWN_SIDE matches. `type-entropy-first-pilot/` and `replay-envelope-pilot/` preserve earlier one-seed pilots. They are behavior snapshots, not substitutes for the standard multi-seed run.
