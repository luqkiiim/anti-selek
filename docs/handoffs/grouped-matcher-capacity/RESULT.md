# Grouped Balanced Points capacity result

Validated application source: `f1afcf7ecfb029d58c699eac04bd3c188a809dad`, including main through `f83f154`. Matcher fingerprint: `ba24820b6eb71827c1a50e5ed011e0446d448614826e2b3692d60088dcaafdc6`.

Grouped Points/Mixed selection now shares its original five-second computation clock across preparation, search, verification and fallback. Complete compatibility and entropy-bound results are reused without changing candidate order, scoring, fairness, rest, group legality or certification. Court batches commit before optional queue work; the visible session applies committed courts immediately and recovers a deferred queue while preserving Clear intent.

The all-zero opening regression fills three courts for 22 players and finishes the primary certified search locally. The additional entropy optimization reduced that local case from about 2.97 to 1.49 seconds. Cloud timing remains different:

| Exact-source preview opening | HTTP total | Preparation + selection | Result |
| --- | ---: | ---: | --- |
| 22 players, 12/10 groups | 5.173 s | 4.405 s | Three legal, persisted courts |
| 24 players, 12/12 groups | 5.162 s | 4.402 s | Three legal, persisted courts |

These are two observed functional checks, not a p95 or cold-start guarantee. Total HTTP time includes loading, persistence and transport beyond the computation clock. The existing fallback may certify core scope without full recurrence/late-variety certification; no acceptance rule, phase/branch cap or deadline was relaxed.

Validation passed: 40 focused exactness/deadline/opening tests, seven saved capacity regressions, 39 affected UI tests, a varied 17-case trajectory smoke, TypeScript, targeted lint and a normal build. Earlier real Chromium persistence/Clear and pause/resume/skip/late-arrival checks were reused for unchanged behavior. The additional current-source 62-case matrix was stopped; no complete pass is claimed.

The feature adds no migration. Isolated preview received main's existing additive migration63 with all 596 predecessor rows preserved. Production already has schema63 and needs no database writer for this release. Normal builds do not migrate.

The October17 report and continuation prompt are historical investigation records. This result supersedes their pending-work and verification statements. Deployment status is recorded in the pull request and release check artifacts.
