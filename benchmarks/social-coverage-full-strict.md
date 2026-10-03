# Matchmaking cadence and relationship coverage benchmark

Generated 2026-10-03T13:20:44.424Z; source commit 93262f36336b9533ba96b4e4bec5d7e8061eef6e; policy strict-cadence; dirty worktree true. Primary seeds: 5; wide-profile Balanced seeds: 3.
Worktree note: Only benchmark measurement files are copied into the strict-policy worktree; production engine files remain at the recorded strict commit.
Tracked source changes from commit: core engine clean; shared variety clean; measurement harness scripts/run-matchmaking-benchmark.mjs, src/lib/matchmaking/v3/socialCoverageBenchmark.test.ts, src/lib/matchmaking/v3/socialCoverageBenchmark.ts. Generated untracked artifacts can make the overall worktree dirty without changing these tracked source statuses.
Engine source SHA-256 5dd33ca48c7a7731883081792360f0a04e439b3ddd704f135ed3a63ed1bf2f36; measurement harness SHA-256 27e22fd7eb48ca8e2d96638583de3c75aa7f064e5c3e3aea136667d44a0599b0.

The roster uses the same P1–P14 identities, gender/preference assignments, latent skill ranks, and independent event-level court-completion schedule for every format at a given seed. The narrow profile maps the same rank vector to Points/Social strengths at 0.1 per rank and Rating strengths at 4 per rank; the wide profile maps it at 1 and 40 respectively. `pointDiff` stays 0 because this benchmark has no match scores. Each run has two active courts; one randomly scheduled court completes per event and is refilled. Coverage counts only completed matches. Rest turns count completed-match events while a player is available; active players do not accrue rest. The +1/+2 threshold counters include available idle events before a player's first match; assignment-rest gaps and back-to-back rates exclude first assignments.

Relationship coverage is the mean of each player’s feasible courtmate, partner, and opponent coverage ratios, excluding only empty opportunity facets. It is distinct from normalized Shannon entropy. Match-type coverage is reported separately. Percentages below are seed-level session averages and then mean/median/min/max across seeds.

## Primary narrow-skill profile

| Format | Completed | Relationship coverage (mean; median; min–max) | Partner / opponent / courtmate | MIXED / OWN_SIDE | Normalized entropy | Back-to-back rate | Max assignment rest gap (mean of per-seed maxima) | Mean / p95 assignment rest | +1 / +2 threshold reaches | Starvation changes / overdue (certified, unknown; rates) | Checkpoint / max fairness spread |
|---|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---:|
| Social | 20 | 56.3%; 57.9%; 50.5%–59.0% | 37.1% / 58.9% / 73.0% | 100.0% / 11.4% | 55.8% | n/a → 11.8% | 3.00; 3.00; 2.00–4.00 | 1.48; 1.48; 1.48–1.48 / 3.00; 3.00; 2.00–4.00 | 0.8 / 0.0 | 0.0 changes (2 overdue; 2 certified, 0 unknown; overdue 0.0%, certified-only 0.0%) | 1.00; 1.00; 1.00–1.00 / 2.40; 2.00; 2.00–3.00 |
| Social | 400 | 84.9%; 84.6%; 84.6%–86.1% | 54.7% / 100.0% / 100.0% | 100.0% / 11.4% | 68.7% | n/a → 12.6% | 5.40; 6.00; 4.00–6.00 | 1.50; 1.50; 1.50–1.50 / 3.00; 3.00; 3.00–3.00 | 28.4 / 5.2 | 0.0 changes (80 overdue; 80 certified, 0 unknown; overdue 0.0%, certified-only 0.0%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Points | 20 | 56.0%; 56.4%; 49.8%–59.0% | 37.6% / 58.0% / 72.3% | 100.0% / 11.4% | 55.8% | n/a → 11.8% | 3.00; 3.00; 2.00–4.00 | 1.48; 1.48; 1.48–1.48 / 3.00; 3.00; 2.00–4.00 | 0.8 / 0.0 | 0.0 changes (2 overdue; 2 certified, 0 unknown; overdue 0.0%, certified-only 0.0%) | 1.00; 1.00; 1.00–1.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Points | 400 | 84.9%; 84.6%; 84.6%–86.1% | 54.7% / 100.0% / 100.0% | 100.0% / 11.4% | 68.7% | n/a → 12.6% | 5.40; 6.00; 4.00–6.00 | 1.50; 1.50; 1.50–1.50 / 3.00; 3.00; 3.00–3.00 | 28.4 / 5.2 | 0.0 changes (80 overdue; 80 certified, 0 unknown; overdue 0.0%, certified-only 0.0%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |
| Balanced Rating/Elo | 20 | 56.6%; 58.6%; 50.5%–59.0% | 37.4% / 59.8% / 72.7% | 100.0% / 0.0% | 54.3% | n/a → 11.5% | 3.00; 3.00; 2.00–4.00 | 1.48; 1.48; 1.48–1.48 / 3.00; 3.00; 2.00–4.00 | 0.8 / 0.0 | 0.0 changes (2 overdue; 2 certified, 0 unknown; overdue 0.0%, certified-only 0.0%) | 1.00; 1.00; 1.00–1.00 / 2.40; 2.00; 2.00–3.00 |
| Balanced Rating/Elo | 400 | 84.6%; 84.6%; 84.6%–84.6% | 53.8% / 100.0% / 100.0% | 100.0% / 0.0% | 68.5% | n/a → 12.6% | 5.40; 6.00; 4.00–6.00 | 1.50; 1.50; 1.50–1.50 / 3.00; 3.00; 3.00–3.00 | 28.4 / 5.2 | 0.0 changes (80 overdue; 80 certified, 0 unknown; overdue 0.0%, certified-only 0.0%) | 1.00; 1.00; 1.00–1.00 / 4.60; 5.00; 3.00–6.00 |

The table reports after-change coverage/entropy and before→after back-to-back rate and maximum assignment rest gap when a baseline report is supplied. Assignment rest is the completed-match rest-turn count sampled when players are selected; elapsed completion-event gaps are retained as a separate diagnostic and can include time spent in a match. `Starvation changed set` gives mean counterfactual set changes and the rate conditional on an overdue player being available. The fairness columns are checkpoint spread and maximum spread seen over the run. Exact per-seed values and missing relationship lists are in the adjacent JSON.

Decision cohorts: coverage, rest, and match-type checkpoints use completed matches only. Starvation's completed-decision count increments when every assignment in that optimizer decision has completed. Refill/type-override counts at checkpoint N include decisions assigned after completion events 1 through N−1; the latest refill can still be active. The opening two-court decision is excluded from type-override counts.
## Match-type priority overrides

Each override is one certified one-court refill where the chosen set has more immediate replays but higher match-type entropy gain than a legal candidate in the same strongest fairness/starvation class and Balanced envelope. The denominator is certified one-court refills; the opening two-court decision is excluded. Relationship gain is courtmates + partners + opponents, scored independently from match-type gain.

| Format | Overrides / certified refills | Rate | Mean selected match-type gain | Mean selected relationship gain |
|---|---:|---:|---:|---:|
| Social | 0 / 0 | n/a | n/a | n/a |
| Balanced Points | 0 / 0 | n/a | n/a | n/a |
| Balanced Rating/Elo | 0 / 0 | n/a | n/a | n/a |

## Completed match-type counts by session window

These are actual completed matches, not player-level match-type coverage. Early and late refer to the first and last 100 completed matches of each 400-match run.

| Format | At 20 completed: MIXED / OWN_SIDE | At 400 completed: MIXED / OWN_SIDE | First 100 OWN_SIDE | Last 100 OWN_SIDE |
|---|---:|---:|---:|---:|
| Social | 19.6 / 0.4 | 399.6 / 0.4 | 0.4 | 0.0 |
| Balanced Points | 19.6 / 0.4 | 399.6 / 0.4 | 0.4 | 0.0 |
| Balanced Rating/Elo | 20.0 / 0.0 | 400.0 / 0.0 | 0.0 | 0.0 |

## Wide-skill guardrail sensitivity

| Format | Completed | Relationship coverage | Partner / opponent / courtmate | Normalized entropy | Back-to-back rate | Max assignment rest gap | Starvation changes / certified / unknown (rate) | Checkpoint / max fairness spread |
|---|---:|---:|---|---:|---:|---:|---:|---:|
| Balanced Points | 20 | 58.5% | 35.2% / 61.5% / 78.8% | 60.8% | 10.1% | 3.00 | 0.00 / 0 / 0 (n/a) | 1.00 / 2.33 |
| Balanced Points | 400 | 85.6% | 56.8% / 100.0% / 100.0% | 68.4% | 13.5% | 5.00 | 0.00 / 50 / 0 (0.0%) | 1.33 / 5.00 |
| Balanced Rating/Elo | 20 | 54.1% | 31.1% / 58.6% / 72.5% | 58.5% | 10.6% | 3.00 | 0.00 / 0 / 0 (n/a) | 1.00 / 2.33 |
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

The unseen relationship classification is finite-session evidence across successive opportunity layers: balance envelope, match-type entropy frontier, zero-rest frontier, relationship entropy frontier, and soft cadence frontier. The static balance-feasibility audit is reported separately and can show whether a relationship is structurally feasible while still outside a specific balance envelope. Finite simulation alone does not prove permanent exclusion.

## Long waits

There were 97 completed assignment gaps of at least five available completed-match rest turns in these runs. Deferred-refill classes: fairness_or_mixed_legality: 87; cadence_tie_later_tiebreak: 10. 0 had a linked immediately preceding rest-zero replay. Strict-cadence witnesses show 0 strictly better-vector inclusion opportunities, 10 equal-vector inclusion alternatives, and 0 worse-vector inclusion opportunities. JSON stores selected and candidate IDs/rest vectors; an equal vector may still lose on entropy.

## Runtime

Total measured optimizer/oracle time across sessions: 221.5 seconds. Per-run timings are in JSON.

