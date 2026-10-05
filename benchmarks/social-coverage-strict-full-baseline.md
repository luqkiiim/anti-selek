# Matchmaking cadence and relationship coverage benchmark

Generated 2026-10-03 (preserved historical run); source commit de0254f84adef7414b512e3d3fd936033d65bef8; policy entropy-first; dirty worktree true.
Preserved historical entropy-first run. The baseline checkout had benchmark coverage instrumentation in socialVariety.ts; socialBatch.ts and scoring.ts were verified unchanged from the baseline commit. This report predates source hashing, so exact hashes are unavailable.

The roster uses the same P1–P14 identities, gender/preference assignments, latent skill ranks, and independent event-level court-completion schedule for every format at a given seed. The narrow profile maps the same rank vector to Points/Social strengths at 0.1 per rank and Rating strengths at 4 per rank; the wide profile maps it at 1 and 40 respectively. `pointDiff` stays 0 because this benchmark has no match scores. Each run has two active courts; one randomly scheduled court completes per event and is refilled. Coverage counts only completed matches. Rest turns count completed-match events while a player is available; active players do not accrue rest.

Relationship coverage is the mean of each player’s feasible courtmate, partner, and opponent coverage ratios, excluding only empty opportunity facets. It is distinct from normalized Shannon entropy. Match-type coverage is reported separately. Percentages below are seed-level session averages and then mean/median/min/max across seeds.

## Primary narrow-skill profile

| Format | Completed | Relationship coverage (mean; median; min–max) | Partner / opponent / courtmate | MIXED / OWN_SIDE | Normalized entropy | Back-to-back rate | Max assignment rest gap (mean of per-seed maxima) | Mean / p95 assignment rest | +1 / +2 threshold reaches | Starvation changed set | Checkpoint / max fairness spread |
|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| Social | 20 | 63.3%; 64.8%; 58.2%–66.3% | 42.9% / 65.9% / 81.1% | 100.0% / 98.6% | 80.9% | n/a → 30.3% | 4.40; 4.00; 4.00–5.00 | 1.44; 1.44; 1.42–1.45 / 3.80; 4.00; 3.00–4.00 | 6.2 / 0.4 | 0.0 (n/a) | 1.00; 1.00; 1.00–1.00 / 2.40; 2.00; 2.00–3.00 |
| Social | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.8% | n/a → 29.5% | 5.80; 6.00; 5.00–7.00 | 1.50; 1.50; 1.49–1.50 / 4.00; 4.00; 4.00–4.00 | 167.8 / 17.6 | 0.0 (n/a) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Points | 20 | 63.3%; 64.8%; 58.2%–66.3% | 42.9% / 65.9% / 81.1% | 100.0% / 98.6% | 80.9% | n/a → 30.3% | 4.40; 4.00; 4.00–5.00 | 1.44; 1.44; 1.42–1.45 / 3.80; 4.00; 3.00–4.00 | 6.2 / 0.4 | 0.0 (n/a) | 1.00; 1.00; 1.00–1.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Points | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.8% | n/a → 29.7% | 5.80; 6.00; 5.00–7.00 | 1.50; 1.50; 1.49–1.50 / 4.00; 4.00; 4.00–4.00 | 171.0 / 16.4 | 0.0 (n/a) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Rating/Elo | 20 | 63.5%; 64.8%; 59.3%–66.3% | 42.9% / 66.4% / 81.3% | 100.0% / 98.6% | 81.0% | n/a → 30.9% | 4.40; 4.00; 4.00–5.00 | 1.43; 1.44; 1.39–1.45 / 3.80; 4.00; 3.00–4.00 | 7.0 / 0.4 | 0.0 (n/a) | 1.00; 1.00; 1.00–1.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Rating/Elo | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.8% | n/a → 29.8% | 5.80; 6.00; 5.00–7.00 | 1.50; 1.50; 1.49–1.50 / 4.00; 4.00; 4.00–4.00 | 173.6 / 17.6 | 0.0 (n/a) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |

The table reports after-change coverage/entropy and before→after back-to-back rate and maximum assignment rest gap when a baseline report is supplied. Assignment rest is the completed-match rest-turn count sampled when players are selected; elapsed completion-event gaps are retained as a separate diagnostic and can include time spent in a match. `Starvation changed set` gives mean counterfactual set changes and the rate conditional on an overdue player being available. The fairness columns are checkpoint spread and maximum spread seen over the run. Exact per-seed values and missing relationship lists are in the adjacent JSON.

## 400-match relationship completion

| Format | Seeds reaching 100% | Remaining structurally feasible relationships | Guardrail interpretation |
|---|---:|---|---|
| Social | 5/5 | 0 total facet-pairs across seeds | No balance guardrail. |
| Balanced Points | 5/5 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |
| Balanced Rating/Elo | 5/5 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |

The unseen relationship classification is finite-session evidence: `ever admissible but unchosen`, `in the strongest fair/starvation class but excluded by every observed balance envelope`, or `never in the strongest rotation class during observed refills`. The static balance-feasibility audit is reported separately and can show whether a relationship is structurally possible while still outside a specific balance envelope. Finite simulation alone does not prove permanent exclusion.

## Long waits

There were 258 completed assignment gaps of at least five available completed-match rest turns in these runs. Per-episode classifications are in JSON; `avoidable_equal_priority_smoother_alternative` means the independent oracle saw a strictly better cadence vector at an equally fair, starvation-equivalent, and balance-admissible refill.

## Runtime

Total measured optimizer/oracle time across sessions: 161.5 seconds. Per-run timings are in JSON.


