# Balanced Arm 3 default-switch validation

The controlled validation completed on 8 October 2026 against main `453a9aa`. Hardened Arm 3 is the approved default for fresh automatic Balanced Points/Elo selections. Certified current-production Balanced remains the fallback, and `BALANCED_RECURRENCE_CANDIDATE_ENABLED=0` restores the old matcher. Manual host choices and already-stored queued lineups preserve their existing behavior. The routing and persistence contract is documented in `balanced-recurrence-default-switch-path-audit.md`.

The policy is frozen. Fairness/arrival, schedule, starvation and the existing balance envelopes remain stronger than recurrence. The certified replay minimum and first-exposure exception are retained. After a player has experienced every structurally feasible type, recent recurrence uses at most six completed appearances without a six-game startup threshold. Exactly one extra replay is permitted when first exposure qualifies under the old rule or signed T is strictly better than the best T at the replay minimum. Both reasons may apply, but never stack to two extra replays. There is no target MIXED ratio, quota or debt.

The controlled run used seeds 1, 4729 and 104729, both Points and Elo, narrow/wide profiles, immediate asynchronous refill and checkpoints at 21, 50 and 100 completed matches. Every session stopped at 100. Fixed-strength runs retained initial strength values while point-difference history evolved; evolving-score runs also updated strengths after synthetic results. These were matcher simulations, not end-to-end score-entry simulations.

| Matrix | Coverage | Sessions, default / old production | Completed matches |
| --- | --- | --- | --- |
| Fixed strengths | 10/2, 12/2, 14/2, 16/2, 15/3, 16/3, 18/3; both formats/profiles | 84 / 84 | 16,800 |
| Unequal/single-type controls | 10+0/2, 9+3/2, 10+4/2; both formats/profiles | 36 / 36 | 7,200 |
| Evolving scores | All seven configurations; both formats/profiles | 84 / 84 | 16,800 |

All 408 sessions reached their target. Across 20,400 actual default-arm decisions, 20,363 were exactly certified candidates, 37 were certified production fallbacks and none returned no selection. All 37 candidate limits occurred in cold three-court openings with no completed history. The fallbacks certified the production core contract and did not claim recurrence certification. All 16/2 decisions were exact.

The configured larger-batch limits remained 50,000 branches and two seconds per phase. The existing exact-small-batch exemption for at most 14 eligible players and at most two courts was unchanged. The default switch did not increase any search budget.

| Primary topology | Exact / fallback decisions | Candidate branches explored / pruned | Candidate mean / max ms |
| --- | --- | --- | --- |
| 10/2 | 1,200 / 0 | 26,187 / 8,819 | 1.25 / 18 |
| 12/2 | 1,200 / 0 | 148,153 / 60,452 | 3.53 / 41 |
| 14/2 | 1,200 / 0 | 341,441 / 153,108 | 9.75 / 163 |
| 16/2 | 1,200 / 0 | 789,030 / 370,595 | 23.09 / 418 |
| 15/3 | 1,200 / 0 | 292,074 / 199,605 | 7.64 / 1,234 |
| 16/3 | 1,196 / 4 | 519,820 / 293,765 | 12.51 / 1,542 |
| 18/3 | 1,192 / 8 | 808,326 / 441,866 | 22.57 / 2,040 |

Branch totals aggregate all primary default decisions across formats, profiles and seeds. Full-wrapper timing includes verification and fallback: fixed-strength mean/p95/max was 12.59/23.99/2,299.66 ms; evolving-score timing was 12.15/21.31/2,291.65 ms. These are local measurements, not deployment latency guarantees.

An independent legal-layout/disjoint-batch oracle completed 41,700 decision/probe checks: 17,136 primary, 7,344 controls, 17,136 evolving and 84 lifecycle. It reported zero incomplete cases and zero findings. There were zero observed fairness/arrival, schedule, starvation, balance-envelope or feasible Elo-ceiling failures, zero accepted uncertified candidates/fallbacks and zero +2 replay admissions. All 1,077 recurrence-qualified +1 rescues were strictly beneficial; the minimum improvement was +0.5 summed T. Of those, 336 also qualified through first exposure, with both reasons recorded.

The 84 lifecycle probes covered pauses/resumes, no-catch-up late arrivals, busy/queued reservations, retained-player replacement and reshuffle exclusions. Application tests covered grouped/Interclub constraints, one-type-only structural vocabulary, queue creation/rebuild/replacement/reshuffle/consumption, manual preservation and rest-disabled fallback. Eight additional MEXICANO snapshots covered 8/1 and 16/2 for both formats and arms; MIXED/OWN_SIDE recurrence is not applicable in that mode.

The following values are old production → actual Arm 3 default, including certified fallbacks. T is the mean fraction of structurally feasible types represented in each player's latest six completed appearances, rather than a MIXED proportion. B2B uses post-first-appearance assignments; differences are percentage points. All sessions reached every checkpoint.

| Matrix | Matches | Recent T | B2B | B2B change, pp |
| --- | --- | --- | --- | --- |
| Fixed strengths | 21 | 0.875 → 0.876 | 29.26% → 29.26% | 0.00 |
| Fixed strengths | 50 | 0.830 → 0.871 | 25.11% → 25.56% | +0.44 |
| Fixed strengths | 100 | 0.764 → 0.863 | 22.40% → 23.36% | +0.96 |
| Evolving scores | 21 | 0.916 → 0.917 | 31.46% → 31.39% | -0.07 |
| Evolving scores | 50 | 0.863 → 0.912 | 28.14% → 28.31% | +0.16 |
| Evolving scores | 100 | 0.828 → 0.901 | 26.02% → 26.38% | +0.36 |
| Unequal/single-type controls | 21 | 0.982 → 0.983 | 36.93% → 36.93% | 0.00 |
| Unequal/single-type controls | 50 | 0.994 → 0.994 | 34.00% → 34.31% | +0.31 |
| Unequal/single-type controls | 100 | 0.976 → 0.997 | 31.01% → 31.55% | +0.54 |

Mean rest turns at 100 were 1.144 → 1.143 for fixed strengths and 1.143 → 1.143 for evolving scores. Early aggregate behavior stayed close to production. Longer-session recurrence improved on average, with known exceptions: immediate-refill 10-player 5+5 remains at T=0.5, and evolving Points 15/3 had worse aggregate 100-match T despite every local rescue being beneficial. Joint refill was not enabled to change these results.

Relationship metrics at 100 matches were:

| Matrix | Distinct partners | Distinct opponents | Partner entropy | Opponent entropy |
| --- | --- | --- | --- | --- |
| Fixed strengths | 11.629 → 11.678 | 12.777 → 12.805 | 2.254 → 2.292 | 2.326 → 2.340 |
| Evolving scores | 11.868 → 11.930 | 12.954 → 12.879 | 2.304 → 2.316 | 2.369 → 2.351 |

Entropy uses natural logarithms. Native balance units differ between Points and Elo; raw point-difference gaps were independently recomputed from assignment snapshots and were quality diagnostics, not new acceptance envelopes.

| Matrix / format, 100 matches | Mean native selected max gap | Mean point-difference max gap |
| --- | --- | --- |
| Fixed strengths / Points | 0.532 → 0.548 | 10.435 → 10.169 |
| Fixed strengths / Elo | 10.892 → 11.099 | 10.492 → 10.376 |
| Evolving scores / Points | 1.556 → 1.610 | 5.598 → 5.609 |
| Evolving scores / Elo | 23.006 → 22.893 | 7.091 → 6.979 |

All 324 overlapping sessions matched the frozen hardening histories, oriented assignments, layouts, deterministic proof fields and checkpoint behavior. All 84 lifecycle selections/proofs/contexts and all eight direct MEXICANO controls also matched. The additional 84 evolving wide-profile sessions had no frozen counterpart. Timing and interrupted branch counts were excluded from semantic parity.

The changed-default serial suite passed 2,068 tests with 24 skipped before merge cleanup; TypeScript, ESLint and the normal production build passed. Earlier timing/startup failures passed unchanged in rechecks and the final full serial run. No search cap or test timeout was increased. The permanent production suite retains acceptance, independent policy, exactness, application and POST-route regressions; obsolete experiment runners and generated output are excluded from the production commit. The frozen exhaustive implementation is retained only as a test fixture.

Final merge cleanup validation passed 2,021 permanent tests with 13 skipped across 267 passing files and six skipped files. All 188 focused policy, oracle, acceptance, application and actual POST-route regressions passed. TypeScript, ESLint (zero errors; 46 existing warnings), the normal production build and staged whitespace checks passed. The cleanup removed obsolete experiment drivers and diagnostic exports, retained the frozen exhaustive test oracle, and added default larger-opening and legacy stored-queue regressions. No search budget, matcher objective or production acceptance rule changed during cleanup. Database migrations were exercised only by isolated test fixtures; no operational database migration was run.

Social, Level Match, joint refill, fairness/arrival, starvation and the existing balance envelopes remain unchanged. The existing reason JSON stores decision metadata; no schema migration, dependency or new secret/configuration is required. No deployment or migration was part of this validation. Raw benchmark output and detailed audit manifests remain local under ignored `benchmarks/generated/` and are not committed.
