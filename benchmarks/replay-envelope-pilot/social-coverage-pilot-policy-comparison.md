# Matchmaking policy comparison

Seeds: 1. Wide-profile seeds: none. Each engine used the same P1–P14 roster and seeded external court-completion schedule per seed. The 20/400 counts include completed matches only; first/last windows are the first/last 100 completions of the 400-match run.

Comparison aggregation revision 7ab071ad0102ff8a2012a267d8cfe796a1f325a8; dirty worktree true; runner/harness SHA-256 c7cd0345169d456e2c1e2bbc9ae414c7735ebfb6b6792109c154c8f741039950. Current measured report harness SHA-256 2a257abdeb996a8782662ec4aa66bd7e15fa90d920ab37f579275be5df6d1a93.

Policy provenance is per JSON row (commit, dirty state, and source hashes where available). Entropy-first is the original engine; strict-cadence is the 93262f36 engine; type-entropy-first is the preserved bcf07fb policy; replay-envelope-best-plus-one is the new policy: inside the strongest fairness/starvation class and fixed Balanced envelope, freeze best zero-rest count + 1, then maximize combined entropy, then soft-rest cadence.

| Policy | Profile | Format | VCS20/400 | Partner20/400 | Opponent20/400 | Courtmate20/400 | Rel entropy20/400 | Type entropy20/400 | All entropy20/400 | B2B20/400 | Mean rest20/400 | P95 rest20/400 | Worst max rest20/400 | +1/+2 threshold reaches20/400 | MIXED/OWN_SIDE400 | First100/last100 OWN_SIDE | Fairness spread20/400/max | +1 accepted/certified; +2 rejected decisions/candidates; 5+ linked/total | Starvation changes/overdue (rate; unknown) | 100% seeds | Missing balance/replay/admissible/entropy-soft |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---:|---:|---|---|---|---:|---|
| entropy-first | narrow | Social | 61.9%/100.0% | 41.8%/100.0% | 63.7%/100.0% | 80.2%/100.0% | 76.8%/97.5% | 93.0%/98.7% | 80.9%/97.8% | 30.3%/29.9% | 1.45/1.49 | 4.00/4.00 | 5.00/6.00 | 5.0/163.0; 1.0/17.0 | 227.0/173.0 | 44.0/42.0 | 1.00/1.00/5.00 | n/a (unavailable) | n/a/129 (n/a; 129 unknown) | 1 | 0/0/0/0 |
| entropy-first | narrow | Balanced Points | 61.9%/100.0% | 41.8%/100.0% | 63.7%/100.0% | 80.2%/100.0% | 76.8%/97.5% | 93.0%/98.7% | 80.9%/97.8% | 30.3%/29.9% | 1.45/1.49 | 4.00/4.00 | 5.00/6.00 | 5.0/163.0; 1.0/17.0 | 227.0/173.0 | 44.0/42.0 | 1.00/1.00/5.00 | n/a (unavailable) | n/a/129 (n/a; 129 unknown) | 1 | 0/0/0/0 |
| entropy-first | narrow | Balanced Rating/Elo | 61.9%/100.0% | 41.8%/100.0% | 64.8%/100.0% | 79.1%/100.0% | 76.7%/97.5% | 93.0%/98.6% | 80.8%/97.8% | 33.3%/30.9% | 1.45/1.49 | 4.00/4.00 | 5.00/6.00 | 7.0/183.0; 1.0/21.0 | 227.0/173.0 | 42.0/44.0 | 1.00/1.00/5.00 | n/a (unavailable) | n/a/132 (n/a; 132 unknown) | 1 | 0/0/0/0 |
| strict-cadence | narrow | Social | 50.5%/84.6% | 34.1%/53.8% | 53.8%/100.0% | 63.7%/100.0% | 67.6%/91.3% | 0.0%/0.0% | 50.7%/68.5% | 18.2%/12.4% | 1.48/1.50 | 3.00/3.00 | 3.00/6.00 | 0.0/20.0; 0.0/6.0 | 400.0/0.0 | 0.0/0.0 | 1.00/1.00/5.00 | n/a (unavailable) | 0/12 (0.0%; 0 unknown) | 0 | 0/0/39/0 |
| strict-cadence | narrow | Balanced Points | 49.8%/84.6% | 33.0%/53.8% | 52.7%/100.0% | 63.7%/100.0% | 67.0%/91.4% | 0.0%/0.0% | 50.2%/68.5% | 18.2%/12.4% | 1.48/1.50 | 3.00/3.00 | 3.00/6.00 | 0.0/20.0; 0.0/6.0 | 400.0/0.0 | 0.0/0.0 | 1.00/1.00/5.00 | n/a (unavailable) | 0/12 (0.0%; 0 unknown) | 0 | 0/0/42/0 |
| strict-cadence | narrow | Balanced Rating/Elo | 50.5%/84.6% | 34.1%/53.8% | 53.8%/100.0% | 63.7%/100.0% | 67.6%/91.3% | 0.0%/0.0% | 50.7%/68.5% | 18.2%/12.4% | 1.48/1.50 | 3.00/3.00 | 3.00/6.00 | 0.0/20.0; 0.0/6.0 | 400.0/0.0 | 0.0/0.0 | 1.00/1.00/5.00 | n/a (unavailable) | 0/12 (0.0%; 0 unknown) | 0 | 0/0/40/0 |
| type-entropy-first | narrow | Social | 55.3%/100.0% | 38.5%/100.0% | 59.3%/100.0% | 68.1%/100.0% | 72.3%/96.6% | 99.2%/100.0% | 79.0%/97.4% | 28.8%/25.2% | 1.47/1.49 | 4.00/4.00 | 5.00/6.00 | 5.0/152.0; 1.0/17.0 | 202.0/198.0 | 48.0/47.0 | 1.00/1.00/5.00 | n/a (unavailable) | 26/123 (21.1%; 0 unknown) | 1 | 0/0/0/0 |
| type-entropy-first | narrow | Balanced Points | 55.3%/100.0% | 38.5%/100.0% | 59.3%/100.0% | 68.1%/100.0% | 72.3%/96.6% | 99.2%/100.0% | 79.0%/97.4% | 28.8%/25.2% | 1.47/1.49 | 4.00/4.00 | 5.00/6.00 | 5.0/152.0; 1.0/17.0 | 202.0/198.0 | 48.0/47.0 | 1.00/1.00/5.00 | n/a (unavailable) | 26/123 (21.1%; 0 unknown) | 1 | 0/0/0/0 |
| type-entropy-first | narrow | Balanced Rating/Elo | 55.7%/100.0% | 39.6%/100.0% | 59.3%/100.0% | 68.1%/100.0% | 72.8%/96.6% | 99.2%/100.0% | 79.4%/97.4% | 28.8%/26.6% | 1.47/1.49 | 4.00/4.00 | 5.00/6.00 | 5.0/156.0; 1.0/16.0 | 202.0/198.0 | 48.0/51.0 | 1.00/1.00/5.00 | n/a (unavailable) | 33/120 (27.5%; 0 unknown) | 1 | 0/0/0/0 |
| replay-envelope-best-plus-one | narrow | Social | 61.2%/100.0% | 40.7%/100.0% | 63.7%/100.0% | 79.1%/100.0% | 76.0%/97.5% | 88.0%/98.7% | 79.0%/97.8% | 28.8%/24.3% | 1.45/1.49 | 3.00/4.00 | 4.00/6.00 | 4.0/137.0; 0.0/11.0 | 226.0/174.0 | 40.0/42.0 | 1.00/1.00/5.00 | 151/399 (37.8%); 71/417; 1/11 | 25/105 (23.8%; 0 unknown) | 1 | 0/0/0/0 |
| replay-envelope-best-plus-one | narrow | Balanced Points | 61.2%/100.0% | 40.7%/100.0% | 63.7%/100.0% | 79.1%/100.0% | 76.0%/97.5% | 88.0%/98.6% | 79.0%/97.8% | 28.8%/24.6% | 1.45/1.49 | 3.00/4.00 | 4.00/6.00 | 4.0/142.0; 0.0/15.0 | 227.0/173.0 | 40.0/41.0 | 1.00/1.00/5.00 | 152/399 (38.1%); 64/444; 2/15 | 22/111 (19.8%; 0 unknown) | 1 | 0/0/0/0 |
| replay-envelope-best-plus-one | narrow | Balanced Rating/Elo | 60.1%/100.0% | 41.8%/100.0% | 62.6%/100.0% | 75.8%/100.0% | 75.8%/97.5% | 88.6%/98.6% | 79.0%/97.8% | 30.3%/24.8% | 1.45/1.49 | 3.00/4.00 | 4.00/6.00 | 4.0/145.0; 0.0/15.0 | 227.0/173.0 | 42.0/43.0 | 1.00/1.00/5.00 | 157/399 (39.3%); 56/356; 1/15 | 23/115 (20.0%; 0 unknown) | 1 | 0/0/0/0 |

Replay-envelope +1 and +2 metrics apply only to the new policy and use certified one-court refills; the opening two-court decision is excluded. A +2 rejection counts a refill when a candidate in the same strongest class and fixed Balanced envelope exceeds the frozen replay allowance and strictly beats the selected combined entropy. Historical artifacts without the counter show n/a. Starvation rates are unknown if any overdue counterfactual was uncertified.

## Replay-envelope measurements (new policy)

A linked ≥5-rest episode means the rest period followed an assignment involving a rest-zero player from a certified decision that used the +1 allowance. This is decision-level attribution and does not identify a uniquely marginal player.

| Profile | Format | Refill / replay certified / full certified | Replay uncertified | +1 selected / rate | +2 higher-entropy rejected decisions / candidates | ≥5-rest total / linked +1 / linked other rest-zero / no replay link | No-starvation replay certified / uncertified |
|---|---|---:|---:|---:|---:|---:|---:|
| narrow | Social | 399 / 399 / 399 | 0 | 151 / 37.8% | 71 / 417 | 11 / 1 / 1 / 9 | 399 / 0 |
| narrow | Balanced Points | 399 / 399 / 399 | 0 | 152 / 38.1% | 64 / 444 | 15 / 2 / 2 / 11 | 399 / 0 |
| narrow | Balanced Rating/Elo | 399 / 399 / 399 | 0 | 157 / 39.3% | 56 / 356 | 15 / 1 / 3 / 11 | 399 / 0 |

## Wide-profile unseen structurally feasible relationships

Exact names below come from each report’s unchanged structural opportunity denominator. `Replay allowance` means the relationship appeared in the strongest-class, balance-envelope opportunity set but not inside the frozen best-plus-one replay allowance; `admissible but unchosen` uses the policy frontier recorded for that run. Legacy reports retain their original missing-reason labels; the current replay-envelope oracle is not applied retroactively. The JSON retains directed player/facet opportunity counts and every per-seed record.

| Policy | Format | Seed | Balance-envelope excluded | Replay allowance excluded | Admissible but unchosen | Combined entropy / relationship entropy / soft cadence exclusions |
|---|---|---:|---|---|---|---|
