# Matchmaking v3 implementation notes

The live architecture and policy are documented in [README.md](./README.md)
and behavioral invariants in [SPEC.md](./SPEC.md). The original staged rollout
plan has been superseded by the shared rotation implementation.

- `fairness.ts` / `entry.ts`: active roster and neutral effective counts.
- `scoring.ts`: shared fairness, starvation, cadence and transitive policy metrics.
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
rotation class. After stronger rotation priorities, rest-sensitive Social
search certifies the whole-batch minimum immediate-replay count and admits at
most one additional replay. Balanced does the same only inside its already
fixed balance envelope. The matcher freezes the maximum first-exposure
coverage among exact-minimum-replay batches; a single additional replay is
admitted only when its coverage is strictly higher. This gate uses the shared
structural opportunity denominators and history and never widens Balanced's
envelope. The combined four-facet entropy score ranks admitted batches next;
the ascending rest vector is a soft cadence preference only after entropy ties
and uses completed-match events. Social entropy stays exact; Balanced applies
its fixed bucket to the combined score. Starvation remains the recovery safety
net. Setting `respectPlayerRest: false` disables replay, first-exposure and
soft-cadence gates without disabling starvation.
