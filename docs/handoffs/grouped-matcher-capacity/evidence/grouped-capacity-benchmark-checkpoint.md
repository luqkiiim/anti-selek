# Grouped capacity benchmark checkpoint — 2026-10-16

Current harness fingerprint: `3cb2df2b0c4a8900007e5fe09af41161fc32ed6fbb76b544d7e6dd2d0947f61f`.

Owned files: `src/lib/matchmaking/groupedCapacityBenchmark.test.ts` and `scripts/run-grouped-capacity-matrix.mjs`. No production source edits by this worker. Harness version 4 creates the conditional 5-second root before `buildMatchmakingState`, then passes it through the route selection wrapper. The budget predicate is imported from `queueBudget.ts`. One-court requests call `selectSingleCourtMatchRespectingSkips` with `reshuffleSource: null`; three-court requests call `selectBatchMatchesRespectingSkips`. A seeded `Math.random` spy covers only the synchronous single-court call and is restored in `finally`. The trajectory advances a simulated event clock on completions and asserts each new match starts at or after prior completions and each selected player's availability.

Static checks: `npx tsc --noEmit --pretty false`, targeted ESLint, and `node --check scripts/run-grouped-capacity-matrix.mjs` passed after the single-court correction. Current harness has not yet received final Astra review or a one-court smoke run; do those before broad matrix execution. No new 100-match trajectory has been run under current fingerprint.

Previous diagnostic results, retained as old-fingerprint evidence only:

- Fingerprint `38a6e17e789a1bea3ec09eb6cdc68e44bf1741a92ea39826b3257bb780688ce0`: 24-player 12/12 balanced seed 1 joint, 100 actual match completions, 34 full three-court selections, 34 budgeted steps, max root 4406.9133 ms, max whole 4407.4104 ms. Artifact `grouped-capacity-trajectory-12-12-balanced-1-joint.json`.
- Same fingerprint: 22-player 11/11 balanced seed 1 joint, 100 actual completions, 34 full three-court selections, 34 budgeted steps, max root 1789.0718 ms, max whole 1789.1399 ms. Artifact `grouped-capacity-trajectory-11-11-balanced-1-joint.json`.
- Cold 24-player opening after budget correction, but before final harness metadata/guard changes: 3 courts, root 4405.4747 ms, 594.5005 ms remaining. `grouped-capacity-opening-budgeted.json` has null fingerprint and is a diagnostic only.
- Older fixture version 2 unbudgeted 100-match pass remains invalid for performance acceptance.

Current runner gate checks case identity, fixture policy, 100 completions, full courts, no failure state, and derives budget eligibility from each step's unpaused count and requested courts. It requires applied budget and <=5100 ms root elapsed on eligible three-court steps, null root elapsed on ineligible steps. The 62-case matrix consists of 60 grouped splits/seeds/profiles/refill styles plus 8/1 and 16/2 regressions. Previous artifacts do not count under the current fingerprint; runner will preserve them as previous-fingerprint copies when rerun. The matrix is algorithm trajectory evidence, not complete HTTP/UI integration evidence.

Next actions: Astra review of final harness; smoke 24/12-12 seed 1 individual refill; if passing, serial matrix runs with quota checks. Preserve exact failure state on any failure. Separate flow evidence remains needed for pause, late arrival, skip, queued match, physical court API persistence, and preview p95 latency.

Reproduction commands from repo root:

`node scripts/run-grouped-capacity-matrix.mjs --case=12-12-balanced-1-individual`

`node scripts/run-grouped-capacity-matrix.mjs --run --case=12-12-balanced-1-individual`

`node scripts/run-grouped-capacity-matrix.mjs --run --max-cases=1`

## 2026-10-16 12:05 Malaysia continuation

Current frozen source fingerprint: `86df96a8d11fe0098db020191168092b112c1edd2717c12152bcbe8312351929`. The independent oracle now checks group team topology explicitly: crossover 2A/2B requires one A and one B per team; open overflow 2A/2B requires same-pool teams. A regression reproduces the prior 0.5-versus-3.5 gap false positive. Returned partitions are independently checked for the same topology. The artifact captures complete selected assignments, teams, balance gaps and reason data before verification. TypeScript and focused oracle regression passed. The old failure at 24/12-12 balanced seed1 individual was a harness false positive (CROSSOVER quartet P14,P20,P6,P8); the corrected 100-match trajectory passed.

Accepted under current fingerprint before the next failure: 13/62 cases. The 24/12-12 balanced seed1 individual case passed 100 completions and 100 full requested selections; its opening three-court step used the production five-second root budget (max root 4405.0475 ms) and the next 99 one-court steps correctly had no capacity root budget. All 12 cases for 22/11-11 (three seeds, balanced/skewed, joint/individual) passed 100 completions/full requested courts; artifacts and the progress ledger record timing per step. Earlier joint pass artifacts from fingerprint `38a6e17e...` remain historical diagnostics, not accepted under the current fingerprint.

Matrix stopped on the first genuine search-limit failure: `12-10-balanced-1-joint`, seed1, after 30 completed matches at selection step10. Three courts were requested, 22 players unpaused, root budget applied. Recurrence balance reached its 2,000 ms phase cap (37,866 branches, 300,037 prunes) and production balance reached its 2,000 ms phase cap (38,684 branches, 304,424 prunes). Both had rank2 fairness witnesses with max balance gap1 and total2.5 but were interrupted, so neither certified a batch. Root elapsed 4233.5474 ms; 766.4516 ms remained. Exact 22-player/30-match state, complete phase diagnostics and error are in `private/grouped-capacity-trajectory-12-10-balanced-1-joint.json`. Command: `node scripts/run-grouped-capacity-matrix.mjs --run --case=12-10-balanced-1-joint`. Do not relabel this as infeasible or accept an interrupted witness. Matcher worker received the reproduction. Hold further matrix runs until engine fix and source-fingerprint refresh.

## 2026-10-16 17:05 Malaysia continuation

Engine source fingerprint `9a57f92bb99e57659ed7fb796a787c56046ab91717a8459d8020fdb40ee35b7a`. Prior 12/10 balanced seed1 joint failure was fixed: 100 actual completions, 34 full three-court selections, max root 1745.4301 ms, max whole 1745.4530 ms. Under this fingerprint, all twelve 11/11 cases (three seeds, balanced/skewed, joint/individual) also passed. The 12/10 balanced seed1 individual case passed, yielding **14/62 accepted cases** in `grouped-capacity-matrix-progress.json`.

Stopped immediately on the next genuine search limit, `12-10-balanced-4729-joint`: 9 completed matches at selection step3, 22 unpaused players, three requested courts. Root elapsed 4402.2226 ms with 597.7754 ms remaining. Recurrence certified balance (538 ms), replay (213 ms), coverage (1427 ms), and frontier (13 ms), then variety interrupted at request elapsed 2900 ms. Production certified balance (685 ms) and replay (240 ms), then coverage interrupted at request elapsed 4400 ms after 2500 explored branches and 106389 prunes. No certified batch; API selector returned 400 search time limit. Exact full state and phase diagnostics are in `private/grouped-capacity-trajectory-12-10-balanced-4729-joint.json`. Reproduce with `node scripts/run-grouped-capacity-matrix.mjs --run --case=12-10-balanced-4729-joint`. Matcher worker and parent received this state. Do not continue matrix or classify an interrupted witness as feasible proof until fixed. Old 13-case fingerprint evidence remains diagnostic only.

## 2026-10-16 18:10 Malaysia runner-only continuation

Source fingerprint after the runner-only edit: `89dc0d632ce40191bacd98f5cb8658ffbc76e5e3604c6d37924eeb58e627761e`. Earlier 14/62 pass artifacts under `9a57f92b...` remain historical evidence and are not accepted by the new fingerprint gate. The existing benchmark/test semantics, 100-completion requirement, five-second budget checks, and full 62-case matrix were unchanged.

`scripts/run-grouped-capacity-matrix.mjs` now supports a deterministic 17-case smoke selection: 15 regular cases providing every pair of levels among five splits, three seeds, two profiles, and two refill styles, plus the 8/1 and 16/2 regressions. Static dry-run verified all 51 factor-pair combinations; `node --check` passed. Targeted ESLint yielded no result and was interrupted after a long wait, so lint remains unverified. No matcher trajectories were executed during this runner-only continuation.

Commands from repo root after the matcher fix is stable:

- Exact saved repro: `node scripts/run-grouped-capacity-matrix.mjs --run --case=12-10-balanced-4729-joint`
- Smoke inspection without executing: `node scripts/run-grouped-capacity-matrix.mjs --smoke --max-cases=17`
- Serial smoke: `node scripts/run-grouped-capacity-matrix.mjs --run --smoke --max-cases=17`
- Final unattended serial 62-case batch, skipping accepted same-fingerprint artifacts: `node scripts/run-grouped-capacity-matrix.mjs --run --max-cases=62`

The runner stops on the first failure, preserves exact state/phase artifacts, checkpoints every case, and prints aggregate progress. Pairwise smoke is a diagnostic precursor, not a substitute for full acceptance or separate API/browser/lifecycle evidence. Quota hard stop was reached (6% five-hour, 8% weekly); parent owns the scheduled resume.
