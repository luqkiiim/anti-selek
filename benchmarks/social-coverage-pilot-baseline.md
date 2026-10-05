# Matchmaking cadence and relationship coverage benchmark

Generated 2026-10-03T08:16:48.752Z; source revision de0254f84adef7414b512e3d3fd936033d65bef8 (original engine; benchmark coverage instrumentation added). Primary seeds: 1; wide-profile Balanced seeds: 0.

The roster uses the same P1–P14 identities, gender/preference assignments, latent skill ranks, and independent event-level court-completion schedule for every format at a given seed. The narrow profile maps the same rank vector to Points/Social strengths at 0.1 per rank and Rating strengths at 4 per rank; the wide profile maps it at 1 and 40 respectively. `pointDiff` stays 0 because this benchmark has no match scores. Each run has two active courts; one randomly scheduled court completes per event and is refilled. Coverage counts only completed matches. Rest turns count completed-match events while a player is available; active players do not accrue rest.

Relationship coverage is the mean of each player’s feasible courtmate, partner, and opponent coverage ratios, excluding only empty opportunity facets. It is distinct from normalized Shannon entropy. Match-type coverage is reported separately. Percentages below are seed-level session averages and then mean/median/min/max across seeds.

## Primary narrow-skill profile

| Format | Completed | Relationship coverage (mean; median; min–max) | Partner / opponent / courtmate | MIXED / OWN_SIDE | Normalized entropy | Back-to-back rate | Max assignment rest gap (mean of per-seed maxima) | Mean / p95 assignment rest | +1 / +2 threshold reaches | Starvation changed set | Checkpoint / max fairness spread |
|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| Social | 20 | 61.9%; 61.9%; 61.9%–61.9% | 41.8% / 63.7% / 80.2% | 100.0% / 100.0% | 80.9% | n/a → 30.3% | 5.00; 5.00; 5.00–5.00 | 1.45; 1.45; 1.45–1.45 / 4.00; 4.00; 4.00–4.00 | 5.0 / 1.0 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 2.00; 2.00; 2.00–2.00 |
| Social | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.8% | n/a → 29.9% | 6.00; 6.00; 6.00–6.00 | 1.49; 1.49; 1.49–1.49 / 4.00; 4.00; 4.00–4.00 | 163.0 / 17.0 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 5.00; 5.00; 5.00–5.00 |
| Balanced Points | 20 | 61.9%; 61.9%; 61.9%–61.9% | 41.8% / 63.7% / 80.2% | 100.0% / 100.0% | 80.9% | n/a → 30.3% | 5.00; 5.00; 5.00–5.00 | 1.45; 1.45; 1.45–1.45 / 4.00; 4.00; 4.00–4.00 | 5.0 / 1.0 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 2.00; 2.00; 2.00–2.00 |
| Balanced Points | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.8% | n/a → 29.9% | 6.00; 6.00; 6.00–6.00 | 1.49; 1.49; 1.49–1.49 / 4.00; 4.00; 4.00–4.00 | 163.0 / 17.0 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 5.00; 5.00; 5.00–5.00 |
| Balanced Rating/Elo | 20 | 61.9%; 61.9%; 61.9%–61.9% | 41.8% / 64.8% / 79.1% | 100.0% / 100.0% | 80.8% | n/a → 33.3% | 5.00; 5.00; 5.00–5.00 | 1.45; 1.45; 1.45–1.45 / 4.00; 4.00; 4.00–4.00 | 7.0 / 1.0 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 2.00; 2.00; 2.00–2.00 |
| Balanced Rating/Elo | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.8% | n/a → 30.9% | 6.00; 6.00; 6.00–6.00 | 1.49; 1.49; 1.49–1.49 / 4.00; 4.00; 4.00–4.00 | 183.0 / 21.0 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 5.00; 5.00; 5.00–5.00 |

The table reports after-change coverage/entropy and before→after back-to-back rate and maximum assignment rest gap when a baseline report is supplied. Assignment rest is the completed-match rest-turn count sampled when players are selected; elapsed completion-event gaps are retained as a separate diagnostic and can include time spent in a match. `Starvation changed set` gives mean counterfactual set changes and the rate conditional on an overdue player being available. The fairness columns are checkpoint spread and maximum spread seen over the run. Exact per-seed values and missing relationship lists are in the adjacent JSON.

## 400-match relationship completion

| Format | Seeds reaching 100% | Remaining structurally feasible relationships | Guardrail interpretation |
|---|---:|---|---|
| Social | 1/1 | 0 total facet-pairs across seeds | No balance guardrail. |
| Balanced Points | 1/1 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |
| Balanced Rating/Elo | 1/1 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |

The unseen relationship classification is finite-session evidence: `ever admissible but unchosen`, `in the strongest fair/starvation class but excluded by every observed balance envelope`, or `never in the strongest rotation class during observed refills`. The static balance-feasibility audit is reported separately and can show whether a relationship is structurally possible while still outside a specific balance envelope. Finite simulation alone does not prove permanent exclusion.

## Long waits

There were 55 completed assignment gaps of at least five available completed-match rest turns in these runs. Per-episode classifications are in JSON; `avoidable_equal_priority_smoother_alternative` means the independent oracle saw a strictly better cadence vector at an equally fair, starvation-equivalent, and balance-admissible refill.

## Runtime

Total measured optimizer/oracle time across sessions: 40.1 seconds. Per-run timings are in JSON.

