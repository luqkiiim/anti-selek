# Matchmaking cadence and relationship coverage benchmark

Generated 2026-10-04T05:03:40.208Z; source commit 7ab071ad0102ff8a2012a267d8cfe796a1f325a8; policy replay-envelope-best-plus-one; dirty worktree true. Primary seeds: 5; wide-profile Balanced seeds: 3.
Rendered from saved measurement data on 2026-10-04T05:03:40.513Z; measurement source hashes below identify the code used for the benchmark run.
Worktree note: Only benchmark measurement files are copied into the ungated replay-envelope worktree; production engine files remain at the recorded replay-envelope commit.
Tracked source changes from commit: core engine clean; shared variety clean; measurement harness scripts/run-matchmaking-benchmark.mjs, src/lib/matchmaking/v3/socialCoverageBenchmark.test.ts, src/lib/matchmaking/v3/socialCoverageBenchmark.ts. Generated untracked artifacts can make the overall worktree dirty without changing these tracked source statuses.
Engine source SHA-256 a9dac9d1de2b379a59aa07e2f0df4dab9b0dd0d8a4a298630b85fd395a1c512c; measurement harness SHA-256 9af0c2e857fc947f7d0adb34469df9306528b529b5809960bf495432e91540f3.

The roster uses the same P1–P14 identities, gender/preference assignments, latent skill ranks, and independent event-level court-completion schedule for every format at a given seed. The narrow profile maps the same rank vector to Points/Social strengths at 0.1 per rank and Rating strengths at 4 per rank; the wide profile maps it at 1 and 40 respectively. `pointDiff` stays 0 because this benchmark has no match scores. Each run has two active courts; one randomly scheduled court completes per event and is refilled. Coverage counts only completed matches. Rest turns count completed-match events while a player is available; active players do not accrue rest. The +1/+2 threshold counters include available idle events before a player's first match; assignment-rest gaps and back-to-back rates exclude first assignments.

Relationship coverage is the mean of each player’s feasible courtmate, partner, and opponent coverage ratios, excluding only empty opportunity facets. It is distinct from normalized Shannon entropy. Match-type coverage is reported separately. Percentages below are seed-level session averages and then mean/median/min/max across seeds.

## Primary narrow-skill profile

| Format | Completed | Relationship coverage (mean; median; min–max) | Partner / opponent / courtmate | MIXED / OWN_SIDE | Normalized entropy | Back-to-back rate | Max assignment rest gap (mean of per-seed maxima) | Mean / p95 assignment rest | +1 / +2 threshold reaches | Starvation changes / overdue (certified, unknown; rates) | Checkpoint / max fairness spread |
|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| Social | 21 | 63.4%; 64.1%; 57.9%–67.0% | 44.2% / 65.5% / 80.7% | 100.0% / 95.7% | 80.5% | n/a → 23.4% | 4.20; 4.00; 4.00–5.00 | 1.47; 1.46; 1.44–1.49 / 3.80; 4.00; 3.00–4.00 | 5.2 / 0.2 | 0.6 changes (19 overdue; 19 certified, 0 unknown; overdue 18.0%, certified-only 18.0%) | 0.40; 0.00; 0.00–2.00 / 2.40; 2.00; 2.00–3.00 |
| Social | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.8% | n/a → 24.9% | 5.80; 6.00; 5.00–7.00 | 1.50; 1.50; 1.49–1.50 / 4.00; 4.00; 4.00–4.00 | 141.0 / 13.4 | 27.4 changes (558 overdue; 558 certified, 0 unknown; overdue 24.5%, certified-only 24.5%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Points | 21 | 63.4%; 64.1%; 57.9%–67.0% | 44.2% / 65.5% / 80.7% | 100.0% / 95.7% | 80.5% | n/a → 23.4% | 4.20; 4.00; 4.00–5.00 | 1.47; 1.46; 1.44–1.49 / 3.80; 4.00; 3.00–4.00 | 5.2 / 0.2 | 0.6 changes (19 overdue; 19 certified, 0 unknown; overdue 18.0%, certified-only 18.0%) | 0.40; 0.00; 0.00–2.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Points | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.7% | n/a → 24.7% | 5.80; 6.00; 5.00–7.00 | 1.50; 1.50; 1.49–1.50 / 4.00; 4.00; 4.00–4.00 | 140.4 / 15.0 | 25.6 changes (556 overdue; 556 certified, 0 unknown; overdue 23.0%, certified-only 23.0%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Rating/Elo | 21 | 63.6%; 64.1%; 58.6%–67.0% | 44.4% / 65.7% / 80.7% | 100.0% / 95.7% | 80.5% | n/a → 23.7% | 4.20; 4.00; 4.00–5.00 | 1.46; 1.46; 1.43–1.49 / 3.80; 4.00; 3.00–4.00 | 5.4 / 0.2 | 0.8 changes (20 overdue; 20 certified, 0 unknown; overdue 21.3%, certified-only 21.3%) | 0.40; 0.00; 0.00–2.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Rating/Elo | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.8% | n/a → 24.8% | 5.80; 6.00; 5.00–7.00 | 1.50; 1.50; 1.49–1.50 / 4.00; 4.00; 4.00–4.00 | 142.4 / 15.4 | 25.2 changes (562 overdue; 562 certified, 0 unknown; overdue 22.4%, certified-only 22.4%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |

The table reports after-change coverage/entropy and before→after back-to-back rate and maximum assignment rest gap when a baseline report is supplied. Assignment rest is the completed-match rest-turn count sampled when players are selected; elapsed completion-event gaps are retained as a separate diagnostic and can include time spent in a match. `Starvation changed set` gives mean counterfactual set changes and the rate conditional on an overdue player being available. The fairness columns are checkpoint spread and maximum spread seen over the run. Exact per-seed values and missing relationship lists are in the adjacent JSON.

Decision cohorts: coverage, rest, and match-type checkpoints use completed matches only. Starvation's completed-decision count increments when every assignment in that optimizer decision has completed. Refill/type-override counts at checkpoint N include decisions assigned after completion events 1 through N−1; the latest refill can still be active. The opening two-court decision is excluded from type-override counts.
## Match-type priority overrides

These historical type-first counters are unavailable for the final replay-envelope policy. They are shown only when a report was measured under the type-entropy-first policy; unavailable historical fields remain n/a.

| Format | Overrides / certified refills | Rate | Mean selected match-type gain | Mean selected relationship gain |
|---|---:|---:|---:|---:|
| Social | n/a / n/a | n/a | n/a | n/a |
| Balanced Points | n/a / n/a | n/a | n/a | n/a |
| Balanced Rating/Elo | n/a / n/a | n/a | n/a | n/a |

## Completed match-type counts by session window

These are actual completed matches, not player-level match-type coverage. Early and late refer to the first and last 100 completed matches of each 400-match run.

| Format | At 21 completed: MIXED / OWN_SIDE | At 400 completed: MIXED / OWN_SIDE | First 100 OWN_SIDE | Last 100 OWN_SIDE |
|---|---:|---:|---:|---:|
| Social | 12.4 / 8.6 | 224.8 / 175.2 | 42.2 | 43.8 |
| Balanced Points | 12.4 / 8.6 | 226.2 / 173.8 | 42.0 | 44.8 |
| Balanced Rating/Elo | 12.6 / 8.4 | 226.2 / 173.8 | 42.4 | 45.2 |

Checkpoint-21 exact player match counts (each row is one seed; IDs are roster identities). The four aggregate columns show min/max/spread and whether all fourteen players have exactly six completed matches.

| Format | Seed | Completed counts by player ID | Min | Max | Spread | All exactly 6 |
|---|---:|---|---:|---:|---:|---|
| Social | 1 | P1=7,P10=6,P11=5,P12=5,P13=6,P14=6,P2=5,P3=7,P4=7,P5=7,P6=5,P7=6,P8=6,P9=6 | 5 | 7 | 2 | no |
| Social | 4729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Social | 104729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Social | 130363 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Social | 2097593 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Points | 1 | P1=7,P10=6,P11=5,P12=5,P13=6,P14=6,P2=5,P3=7,P4=7,P5=7,P6=5,P7=6,P8=6,P9=6 | 5 | 7 | 2 | no |
| Balanced Points | 4729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Points | 104729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Points | 130363 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Points | 2097593 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 1 | P1=7,P10=5,P11=5,P12=6,P13=7,P14=6,P2=5,P3=6,P4=6,P5=6,P6=7,P7=5,P8=6,P9=7 | 5 | 7 | 2 | no |
| Balanced Rating/Elo | 4729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 104729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 130363 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 2097593 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |

## Wide-skill guardrail sensitivity

| Format | Completed | Relationship coverage | Partner / opponent / courtmate | Normalized entropy | Back-to-back rate | Max assignment rest gap | Starvation changes / certified / unknown (rate) | Checkpoint / max fairness spread |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| Balanced Points | 21 | 62.8% | 42.5% / 64.8% / 81.0% | 81.2% | 24.8% | 4.33 | 0.67 / 10 / 0 (19.4%) | 1.33 / 2.33 |
| Balanced Points | 400 | 98.5% | 95.6% / 100.0% / 100.0% | 96.6% | 25.6% | 6.67 | 24.33 / 324 / 0 (22.5%) | 1.33 / 5.00 |
| Balanced Rating/Elo | 21 | 61.4% | 38.8% / 62.3% / 83.2% | 78.6% | 25.7% | 4.00 | 1.00 / 9 / 0 (51.1%) | 1.33 / 2.33 |
| Balanced Rating/Elo | 400 | 95.6% | 89.0% / 97.8% / 100.0% | 95.3% | 26.5% | 5.67 | 28.67 / 333 / 0 (26.1%) | 1.33 / 5.00 |

The wide profile uses the same skill ranks at 10× the narrow strength spread. It is a sensitivity run for balance-envelope restrictions; the primary relationship denominator remains structural and does not shrink to the guardrail.
Static equal-count two-court enumeration excluded 8 directed opportunity records (4 distinct facet-pairs) for wide Balanced Points; the JSON appendix lists the exact pairs.
Static equal-count two-court enumeration excluded 24 directed opportunity records (12 distinct facet-pairs) for wide Balanced Rating/Elo; the JSON appendix lists the exact pairs.

## 400-match relationship completion

| Format | Seeds reaching 100% | Remaining structurally feasible relationships | Guardrail interpretation |
|---|---:|---|---|
| Social | 5/5 | 0 total facet-pairs across seeds | No balance guardrail. |
| Balanced Points | 5/5 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |
| Balanced Rating/Elo | 5/5 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |

The unseen relationship classification is finite-session evidence across successive opportunity layers: balance envelope, frozen replay minimum/allowance, combined-entropy frontier, and soft-cadence frontier. The static balance-feasibility audit is reported separately and can show whether a relationship is structurally feasible while still outside a specific balance envelope. Finite simulation alone does not prove permanent exclusion.

## Long waits

There were 298 completed assignment gaps of at least five available completed-match rest turns in these runs. Deferred-refill classes: fairness_or_mixed_legality: 272; combined_entropy_priority_exclusion: 23; balance_guardrail: 2; starvation_priority: 1. 90 had a linked immediately preceding rest-zero replay. Strict-cadence witnesses show 0 strictly better-vector inclusion opportunities, 0 equal-vector inclusion alternatives, and 23 worse-vector inclusion opportunities. JSON stores selected and candidate IDs/rest vectors; an equal vector may still lose on entropy.

## Runtime

Total measured optimizer/oracle time across sessions: 557.9 seconds. Per-run timings are in JSON.
