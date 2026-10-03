# Matchmaking benchmark artifacts

The manual benchmark uses 14 fixed players (P1–P7 male and P8–P14 female with FEMALE_FLEX), two Mixed courts, and an independent seeded court-completion schedule. For each seed, all formats share the same roster, skill ranks, and completion schedule. The primary narrow profile uses Points/Social strength `10 + 0.1 × rank` and Rating `900 + 4 × rank`; the wide sensitivity profile uses `10 + 1 × rank` and `900 + 40 × rank`. `pointDiff` is zero because no match outcomes are modeled. Relationship coverage, rest, and match-type counts use completed matches only.

The canonical full benchmark uses five narrow seeds (`1, 4729, 104729, 130363, 2097593`) for Social, Balanced Points, and Balanced Rating/Elo, plus three wide seeds (`30011, 65537, 999983`) for the Balanced formats. Each report contains 21 sessions with exact 20- and 400-completion checkpoints. Full runs are manual and do not extend normal CI.

| Files | Policy/source | Notes |
|---|---|---|
| `social-coverage-full-baseline.json` and `.md` | Original entropy-first engine at `de0254f84adef7414b512e3d3fd936033d65bef8` | Benchmark coverage instrumentation was copied into the historical checkout. Its engine and harness source hashes are recorded in the JSON. |
| `social-coverage-full-strict.json` and `.md` | Strict full-rest-vector policy at `93262f36336b9533ba96b4e4bec5d7e8061eef6e` | Preserved comparison showing the strict cadence policy’s effect on relationship and match-type coverage. |
| `social-coverage-full-type-entropy-first.json` and `.md` | Match-type-entropy-first policy at `bcf07fb22cded580c7e2c0c72d6a5a58bc4eb49d` | Historical policy that prioritizes MIXED/OWN_SIDE entropy ahead of immediate replay count. |
| `social-coverage-full-current.json` and `.md` | Current best-replay-plus-one policy at `7ab071ad0102ff8a2012a267d8cfe796a1f325a8` | The frozen replay envelope allows one immediate replay above the minimum after stronger fairness/starvation priorities and the Balanced envelope; combined entropy and soft rest optimize inside it. Tracked engine and measurement files were clean at measurement time; generated artifacts make the overall worktree dirty. |
| `social-coverage-full-policy-comparison.json` and `.md` | Same seeds and profiles across the four policy reports | Reports actual completed MIXED/OWN_SIDE counts, coverage, entropy, rest, fairness, starvation, and replay-envelope measures. |

Run the full current policy and compare it against the saved historical reports with:

```powershell
npm run benchmark:matchmaking -- --baseline-json benchmarks/social-coverage-full-baseline.json --strict-json benchmarks/social-coverage-full-strict.json --type-first-json benchmarks/social-coverage-full-type-entropy-first.json
```

The default run uses the five narrow and three wide seeds above and writes the current report and four-policy comparison into this directory. To run a one-seed narrow pilot while retaining the same historical comparisons:

```powershell
npm run benchmark:matchmaking -- --pilot --seeds 1 --baseline-json benchmarks/social-coverage-full-baseline.json --strict-json benchmarks/social-coverage-full-strict.json --type-first-json benchmarks/social-coverage-full-type-entropy-first.json --out-dir benchmarks/replay-envelope-pilot
```

The final 5-seed narrow runs reached 100% relationship coverage for Social, Balanced Points, and Balanced Rating/Elo at 400 matches (5/5 seeds each). Mean coverage after 20 completed matches was 62.1% for all three. The report records each checkpoint, full seed range, entropy, rest, match-type, fairness, starvation, and wide-profile guardrail details.

For presentation-only corrections, the saved-report render test accepts `BENCHMARK_RENDER_REPORT_JSON`, optional `BENCHMARK_RENDER_BASELINE_JSON`, and `BENCHMARK_RENDER_OUTPUT_MARKDOWN`. It formats saved JSON without simulating matches; `--current-json` and `--current-markdown` then rebuild the policy-comparison appendix while preserving the measurement provenance in JSON.

The manual runner verifies the requested profile/format/seed set and setup definition for every historical artifact, then checks the seeded external completion schedule against the current run. Its one-court oracle independently enumerates legality, count/arrival fairness, starvation class, Balanced admissibility, and the best-zero-plus-one replay envelope. It records the number of selected +1 decisions, decisions with higher-entropy candidates outside the allowance, and witness candidates with IDs, partitions, gains, and rest vectors. The oracle also reruns the no-starvation counterfactual using its own strongest class and balance envelope. Uncertified historical counters remain `n/a`.

The benchmark Markdown reports completed-only relationship coverage and actual match-type counts separately from normalized Shannon entropy. Assignment-rest samples are event turns while a player is available; inter-completion event gaps are reported separately because they include time spent playing. Refill and replay-envelope counters at checkpoint N cover assignments after completions 1 through N−1; the final refill may still be active, and the opening two-court decision is excluded. Long-rest linkage to a +1 replay is decision-level only and does not attribute a marginal replay to an individual selected player.

## Preserved one-seed pilots

`split-cadence-pilot/` preserves the rejected immediate-replay-first experiment, which reduced back-to-back assignments but suppressed OWN_SIDE matches. `type-entropy-first-pilot/` preserves its initial one-seed pilot. `replay-envelope-pilot/` records the one-seed 400-completion run for the current policy and its matched historical comparison. These pilot artifacts are behavioral evidence, not a substitute for the multi-seed full benchmark.

The standard Vitest suite runs a bounded 120-completion regression probe for all three formats and asserts relationship coverage, recurring MIXED and OWN_SIDE matches, and certified best-plus-one replay envelopes. The multi-seed 400-completion benchmark remains an explicit manual run.
