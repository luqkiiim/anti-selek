# Social courtmate frontier search scaling

This experiment measures the default-budget search cost and certification rate for the opt-in `courtmate-beneficial-rescue` Social policy. It runs the same deterministic Social event protocol against two engines: the original pre-scaling source snapshot and the current engine. Every executed assignment must carry fairness, starvation, complete courtmate-gain-maximum, and full-priority certificates. A result returned without all four proofs is recorded and stops that session before the assignment is used.

The primary profiles are 14 players on two courts (7/7 sides), 16 players on two courts (8/8), and 18 players on three courts (9/9), each with seeds `1`, `4729`, and `104729`, up to 100 completed matches. The optional `regressions` profile runs 14 players split 8/6 and 10/4, against the frozen successful generalization reports. The optional `opening` profile measures only the initial three-court search at 20 and 24 players; those proposals are never assigned.

The harness uses fixed roster strengths, Park–Miller match and court-completion streams, and the same asynchronous one-court refill rule as the frozen Social generalization simulator. Completed history contains only matches whose simulated completion event has occurred; active assignments are passed in `socialHistoryMatches` for optimizer behavior. The 18-player primary profile also performs isolated joint three-court probes after completed-match prefixes 20 and 50. Each probe drains active courts on cloned state and uses its own seed; it does not alter the simulated session or consume its random stream.

No search-budget override is passed to either engine. The matcher treats two-court batches with at most 14 active players as exact and uncapped; other batch shapes use its built-in 50,000-branch and 2,000 ms phase limits. A search-limit, missing selection, or missing certification remains an explicit unsuccessful observation. The runner never substitutes a smaller batch, accepts an uncertified proposal, or upgrades a partial result to a completed session.

Each decision record includes elapsed matcher time, branch counters, limit state, selection presence, fairness/starvation certificates, courtmate Gmax certificate and value, chosen gain/deficit, signed rolling-type gain, and full-priority status. Rest samples count completed assignments only. The previous fixed-roster harness included started assignments at its checkpoint, including still-pending courts, so do not compare its rest counters directly without normalizing that cohort difference.

The engine’s `exploredBranches` and `prunedBranches` counters describe implementation-specific expansion and safe-pruning work. The new search can prove rejected subtrees before expanding their layouts, so branch totals are not a shared raw-work unit across implementations. Compare wall-clock call durations, certification/success rates, exact selected layouts, checkpoints, and full histories alongside those counters.

The 14/7/7 sessions are checked against the previously validated five-seed 100-match beneficial-rescue report. Only the overlapping seeds are used. The 14/8+6 and 14/10+4 optional regressions compare to their frozen generalization reports. The validator checks completed layouts in order and compares the saved 3211 endpoint KPI when present, or the independent structural coverage/type score otherwise. Engine-to-engine status and completed-history parity are stored separately for every matched seed.

The original engine control is an ignored source snapshot at `benchmarks/generated/social-frontier-scalability/control`. Its `socialBatch.ts` SHA-256 is `40538cb672c3a8cef256192b114dffb28bc853f8c1aa28790af40775f79b64e6`, as recorded in its source manifest. The runner hashes the current engine dependencies, the complete control dependency set, the harness/scripts/docs, and frozen reference reports before measurement and after each scenario. Output is restricted to ignored `benchmarks/generated/`. The bridge writes raw reports with `validationStatus: "pending"` and a pending marker; the CLI marks each report and the run manifest passed, then removes their pending markers, only after all cohort, certification, history, reference, and provenance checks pass.

Run the primary experiment only after the engine source is frozen and the experiment owner approves measurement:

```sh
node scripts/run-social-frontier-scalability-benchmark.mjs --profile primary --out-dir benchmarks/generated/social-frontier-scalability/primary-2026-10-06-v1
```

Optional frozen-reference regressions and opening-only profiles use `--profile regressions` and `--profile opening`. To inspect a completed validated run:

```sh
node scripts/summarize-social-frontier-scalability.mjs --dir benchmarks/generated/social-frontier-scalability/primary-2026-10-06-v1
```

The Vitest bridge can run one requested scenario and seed set by itself, but that leaves its report pending. It is not a substitute for the CLI validator and does not promote measurement artifacts.
