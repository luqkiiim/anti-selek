# Matchmaking cadence and relationship coverage benchmark

Generated 2026-10-04T05:00:17.061Z; source commit de0254f84adef7414b512e3d3fd936033d65bef8; policy entropy-first; dirty worktree true. Primary seeds: 5; wide-profile Balanced seeds: 3.
Rendered from saved measurement data on 2026-10-04T05:00:17.138Z; measurement source hashes below identify the code used for the benchmark run.
Worktree note: Benchmark instrumentation is copied into the original entropy-first worktree. socialBatch.ts and scoring.ts are unchanged from the baseline commit; socialVariety.ts contains only the added coverage API.
Tracked source changes from commit: core engine clean; shared variety src/lib/matchmaking/v3/socialVariety.ts; measurement harness clean. Generated untracked artifacts can make the overall worktree dirty without changing these tracked source statuses.
Engine source SHA-256 2c84aa6ef5fad73662f9f05300fbc810eee3028ca956b200193be16496981a2c; measurement harness SHA-256 9af0c2e857fc947f7d0adb34469df9306528b529b5809960bf495432e91540f3.

The roster uses the same P1–P14 identities, gender/preference assignments, latent skill ranks, and independent event-level court-completion schedule for every format at a given seed. The narrow profile maps the same rank vector to Points/Social strengths at 0.1 per rank and Rating strengths at 4 per rank; the wide profile maps it at 1 and 40 respectively. `pointDiff` stays 0 because this benchmark has no match scores. Each run has two active courts; one randomly scheduled court completes per event and is refilled. Coverage counts only completed matches. Rest turns count completed-match events while a player is available; active players do not accrue rest. The +1/+2 threshold counters include available idle events before a player's first match; assignment-rest gaps and back-to-back rates exclude first assignments.

Relationship coverage is the mean of each player’s feasible courtmate, partner, and opponent coverage ratios, excluding only empty opportunity facets. It is distinct from normalized Shannon entropy. Match-type coverage is reported separately. Percentages below are seed-level session averages and then mean/median/min/max across seeds.

## Primary narrow-skill profile

| Format | Completed | Relationship coverage (mean; median; min–max) | Partner / opponent / courtmate | MIXED / OWN_SIDE | Normalized entropy | Back-to-back rate | Max assignment rest gap (mean of per-seed maxima) | Mean / p95 assignment rest | +1 / +2 threshold reaches | Starvation changes / overdue (certified, unknown; rates) | Checkpoint / max fairness spread |
|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| Social | 21 | 64.9%; 65.6%; 61.2%–67.8% | 44.6% / 67.3% / 82.9% | 100.0% / 98.6% | 81.7% | n/a → 28.9% | 4.40; 4.00; 4.00–5.00 | 1.47; 1.46; 1.44–1.49 / 4.00; 4.00; 4.00–4.00 | 6.8 / 0.4 | 0.0 changes (22 overdue; 0 certified, 22 unknown; overdue n/a, certified-only n/a) | 0.40; 0.00; 0.00–2.00 / 2.40; 2.00; 2.00–3.00 |
| Social | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.8% | n/a → 29.5% | 5.80; 6.00; 5.00–7.00 | 1.50; 1.50; 1.49–1.50 / 4.00; 4.00; 4.00–4.00 | 167.8 / 17.6 | 0.0 changes (646 overdue; 0 certified, 646 unknown; overdue n/a, certified-only n/a) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Points | 21 | 64.9%; 65.6%; 61.2%–67.8% | 44.6% / 67.3% / 82.9% | 100.0% / 98.6% | 81.7% | n/a → 28.9% | 4.40; 4.00; 4.00–5.00 | 1.47; 1.46; 1.44–1.49 / 4.00; 4.00; 4.00–4.00 | 6.8 / 0.4 | 0.0 changes (22 overdue; 0 certified, 22 unknown; overdue n/a, certified-only n/a) | 0.40; 0.00; 0.00–2.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Points | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.8% | n/a → 29.7% | 5.80; 6.00; 5.00–7.00 | 1.50; 1.50; 1.49–1.50 / 4.00; 4.00; 4.00–4.00 | 171.0 / 16.4 | 0.0 changes (643 overdue; 0 certified, 643 unknown; overdue n/a, certified-only n/a) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Rating/Elo | 21 | 64.9%; 65.6%; 61.2%–67.8% | 44.6% / 67.5% / 82.6% | 100.0% / 98.6% | 81.7% | n/a → 29.7% | 4.40; 4.00; 4.00–5.00 | 1.46; 1.46; 1.41–1.49 / 4.00; 4.00; 4.00–4.00 | 7.6 / 0.4 | 0.0 changes (24 overdue; 0 certified, 24 unknown; overdue n/a, certified-only n/a) | 0.40; 0.00; 0.00–2.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Rating/Elo | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.8% | n/a → 29.8% | 5.80; 6.00; 5.00–7.00 | 1.50; 1.50; 1.49–1.50 / 4.00; 4.00; 4.00–4.00 | 173.6 / 17.6 | 0.0 changes (644 overdue; 0 certified, 644 unknown; overdue n/a, certified-only n/a) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |

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
| Social | 13.2 / 7.8 | 226.6 / 173.4 | 43.2 | 43.2 |
| Balanced Points | 13.2 / 7.8 | 226.0 / 174.0 | 43.2 | 44.2 |
| Balanced Rating/Elo | 13.2 / 7.8 | 226.2 / 173.8 | 42.6 | 44.4 |

Checkpoint-21 exact player match counts (each row is one seed; IDs are roster identities). The four aggregate columns show min/max/spread and whether all fourteen players have exactly six completed matches.

| Format | Seed | Completed counts by player ID | Min | Max | Spread | All exactly 6 |
|---|---:|---|---:|---:|---:|---|
| Social | 1 | P1=5,P10=5,P11=7,P12=5,P13=6,P14=7,P2=5,P3=6,P4=6,P5=6,P6=6,P7=6,P8=7,P9=7 | 5 | 7 | 2 | no |
| Social | 4729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Social | 104729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Social | 130363 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Social | 2097593 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Points | 1 | P1=5,P10=5,P11=7,P12=5,P13=6,P14=7,P2=5,P3=6,P4=6,P5=6,P6=6,P7=6,P8=7,P9=7 | 5 | 7 | 2 | no |
| Balanced Points | 4729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Points | 104729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Points | 130363 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Points | 2097593 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 1 | P1=6,P10=5,P11=7,P12=7,P13=7,P14=5,P2=6,P3=6,P4=5,P5=6,P6=6,P7=5,P8=6,P9=7 | 5 | 7 | 2 | no |
| Balanced Rating/Elo | 4729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 104729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 130363 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 2097593 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |

## Wide-skill guardrail sensitivity

| Format | Completed | Relationship coverage | Partner / opponent / courtmate | Normalized entropy | Back-to-back rate | Max assignment rest gap | Starvation changes / certified / unknown (rate) | Checkpoint / max fairness spread |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| Balanced Points | 21 | 62.9% | 42.5% / 63.4% / 82.8% | 81.3% | 29.5% | 4.33 | 0.00 / 0 / 11 (n/a) | 1.33 / 2.33 |
| Balanced Points | 400 | 98.5% | 95.6% / 100.0% / 100.0% | 96.6% | 30.3% | 6.67 | 0.00 / 0 / 390 (n/a) | 1.33 / 5.00 |
| Balanced Rating/Elo | 21 | 60.6% | 39.9% / 62.3% / 79.5% | 80.0% | 28.1% | 4.33 | 0.00 / 0 / 10 (n/a) | 1.33 / 2.33 |
| Balanced Rating/Elo | 400 | 95.6% | 89.0% / 97.8% / 100.0% | 95.4% | 30.5% | 5.67 | 0.00 / 0 / 382 (n/a) | 1.33 / 5.00 |

The wide profile uses the same skill ranks at 10× the narrow strength spread. It is a sensitivity run for balance-envelope restrictions; the primary relationship denominator remains structural and does not shrink to the guardrail.
Static equal-count two-court enumeration excluded 8 directed opportunity records (4 distinct facet-pairs) for wide Balanced Points; the JSON appendix lists the exact pairs.
Static equal-count two-court enumeration excluded 24 directed opportunity records (12 distinct facet-pairs) for wide Balanced Rating/Elo; the JSON appendix lists the exact pairs.

## 400-match relationship completion

| Format | Seeds reaching 100% | Remaining structurally feasible relationships | Guardrail interpretation |
|---|---:|---|---|
| Social | 5/5 | 0 total facet-pairs across seeds | No balance guardrail. |
| Balanced Points | 5/5 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |
| Balanced Rating/Elo | 5/5 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |

The unseen relationship classification is finite-session evidence across the balance envelope and the policy's entropy and late-selection frontiers. The static balance-feasibility audit is reported separately and can show whether a relationship is structurally feasible while still outside a specific balance envelope. Finite simulation alone does not prove permanent exclusion.

## Long waits

There were 359 completed assignment gaps of at least five available completed-match rest turns in these runs. Deferred-refill classes: fairness_or_mixed_legality: 302; combined_entropy_priority_exclusion: 55; balance_guardrail: 1; starvation_priority: 1. 129 had a linked immediately preceding rest-zero replay. Strict-cadence witnesses show 0 strictly better-vector inclusion opportunities, 0 equal-vector inclusion alternatives, and 55 worse-vector inclusion opportunities. JSON stores selected and candidate IDs/rest vectors; an equal vector may still lose on entropy.

## Runtime

Total measured optimizer/oracle time across sessions: 375.6 seconds. Per-run timings are in JSON.
