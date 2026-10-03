# Matchmaking cadence and relationship coverage benchmark

Generated 2026-10-03T12:05:09.668Z; source commit 93262f36336b9533ba96b4e4bec5d7e8061eef6e; policy type-entropy-first; dirty worktree true. Primary seeds: 1; wide-profile Balanced seeds: 0.
Worktree note: Current checkout includes the Mixed type-entropy-first engine and benchmark instrumentation; hashes identify the exact sources used.
Engine source SHA-256 291da1b22ca83cfa515017424738dc1543b14c7169bd04957e96ac09e0b7d198; measurement harness SHA-256 86ce563cddee288b5a68ab59d4e24268e0bc026ab499f1a91f72832b0beb8368.

The roster uses the same P1–P14 identities, gender/preference assignments, latent skill ranks, and independent event-level court-completion schedule for every format at a given seed. The narrow profile maps the same rank vector to Points/Social strengths at 0.1 per rank and Rating strengths at 4 per rank; the wide profile maps it at 1 and 40 respectively. `pointDiff` stays 0 because this benchmark has no match scores. Each run has two active courts; one randomly scheduled court completes per event and is refilled. Coverage counts only completed matches. Rest turns count completed-match events while a player is available; active players do not accrue rest. The +1/+2 threshold counters include available idle events before a player's first match; assignment-rest gaps and back-to-back rates exclude first assignments.

Relationship coverage is the mean of each player’s feasible courtmate, partner, and opponent coverage ratios, excluding only empty opportunity facets. It is distinct from normalized Shannon entropy. Match-type coverage is reported separately. Percentages below are seed-level session averages and then mean/median/min/max across seeds.

## Primary narrow-skill profile

| Format | Completed | Relationship coverage (mean; median; min–max) | Partner / opponent / courtmate | MIXED / OWN_SIDE | Normalized entropy | Back-to-back rate | Max assignment rest gap (mean of per-seed maxima) | Mean / p95 assignment rest | +1 / +2 threshold reaches | Starvation changed set | Checkpoint / max fairness spread |
|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| Social (before → after) | 20 | 55.3%; 55.3%; 55.3%–55.3% | 38.5% / 59.3% / 68.1% | 100.0% / 100.0% | 79.0% | 30.3% → 28.8% | 4.40; 4.00; 4.00–5.00 → 5.00; 5.00; 5.00–5.00 | 1.47; 1.47; 1.47–1.47 / 4.00; 4.00; 4.00–4.00 | 5.0 / 1.0 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 2.00; 2.00; 2.00–2.00 |
| Social (before → after) | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.4% | 29.5% → 25.2% | 5.80; 6.00; 5.00–7.00 → 6.00; 6.00; 6.00–6.00 | 1.49; 1.49; 1.49–1.49 / 4.00; 4.00; 4.00–4.00 | 152.0 / 17.0 | 26.0 (21.1%) | 1.00; 1.00; 1.00–1.00 / 5.00; 5.00; 5.00–5.00 |
| Balanced Points (before → after) | 20 | 55.3%; 55.3%; 55.3%–55.3% | 38.5% / 59.3% / 68.1% | 100.0% / 100.0% | 79.0% | 30.3% → 28.8% | 4.40; 4.00; 4.00–5.00 → 5.00; 5.00; 5.00–5.00 | 1.47; 1.47; 1.47–1.47 / 4.00; 4.00; 4.00–4.00 | 5.0 / 1.0 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 2.00; 2.00; 2.00–2.00 |
| Balanced Points (before → after) | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.4% | 29.7% → 25.2% | 5.80; 6.00; 5.00–7.00 → 6.00; 6.00; 6.00–6.00 | 1.49; 1.49; 1.49–1.49 / 4.00; 4.00; 4.00–4.00 | 152.0 / 17.0 | 26.0 (21.1%) | 1.00; 1.00; 1.00–1.00 / 5.00; 5.00; 5.00–5.00 |
| Balanced Rating/Elo (before → after) | 20 | 55.7%; 55.7%; 55.7%–55.7% | 39.6% / 59.3% / 68.1% | 100.0% / 100.0% | 79.4% | 30.9% → 28.8% | 4.40; 4.00; 4.00–5.00 → 5.00; 5.00; 5.00–5.00 | 1.47; 1.47; 1.47–1.47 / 4.00; 4.00; 4.00–4.00 | 5.0 / 1.0 | 0.0 (0.0%) | 1.00; 1.00; 1.00–1.00 / 2.00; 2.00; 2.00–2.00 |
| Balanced Rating/Elo (before → after) | 400 | 100.0%; 100.0%; 100.0%–100.0% | 100.0% / 100.0% / 100.0% | 100.0% / 100.0% | 97.4% | 29.8% → 26.6% | 5.80; 6.00; 5.00–7.00 → 6.00; 6.00; 6.00–6.00 | 1.49; 1.49; 1.49–1.49 / 4.00; 4.00; 4.00–4.00 | 156.0 / 16.0 | 33.0 (27.5%) | 1.00; 1.00; 1.00–1.00 / 5.00; 5.00; 5.00–5.00 |

The table reports after-change coverage/entropy and before→after back-to-back rate and maximum assignment rest gap when a baseline report is supplied. Assignment rest is the completed-match rest-turn count sampled when players are selected; elapsed completion-event gaps are retained as a separate diagnostic and can include time spent in a match. `Starvation changed set` gives mean counterfactual set changes and the rate conditional on an overdue player being available. The fairness columns are checkpoint spread and maximum spread seen over the run. Exact per-seed values and missing relationship lists are in the adjacent JSON.

## Match-type priority overrides

Each override is one certified one-court refill where the chosen set has more immediate replays but higher match-type entropy gain than a legal candidate in the same strongest fairness/starvation class and Balanced envelope. The denominator is certified one-court refills; the opening two-court decision is excluded. Relationship gain is courtmates + partners + opponents, scored independently from match-type gain.

| Format | Overrides / certified refills | Rate | Mean selected match-type gain | Mean selected relationship gain |
|---|---:|---:|---:|---:|
| Social | 118 / 399 | 29.6% | 0.035078 | 0.087654 |
| Balanced Points | 118 / 399 | 29.6% | 0.035078 | 0.087654 |
| Balanced Rating/Elo | 127 / 399 | 31.8% | 0.035078 | 0.087660 |

## Completed match-type counts by session window

These are actual completed matches, not player-level match-type coverage. Early and late refer to the first and last 100 completed matches of each 400-match run.

| Format | At 20 completed: MIXED / OWN_SIDE | At 400 completed: MIXED / OWN_SIDE | First 100 OWN_SIDE | Last 100 OWN_SIDE |
|---|---:|---:|---:|---:|
| Social | 10.0 / 10.0 | 202.0 / 198.0 | 48.0 | 47.0 |
| Balanced Points | 10.0 / 10.0 | 202.0 / 198.0 | 48.0 | 47.0 |
| Balanced Rating/Elo | 10.0 / 10.0 | 202.0 / 198.0 | 48.0 | 51.0 |

## 400-match relationship completion

| Format | Seeds reaching 100% | Remaining structurally feasible relationships | Guardrail interpretation |
|---|---:|---|---|
| Social | 1/1 | 0 total facet-pairs across seeds | No balance guardrail. |
| Balanced Points | 1/1 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |
| Balanced Rating/Elo | 1/1 | 0 total facet-pairs across seeds | 0 unseen facet-pairs were in a strongest rotation class but outside every observed balance envelope. |

The unseen relationship classification is finite-session evidence across successive opportunity layers: balance envelope, match-type entropy frontier, zero-rest frontier, relationship entropy frontier, and soft cadence frontier. The static balance-feasibility audit is reported separately and can show whether a relationship is structurally feasible while still outside a specific balance envelope. Finite simulation alone does not prove permanent exclusion.

## Long waits

There were 50 completed assignment gaps of at least five available completed-match rest turns in these runs. Deferred-refill classes: fairness_or_mixed_legality: 46; match_type_entropy_priority_exclusion: 3; relationship_entropy_priority_exclusion: 1. 12 had a linked immediately preceding rest-zero replay; 8 linked replay origins had a lower-zero alternative with lower match-type gain, so the chosen replay was an observed type-priority tradeoff. 0 long-wait episodes had no candidate in the minimum-zero frontier after the best type gain. Each wait record stores the type, zero-rest, relationship, and soft-rest frontier evidence and candidate gains.

## Runtime

Total measured optimizer/oracle time across sessions: 54.6 seconds. Per-run timings are in JSON.

