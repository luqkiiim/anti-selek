# Matchmaking cadence and relationship coverage benchmark

Generated 2026-10-04T05:04:10.817Z; source commit bcf07fb22cded580c7e2c0c72d6a5a58bc4eb49d; policy type-entropy-first; dirty worktree true. Primary seeds: 5; wide-profile Balanced seeds: 3.
Rendered from saved measurement data on 2026-10-04T05:48:51.541Z; measurement source hashes below identify the code used for the benchmark run.
Worktree note: Only benchmark measurement files are copied into the type-first worktree; production engine files remain at the recorded type-first commit.
Tracked source changes from commit: core engine clean; shared variety clean; measurement harness scripts/run-matchmaking-benchmark.mjs, src/lib/matchmaking/v3/socialCoverageBenchmark.test.ts, src/lib/matchmaking/v3/socialCoverageBenchmark.ts. Generated untracked artifacts can make the overall worktree dirty without changing these tracked source statuses.
Engine source SHA-256 21c2b52a97ec90d86ac60148a3c5443e7074bd44d81f2a9358b13644d92ea643; measurement harness SHA-256 a2b55c99ba2eef1f8b7ec52b213c6240d739901a52bc7a5a92a7ee6a4ebb5be4.

The roster uses the same P1–P14 identities, gender/preference assignments, latent skill ranks, and independent event-level court-completion schedule for every format at a given seed. The narrow profile maps the same rank vector to Points/Social strengths at 0.1 per rank and Rating strengths at 4 per rank; the wide profile maps it at 1 and 40 respectively. `pointDiff` stays 0 because this benchmark has no match scores. Each run has two active courts; one randomly scheduled court completes per event and is refilled. Coverage counts only completed matches. Rest turns count completed-match events while a player is available; active players do not accrue rest. The +1/+2 threshold counters include available idle events before a player's first match; assignment-rest gaps and back-to-back rates exclude first assignments.

Relationship coverage is the mean of each player’s feasible courtmate, partner, and opponent coverage ratios, excluding only empty opportunity facets. It is distinct from normalized Shannon entropy. Match-type coverage is reported separately. Percentages below are seed-level session averages and then mean/median/min/max across seeds.

## Primary narrow-skill profile

| Format | Completed | Relationship coverage (mean; median; min–max) | Partner / opponent / courtmate | MIXED / OWN_SIDE | Normalized entropy | Back-to-back rate | Max assignment rest gap (mean of per-seed maxima) | Mean / p95 assignment rest | +1 / +2 threshold reaches | Starvation changes / overdue (certified, unknown; rates) | Checkpoint / max fairness spread |
|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| Social | 21 | 59.6%; 58.6%; 56.0%–62.6% | 44.0% / 60.7% / 74.1% | 100.0% / 100.0% | 80.6% | n/a → 24.6% | 4.20; 4.00; 4.00–5.00 | 1.47; 1.49; 1.46–1.49 / 4.00; 4.00; 4.00–4.00 | 6.4 / 0.2 | 1.6 changes (22 overdue; 22 certified, 0 unknown; overdue 39.0%, certified-only 39.0%) | 0.40; 0.00; 0.00–2.00 / 2.40; 2.00; 2.00–3.00 |
| Social | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.3% | n/a → 26.3% | 5.80; 6.00; 5.00–7.00 | 1.50; 1.50; 1.49–1.50 / 4.00; 4.00; 4.00–4.00 | 150.8 / 15.2 | 32.0 changes (578 overdue; 578 certified, 0 unknown; overdue 27.8%, certified-only 27.8%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Points | 21 | 59.6%; 58.6%; 56.0%–62.6% | 44.0% / 60.7% / 74.1% | 100.0% / 100.0% | 80.6% | n/a → 24.6% | 4.20; 4.00; 4.00–5.00 | 1.47; 1.49; 1.46–1.49 / 4.00; 4.00; 4.00–4.00 | 6.4 / 0.2 | 1.6 changes (22 overdue; 22 certified, 0 unknown; overdue 39.0%, certified-only 39.0%) | 0.40; 0.00; 0.00–2.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Points | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.3% | n/a → 26.3% | 6.00; 6.00; 5.00–7.00 | 1.50; 1.50; 1.49–1.50 / 4.00; 4.00; 4.00–4.00 | 150.8 / 15.2 | 32.0 changes (575 overdue; 575 certified, 0 unknown; overdue 28.0%, certified-only 28.0%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Rating/Elo | 21 | 59.5%; 58.6%; 56.4%–62.6% | 44.4% / 60.4% / 73.6% | 100.0% / 100.0% | 80.7% | n/a → 24.3% | 4.20; 4.00; 4.00–5.00 | 1.47; 1.49; 1.46–1.49 / 4.00; 4.00; 4.00–4.00 | 6.2 / 0.2 | 1.4 changes (21 overdue; 21 certified, 0 unknown; overdue 37.3%, certified-only 37.3%) | 0.40; 0.00; 0.00–2.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Rating/Elo | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.3% | n/a → 26.6% | 6.00; 6.00; 5.00–7.00 | 1.50; 1.50; 1.49–1.50 / 4.00; 4.00; 4.00–4.00 | 151.2 / 15.0 | 33.6 changes (572 overdue; 572 certified, 0 unknown; overdue 29.4%, certified-only 29.4%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |

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
| Social | 11.2 / 9.8 | 200.8 / 199.2 | 47.4 | 50.2 |
| Balanced Points | 11.2 / 9.8 | 200.8 / 199.2 | 47.4 | 50.2 |
| Balanced Rating/Elo | 11.2 / 9.8 | 200.8 / 199.2 | 47.4 | 51.0 |

Checkpoint-21 exact player match counts (each row is one seed; IDs are roster identities). The four aggregate columns show min/max/spread and whether all fourteen players have exactly six completed matches.

| Format | Seed | Completed counts by player ID | Min | Max | Spread | All exactly 6 |
|---|---:|---|---:|---:|---:|---|
| Social | 1 | P1=7,P10=6,P11=6,P12=6,P13=6,P14=5,P2=7,P3=7,P4=5,P5=5,P6=7,P7=6,P8=5,P9=6 | 5 | 7 | 2 | no |
| Social | 4729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Social | 104729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Social | 130363 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Social | 2097593 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Points | 1 | P1=7,P10=6,P11=6,P12=6,P13=6,P14=5,P2=7,P3=7,P4=5,P5=5,P6=7,P7=6,P8=5,P9=6 | 5 | 7 | 2 | no |
| Balanced Points | 4729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Points | 104729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Points | 130363 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Points | 2097593 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 1 | P1=7,P10=5,P11=6,P12=6,P13=6,P14=6,P2=7,P3=6,P4=5,P5=7,P6=7,P7=5,P8=6,P9=5 | 5 | 7 | 2 | no |
| Balanced Rating/Elo | 4729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 104729 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 130363 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 2097593 | P1=6,P10=6,P11=6,P12=6,P13=6,P14=6,P2=6,P3=6,P4=6,P5=6,P6=6,P7=6,P8=6,P9=6 | 6 | 6 | 0 | yes |

## Wide-skill guardrail sensitivity

| Format | Completed | Relationship coverage | Partner / opponent / courtmate | Normalized entropy | Back-to-back rate | Max assignment rest gap | Starvation changes / certified / unknown (rate) | Checkpoint / max fairness spread |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| Balanced Points | 21 | 60.1% | 42.1% / 61.2% / 76.9% | 80.2% | 23.3% | 4.67 | 0.33 / 12 / 0 (6.7%) | 1.33 / 2.33 |
| Balanced Points | 400 | 98.5% | 95.6% / 100.0% / 100.0% | 95.8% | 26.9% | 7.00 | 31.67 / 371 / 0 (25.6%) | 1.33 / 5.00 |
| Balanced Rating/Elo | 21 | 56.7% | 38.8% / 55.7% / 75.5% | 78.0% | 22.9% | 4.33 | 0.33 / 9 / 0 (8.3%) | 1.33 / 2.33 |
| Balanced Rating/Elo | 400 | 95.6% | 89.0% / 97.8% / 100.0% | 94.3% | 28.1% | 6.67 | 31.33 / 361 / 0 (26.0%) | 1.33 / 5.00 |

The wide profile uses the same skill ranks at 10× the narrow strength spread. It is a sensitivity run for balance-envelope restrictions; the primary relationship denominator remains structural and does not shrink to the guardrail.
Static equal-count two-court enumeration excluded 8 directed opportunity records (4 distinct facet-pairs) for wide Balanced Points; the JSON appendix lists the exact pairs.
Static equal-count two-court enumeration excluded 24 directed opportunity records (12 distinct facet-pairs) for wide Balanced Rating/Elo; the JSON appendix lists the exact pairs.

## 400-match relationship completion

| Format | Seeds reaching 100% | Remaining structurally feasible relationships | Guardrail interpretation |
|---|---:|---|---|
| Social | 5/5 | 0 total facet-pairs across seeds | No balance guardrail. |
| Balanced Points | 5/5 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |
| Balanced Rating/Elo | 5/5 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |

The unseen relationship classification is finite-session evidence across successive opportunity layers: balance envelope, match-type entropy frontier, zero-rest frontier, relationship-entropy frontier, and soft-cadence frontier. The static balance-feasibility audit is reported separately and can show whether a relationship is structurally feasible while still outside a specific balance envelope. Finite simulation alone does not prove permanent exclusion.

## Long waits

There were 336 completed assignment gaps of at least five available completed-match rest turns in these runs. Deferred-refill classes: fairness_or_mixed_legality: 290; match_type_entropy_priority_exclusion: 8; relationship_entropy_priority_exclusion: 37; balance_guardrail: 1. 89 had a linked immediately preceding rest-zero replay. Strict-cadence witnesses show 0 strictly better-vector inclusion opportunities, 0 equal-vector inclusion alternatives, and 45 worse-vector inclusion opportunities. JSON stores selected and candidate IDs/rest vectors; an equal vector may still lose on entropy.

## Runtime

Total measured optimizer/oracle time across sessions: 470.8 seconds. Per-run timings are in JSON.

### Diagnostic classification correction

This Markdown was re-rendered from the saved 21/400 measurements after correcting 48 wide-profile per-seed missing-relationship labels (16 distinct facet-pairs repeated across three seeds). Those pairs had strongest-class opportunities but no balance-envelope opportunities, so they are classified as balance-envelope exclusions. The correction changed only derived missing-relationship classifications; simulation output, selected matches, metrics, and original source provenance remain unchanged. The JSON records correction source commit `637c1e4d3ce35b39f20a171911a92d3dfa97e0ca`.