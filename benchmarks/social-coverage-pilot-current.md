# Matchmaking cadence and relationship coverage benchmark

Generated 2026-10-03T08:17:34.307Z; source revision HEAD de0254f8 + working-tree changes. Primary seeds: 1; wide-profile Balanced seeds: 0.

The roster uses the same P1–P14 identities, gender/preference assignments, latent skill ranks, and independent event-level court-completion schedule for every format at a given seed. The narrow profile maps the same rank vector to Points/Social strengths at 0.1 per rank and Rating strengths at 4 per rank; the wide profile maps it at 1 and 40 respectively. `pointDiff` stays 0 because this benchmark has no match scores. Each run has two active courts; one randomly scheduled court completes per event and is refilled. Coverage counts only completed matches. Rest turns count completed-match events while a player is available; active players do not accrue rest.

Relationship coverage is the mean of each player’s feasible courtmate, partner, and opponent coverage ratios, excluding only empty opportunity facets. It is distinct from normalized Shannon entropy. Match-type coverage is reported separately. Percentages below are seed-level session averages and then mean/median/min/max across seeds.

## Primary narrow-skill profile

| Format | Completed | Relationship coverage (mean; median; min–max) | Partner / opponent / courtmate | MIXED / OWN_SIDE | Normalized entropy | Back-to-back rate | Max assignment rest gap (mean of per-seed maxima) | Mean / p95 assignment rest | +1 / +2 threshold reaches | Starvation changed set | Checkpoint / max fairness spread |
|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| Social (before → after) | 20 | 50.5%; 50.5%; 50.5%–50.5% | 34.1% / 53.8% / 63.7% | 100.0% / 0.0% | 50.7% | 30.3% → 18.2% | 5.00; 5.00; 5.00–5.00 → 3.00; 3.00; 3.00–3.00 | 1.48; 1.48; 1.48–1.48 / 3.00; 3.00; 3.00–3.00 | 0.0 / 0.0 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 2.00; 2.00; 2.00–2.00 |
| Social (before → after) | 400 | 84.6%; 84.6%; 84.6%–84.6% | 53.8% / 100.0% / 100.0% | 100.0% / 0.0% | 68.5% | 29.9% → 12.4% | 6.00; 6.00; 6.00–6.00 → 6.00; 6.00; 6.00–6.00 | 1.50; 1.50; 1.50–1.50 / 3.00; 3.00; 3.00–3.00 | 20.0 / 6.0 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 5.00; 5.00; 5.00–5.00 |
| Balanced Points (before → after) | 20 | 49.8%; 49.8%; 49.8%–49.8% | 33.0% / 52.7% / 63.7% | 100.0% / 0.0% | 50.2% | 30.3% → 18.2% | 5.00; 5.00; 5.00–5.00 → 3.00; 3.00; 3.00–3.00 | 1.48; 1.48; 1.48–1.48 / 3.00; 3.00; 3.00–3.00 | 0.0 / 0.0 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 2.00; 2.00; 2.00–2.00 |
| Balanced Points (before → after) | 400 | 84.6%; 84.6%; 84.6%–84.6% | 53.8% / 100.0% / 100.0% | 100.0% / 0.0% | 68.5% | 29.9% → 12.4% | 6.00; 6.00; 6.00–6.00 → 6.00; 6.00; 6.00–6.00 | 1.50; 1.50; 1.50–1.50 / 3.00; 3.00; 3.00–3.00 | 20.0 / 6.0 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 5.00; 5.00; 5.00–5.00 |
| Balanced Rating/Elo (before → after) | 20 | 50.5%; 50.5%; 50.5%–50.5% | 34.1% / 53.8% / 63.7% | 100.0% / 0.0% | 50.7% | 33.3% → 18.2% | 5.00; 5.00; 5.00–5.00 → 3.00; 3.00; 3.00–3.00 | 1.48; 1.48; 1.48–1.48 / 3.00; 3.00; 3.00–3.00 | 0.0 / 0.0 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 2.00; 2.00; 2.00–2.00 |
| Balanced Rating/Elo (before → after) | 400 | 84.6%; 84.6%; 84.6%–84.6% | 53.8% / 100.0% / 100.0% | 100.0% / 0.0% | 68.5% | 30.9% → 12.4% | 6.00; 6.00; 6.00–6.00 → 6.00; 6.00; 6.00–6.00 | 1.50; 1.50; 1.50–1.50 / 3.00; 3.00; 3.00–3.00 | 20.0 / 6.0 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 5.00; 5.00; 5.00–5.00 |

The table reports after-change coverage/entropy and before→after back-to-back rate and maximum assignment rest gap when a baseline report is supplied. Assignment rest is the completed-match rest-turn count sampled when players are selected; elapsed completion-event gaps are retained as a separate diagnostic and can include time spent in a match. `Starvation changed set` gives mean counterfactual set changes and the rate conditional on an overdue player being available. The fairness columns are checkpoint spread and maximum spread seen over the run. Exact per-seed values and missing relationship lists are in the adjacent JSON.

## 400-match relationship completion

| Format | Seeds reaching 100% | Remaining structurally feasible relationships | Guardrail interpretation |
|---|---:|---|---|
| Social | 0/1 | 42 total facet-pairs across seeds | No balance guardrail. |
| Balanced Points | 0/1 | 42 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |
| Balanced Rating/Elo | 0/1 | 42 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |

The unseen relationship classification is finite-session evidence: `ever admissible but unchosen`, `in the strongest fair/starvation class but excluded by every observed balance envelope`, or `never in the strongest rotation class during observed refills`. The static balance-feasibility audit is reported separately and can show whether a relationship is structurally possible while still outside a specific balance envelope. Finite simulation alone does not prove permanent exclusion.

## Long waits

There were 18 completed assignment gaps of at least five available completed-match rest turns in these runs. Per-episode classifications are in JSON; `avoidable_equal_priority_smoother_alternative` means the independent oracle saw a strictly better cadence vector at an equally fair, starvation-equivalent, and balance-admissible refill.

## Runtime

Total measured optimizer/oracle time across sessions: 43.0 seconds. Per-run timings are in JSON.

