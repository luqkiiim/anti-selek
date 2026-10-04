# Matchmaking cadence and relationship coverage benchmark

Generated 2026-10-04T05:07:15.464Z; source commit 93262f36336b9533ba96b4e4bec5d7e8061eef6e; policy strict-cadence; dirty worktree true. Primary seeds: 5; wide-profile Balanced seeds: 3.
Rendered from saved measurement data on 2026-10-04T05:07:15.534Z; measurement source hashes below identify the code used for the benchmark run.
Worktree note: Only benchmark measurement files are copied into the strict-policy worktree; production engine files remain at the recorded strict commit.
Tracked source changes from commit: core engine clean; shared variety clean; measurement harness scripts/run-matchmaking-benchmark.mjs, src/lib/matchmaking/v3/socialCoverageBenchmark.test.ts, src/lib/matchmaking/v3/socialCoverageBenchmark.ts. Generated untracked artifacts can make the overall worktree dirty without changing these tracked source statuses.
Engine source SHA-256 5dd33ca48c7a7731883081792360f0a04e439b3ddd704f135ed3a63ed1bf2f36; measurement harness SHA-256 d0335b6349488f8e70350e3aea57cb9565b4445b32a055c36482d6395e1a857a.

The roster uses the same P1–P14 identities, gender/preference assignments, latent skill ranks, and independent event-level court-completion schedule for every format at a given seed. The narrow profile maps the same rank vector to Points/Social strengths at 0.1 per rank and Rating strengths at 4 per rank; the wide profile maps it at 1 and 40 respectively. `pointDiff` stays 0 because this benchmark has no match scores. Each run has two active courts; one randomly scheduled court completes per event and is refilled. Coverage counts only completed matches. Rest turns count completed-match events while a player is available; active players do not accrue rest. The +1/+2 threshold counters include available idle events before a player's first match; assignment-rest gaps and back-to-back rates exclude first assignments.

Relationship coverage is the mean of each player’s feasible courtmate, partner, and opponent coverage ratios, excluding only empty opportunity facets. It is distinct from normalized Shannon entropy. Match-type coverage is reported separately. Percentages below are seed-level session averages and then mean/median/min/max across seeds.

## Primary narrow-skill profile

| Format | Completed | Relationship coverage (mean; median; min–max) | Partner / opponent / courtmate | MIXED / OWN_SIDE | Normalized entropy | Back-to-back rate | Max assignment rest gap (mean of per-seed maxima) | Mean / p95 assignment rest | +1 / +2 threshold reaches | Starvation changes / overdue (certified, unknown; rates) | Checkpoint / max fairness spread |
|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| Social | 21 | 56.9%; 57.9%; 50.5%–61.2% | 37.6% / 59.6% / 73.6% | 100.0% / 11.4% | 55.8% | n/a → 11.1% | 3.00; 3.00; 2.00–4.00 | 1.48; 1.49; 1.46–1.51 / 3.00; 3.00; 2.00–4.00 | 0.8 / 0.0 | 0.0 changes (2 overdue; 2 certified, 0 unknown; overdue 0.0%, certified-only 0.0%) | 0.40; 0.00; 0.00–2.00 / 2.40; 2.00; 2.00–3.00 |
| Social | 400 | 84.9%; 84.6%; 84.6%–86.1% | 54.7% / 100.0% / 100.0% | 100.0% / 11.4% | 68.7% | n/a → 12.6% | 5.40; 6.00; 4.00–6.00 | 1.50; 1.50; 1.50–1.50 / 3.00; 3.00; 3.00–3.00 | 28.4 / 5.2 | 0.0 changes (80 overdue; 80 certified, 0 unknown; overdue 0.0%, certified-only 0.0%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Points | 21 | 56.6%; 56.8%; 49.8%–61.2% | 38.0% / 58.7% / 73.0% | 100.0% / 11.4% | 55.8% | n/a → 11.1% | 3.00; 3.00; 2.00–4.00 | 1.48; 1.49; 1.46–1.51 / 3.00; 3.00; 2.00–4.00 | 0.8 / 0.0 | 0.0 changes (2 overdue; 2 certified, 0 unknown; overdue 0.0%, certified-only 0.0%) | 0.40; 0.00; 0.00–2.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Points | 400 | 84.9%; 84.6%; 84.6%–86.1% | 54.7% / 100.0% / 100.0% | 100.0% / 11.4% | 68.7% | n/a → 12.6% | 5.40; 6.00; 4.00–6.00 | 1.50; 1.50; 1.50–1.50 / 3.00; 3.00; 3.00–3.00 | 28.4 / 5.2 | 0.0 changes (80 overdue; 80 certified, 0 unknown; overdue 0.0%, certified-only 0.0%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Rating/Elo | 21 | 57.2%; 58.6%; 50.5%–61.2% | 37.8% / 60.4% / 73.4% | 100.0% / 0.0% | 54.4% | n/a → 10.9% | 3.00; 3.00; 2.00–4.00 | 1.48; 1.49; 1.46–1.51 / 3.00; 3.00; 2.00–4.00 | 0.8 / 0.0 | 0.0 changes (2 overdue; 2 certified, 0 unknown; overdue 0.0%, certified-only 0.0%) | 0.40; 0.00; 0.00–2.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Rating/Elo | 400 | 84.6%; 84.6%; 84.6%–84.6% | 53.8% / 100.0% / 100.0% | 100.0% / 0.0% | 68.5% | n/a → 12.6% | 5.40; 6.00; 4.00–6.00 | 1.50; 1.50; 1.50–1.50 / 3.00; 3.00; 3.00–3.00 | 28.4 / 5.2 | 0.0 changes (80 overdue; 80 certified, 0 unknown; overdue 0.0%, certified-only 0.0%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |

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
| Social | 20.6 / 0.4 | 399.6 / 0.4 | 0.4 | 0.0 |
| Balanced Points | 20.6 / 0.4 | 399.6 / 0.4 | 0.4 | 0.0 |
| Balanced Rating/Elo | 21.0 / 0.0 | 400.0 / 0.0 | 0.0 | 0.0 |

Checkpoint-21 exact player match counts (each row is one seed; IDs are roster identities). The four aggregate columns show min/max/spread and whether all fourteen players have exactly six completed matches.

| Format | Seed | P1–P14 completed-match counts | Min | Max | Spread | All exactly 6 |
|---|---:|---|---:|---:|---:|---|
| Social | 1 | 5,6,5,5,7,6,6,7,6,6,7,5,6,7 | 5 | 7 | 2 | no |
| Social | 4729 | 6,6,6,6,6,6,6,6,6,6,6,6,6,6 | 6 | 6 | 0 | yes |
| Social | 104729 | 6,6,6,6,6,6,6,6,6,6,6,6,6,6 | 6 | 6 | 0 | yes |
| Social | 130363 | 6,6,6,6,6,6,6,6,6,6,6,6,6,6 | 6 | 6 | 0 | yes |
| Social | 2097593 | 6,6,6,6,6,6,6,6,6,6,6,6,6,6 | 6 | 6 | 0 | yes |
| Balanced Points | 1 | 5,5,5,6,6,6,5,7,6,7,6,6,7,7 | 5 | 7 | 2 | no |
| Balanced Points | 4729 | 6,6,6,6,6,6,6,6,6,6,6,6,6,6 | 6 | 6 | 0 | yes |
| Balanced Points | 104729 | 6,6,6,6,6,6,6,6,6,6,6,6,6,6 | 6 | 6 | 0 | yes |
| Balanced Points | 130363 | 6,6,6,6,6,6,6,6,6,6,6,6,6,6 | 6 | 6 | 0 | yes |
| Balanced Points | 2097593 | 6,6,6,6,6,6,6,6,6,6,6,6,6,6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 1 | 5,7,7,5,5,6,7,6,6,6,5,7,6,6 | 5 | 7 | 2 | no |
| Balanced Rating/Elo | 4729 | 6,6,6,6,6,6,6,6,6,6,6,6,6,6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 104729 | 6,6,6,6,6,6,6,6,6,6,6,6,6,6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 130363 | 6,6,6,6,6,6,6,6,6,6,6,6,6,6 | 6 | 6 | 0 | yes |
| Balanced Rating/Elo | 2097593 | 6,6,6,6,6,6,6,6,6,6,6,6,6,6 | 6 | 6 | 0 | yes |

## Wide-skill guardrail sensitivity

| Format | Completed | Relationship coverage | Partner / opponent / courtmate | Normalized entropy | Back-to-back rate | Max assignment rest gap | Starvation changes / certified / unknown (rate) | Checkpoint / max fairness spread |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| Balanced Points | 21 | 59.1% | 35.5% / 62.6% / 79.1% | 60.7% | 9.5% | 3.00 | 0.00 / 0 / 0 (n/a) | 1.33 / 2.33 |
| Balanced Points | 400 | 85.6% | 56.8% / 100.0% / 100.0% | 68.4% | 13.5% | 5.00 | 0.00 / 50 / 0 (0.0%) | 1.33 / 5.00 |
| Balanced Rating/Elo | 21 | 54.9% | 31.5% / 60.1% / 73.3% | 58.6% | 10.0% | 3.00 | 0.00 / 0 / 0 (n/a) | 1.33 / 2.33 |
| Balanced Rating/Elo | 400 | 84.1% | 54.6% / 97.8% / 100.0% | 67.2% | 14.0% | 5.00 | 1.33 / 71 / 0 (4.9%) | 1.33 / 5.00 |

The wide profile uses the same skill ranks at 10× the narrow strength spread. It is a sensitivity run for balance-envelope restrictions; the primary relationship denominator remains structural and does not shrink to the guardrail.
Static equal-count two-court enumeration excluded 8 directed opportunity records (4 distinct facet-pairs) for wide Balanced Points; the JSON appendix lists the exact pairs.
Static equal-count two-court enumeration excluded 24 directed opportunity records (12 distinct facet-pairs) for wide Balanced Rating/Elo; the JSON appendix lists the exact pairs.

## 400-match relationship completion

| Format | Seeds reaching 100% | Remaining structurally feasible relationships | Guardrail interpretation |
|---|---:|---|---|
| Social | 0/5 | 206 total facet-pairs across seeds | No balance guardrail. |
| Balanced Points | 0/5 | 206 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |
| Balanced Rating/Elo | 0/5 | 210 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |

The unseen relationship classification is finite-session evidence across successive opportunity layers: balance envelope, strict-cadence frontier, and later entropy/quality ties. The static balance-feasibility audit is reported separately and can show whether a relationship is structurally feasible while still outside a specific balance envelope. Finite simulation alone does not prove permanent exclusion.

## Long waits

There were 97 completed assignment gaps of at least five available completed-match rest turns in these runs. Deferred-refill classes: fairness_or_mixed_legality: 87; strict_entropy_priority_exclusion: 10. 0 had a linked immediately preceding rest-zero replay. Strict-cadence witnesses show 0 strictly better-vector inclusion opportunities, 0 equal-vector inclusion alternatives, and 10 worse-vector inclusion opportunities. JSON stores selected and candidate IDs/rest vectors; an equal vector may still lose on entropy.

## Runtime

Total measured optimizer/oracle time across sessions: 378.5 seconds. Per-run timings are in JSON.
