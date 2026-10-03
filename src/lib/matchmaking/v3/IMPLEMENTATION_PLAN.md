# Matchmaking v3 implementation notes

The live architecture and policy are documented in [README.md](./README.md)
and behavioral invariants in [SPEC.md](./SPEC.md). The original staged rollout
plan has been superseded by the shared rotation implementation.

- `fairness.ts` / `entry.ts`: active roster and neutral effective counts.
- `scoring.ts`: shared fairness, starvation, rest and transitive policy metrics.
- `socialVariety.ts`: full-roster constrained entropy and stable side history.
- `balance.ts`: legal team partitions and strength/point-difference gaps.
- `balanceGuardrail.ts`: explicit Points/Rating admissibility policy.
- `socialBatch.ts`: whole-batch set packing and certified staged balance search.
- `singleCourt.ts` / `batch.ts`: common public entry points.
- `rematch.ts` / `consecutive.ts`: Social late ties and shared diagnostics;
  Balanced retains only exact rematches as a late selection signal.
- Production selection adapters: labelled player-group/club legality, full
  committed history and persisted selection explanations.

Do not reintroduce candidate compression using repeat/coverage heuristics, a
Mixed target/debt system, a balance-weighted entropy score, or a moving pairwise
tolerance. Balance baselines must be certified inside the optimal stronger
rotation class before entropy is optimized.
