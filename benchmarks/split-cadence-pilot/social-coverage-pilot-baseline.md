# Matchmaking cadence and relationship coverage benchmark

Generated 2026-10-03T11:28:45.914Z; source commit de0254f84adef7414b512e3d3fd936033d65bef8; policy entropy-first; dirty worktree true. Primary seeds: 1; wide-profile Balanced seeds: 0.
Engine source SHA-256 2c84aa6ef5fad73662f9f05300fbc810eee3028ca956b200193be16496981a2c; measurement harness SHA-256 259891ee058ff0ec0bb490e5e2360ec597237af2b63567db19674506808d80ce.

The roster uses the same P1–P14 identities, gender/preference assignments, latent skill ranks, and independent event-level court-completion schedule for every format at a given seed. The narrow profile maps the same rank vector to Points/Social strengths at 0.1 per rank and Rating strengths at 4 per rank; the wide profile maps it at 1 and 40 respectively. `pointDiff` stays 0 because this benchmark has no match scores. Each run has two active courts; one randomly scheduled court completes per event and is refilled. Coverage counts only completed matches. Rest turns count completed-match events while a player is available; active players do not accrue rest. The +1/+2 threshold counters include available idle events before a player's first match; assignment-rest gaps and back-to-back rates exclude first assignments.

Relationship coverage is the mean of each player’s feasible courtmate, partner, and opponent coverage ratios, excluding only empty opportunity facets. It is distinct from normalized Shannon entropy. Match-type coverage is reported separately. Percentages below are seed-level session averages and then mean/median/min/max across seeds.

## Primary narrow-skill profile

| Format | Completed | Relationship coverage (mean; median; min–max) | Partner / opponent / courtmate | MIXED / OWN_SIDE | Normalized entropy | Back-to-back rate | Max assignment rest gap (mean of per-seed maxima) | Mean / p95 assignment rest | +1 / +2 threshold reaches | Starvation changed set | Checkpoint / max fairness spread |
|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| Social | 20 | 61.9%; 61.9%; 61.9%–61.9% | 41.8% / 63.7% / 80.2% | 100.0% / 100.0% | 80.9% | n/a → 30.3% | 5.00; 5.00; 5.00–5.00 | 1.45; 1.45; 1.45–1.45 / 4.00; 4.00; 4.00–4.00 | 5.0 / 1.0 | 0.0 (n/a) | 1.00; 1.00; 1.00–1.00 / 2.00; 2.00; 2.00–2.00 |
| Social | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.8% | n/a → 29.9% | 6.00; 6.00; 6.00–6.00 | 1.49; 1.49; 1.49–1.49 / 4.00; 4.00; 4.00–4.00 | 163.0 / 17.0 | 0.0 (n/a) | 1.00; 1.00; 1.00–1.00 / 5.00; 5.00; 5.00–5.00 |
| Balanced Points | 20 | 61.9%; 61.9%; 61.9%–61.9% | 41.8% / 63.7% / 80.2% | 100.0% / 100.0% | 80.9% | n/a → 30.3% | 5.00; 5.00; 5.00–5.00 | 1.45; 1.45; 1.45–1.45 / 4.00; 4.00; 4.00–4.00 | 5.0 / 1.0 | 0.0 (n/a) | 1.00; 1.00; 1.00–1.00 / 2.00; 2.00; 2.00–2.00 |
| Balanced Points | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.8% | n/a → 29.9% | 6.00; 6.00; 6.00–6.00 | 1.49; 1.49; 1.49–1.49 / 4.00; 4.00; 4.00–4.00 | 163.0 / 17.0 | 0.0 (n/a) | 1.00; 1.00; 1.00–1.00 / 5.00; 5.00; 5.00–5.00 |
| Balanced Rating/Elo | 20 | 61.9%; 61.9%; 61.9%–61.9% | 41.8% / 64.8% / 79.1% | 100.0% / 100.0% | 80.8% | n/a → 33.3% | 5.00; 5.00; 5.00–5.00 | 1.45; 1.45; 1.45–1.45 / 4.00; 4.00; 4.00–4.00 | 7.0 / 1.0 | 0.0 (n/a) | 1.00; 1.00; 1.00–1.00 / 2.00; 2.00; 2.00–2.00 |
| Balanced Rating/Elo | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.8% | n/a → 30.9% | 6.00; 6.00; 6.00–6.00 | 1.49; 1.49; 1.49–1.49 / 4.00; 4.00; 4.00–4.00 | 183.0 / 21.0 | 0.0 (n/a) | 1.00; 1.00; 1.00–1.00 / 5.00; 5.00; 5.00–5.00 |

The table reports after-change coverage/entropy and before→after back-to-back rate and maximum assignment rest gap when a baseline report is supplied. Assignment rest is the completed-match rest-turn count sampled when players are selected; elapsed completion-event gaps are retained as a separate diagnostic and can include time spent in a match. `Starvation changed set` gives mean counterfactual set changes and the rate conditional on an overdue player being available. The fairness columns are checkpoint spread and maximum spread seen over the run. Exact per-seed values and missing relationship lists are in the adjacent JSON.

## Completed match-type counts by session window

These are actual completed matches, not player-level match-type coverage. Early and late refer to the first and last 100 completed matches of each 400-match run.

| Format | At 20 completed: MIXED / OWN_SIDE | At 400 completed: MIXED / OWN_SIDE | First 100 OWN_SIDE | Last 100 OWN_SIDE |
|---|---:|---:|---:|---:|
| Social | 12.0 / 8.0 | 227.0 / 173.0 | 44.0 | 42.0 |
| Balanced Points | 12.0 / 8.0 | 227.0 / 173.0 | 44.0 | 42.0 |
| Balanced Rating/Elo | 12.0 / 8.0 | 227.0 / 173.0 | 42.0 | 44.0 |

## 400-match relationship completion

| Format | Seeds reaching 100% | Remaining structurally feasible relationships | Guardrail interpretation |
|---|---:|---|---|
| Social | 1/1 | 0 total facet-pairs across seeds | No balance guardrail. |
| Balanced Points | 1/1 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |
| Balanced Rating/Elo | 1/1 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |

The unseen relationship classification is finite-session evidence: `ever admissible but unchosen`, `in the strongest fair/starvation class but excluded by every observed balance envelope`, or `never in the strongest rotation class during observed refills`. The static balance-feasibility audit is reported separately and can show whether a relationship is structurally possible while still outside a specific balance envelope. Finite simulation alone does not prove permanent exclusion.

## Long waits

There were 55 completed assignment gaps of at least five available completed-match rest turns in these runs. Deferred-refill classes: fairness_or_mixed_legality: 51; cadence_tie_later_tiebreak: 4. 17 had a linked immediately preceding rest-zero replay. Strict-cadence witnesses show 0 strictly better-vector inclusion opportunities, 2 equal-vector inclusion alternatives, and 0 worse-vector inclusion opportunities. JSON stores selected and candidate IDs/rest vectors; an equal vector may still lose on entropy.

## Runtime

Total measured optimizer/oracle time across sessions: 36.6 seconds. Per-run timings are in JSON.

