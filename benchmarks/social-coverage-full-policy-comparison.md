# Matchmaking policy pilot comparison

Seeds: 1, 4729, 104729, 130363, 2097593. Wide-profile seeds: 30011, 65537, 999983. Each engine used the same P1–P14 roster and seeded external court-completion schedule per seed. The 20/400 counts include completed matches only; first/last windows are the first/last 100 completions of the 400-match run.

Policy provenance is per JSON row (commit, dirty state, and source hashes where available). Entropy-first is the original engine; strict-cadence is the 93262f36 engine; type-entropy-first is the current policy: in MIXED, match-type entropy → zero-rest count → relationship entropy → soft rest; other modes start with zero-rest count.

| Policy | Profile | Format | OWN_SIDE at 20 / 400 | First 100 / last 100 OWN_SIDE | VCS at 20 / 400 | Relationship / type entropy at 400 | B2B rate | Worst / mean of per-seed max rest | Fairness spread at 400 / max | ≥5 rest episodes / linked replay origins with fewer-zero alternative | Starvation changes / overdue decisions | Type-priority overrides / certified refills | Mean type / relationship gain per refill |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---|---|---:|---:|
| entropy-first | narrow | Social | 7.4 / 173.4 | 43.2 / 43.2 | 63.3% / 100.0% | 97.4% / 98.7% | 29.5% | 7.00 / 5.80 | 1.00 / 4.60 | 88 / 16 of 32 | 0 / 646 (unknown 646) | 0/0 (n/a) | n/a / n/a |
| entropy-first | narrow | Balanced Points | 7.4 / 174.0 | 43.2 / 44.2 | 63.3% / 100.0% | 97.4% / 98.7% | 29.7% | 7.00 / 5.80 | 1.00 / 4.60 | 82 / 16 of 30 | 0 / 643 (unknown 643) | 0/0 (n/a) | n/a / n/a |
| entropy-first | narrow | Balanced Rating/Elo | 7.4 / 173.8 | 42.6 / 44.4 | 63.5% / 100.0% | 97.4% / 98.7% | 29.8% | 7.00 / 5.80 | 1.00 / 4.60 | 88 / 22 of 33 | 0 / 644 (unknown 644) | 0/0 (n/a) | n/a / n/a |
| entropy-first | wide | Balanced Points | 8.7 / 171.7 | 39.7 / 42.3 | 61.3% / 98.5% | 96.0% / 98.5% | 30.3% | 8.00 / 6.67 | 1.33 / 5.00 | 49 / 11 of 18 | 0 / 390 (unknown 390) | 0/0 (n/a) | n/a / n/a |
| entropy-first | wide | Balanced Rating/Elo | 8.7 / 169.7 | 40.7 / 43.3 | 58.9% / 95.6% | 94.4% / 98.2% | 30.5% | 6.00 / 5.67 | 1.33 / 5.00 | 52 / 12 of 16 | 0 / 382 (unknown 382) | 0/0 (n/a) | n/a / n/a |
| strict-cadence | narrow | Social | 0.4 / 0.4 | 0.4 / 0.0 | 56.3% / 84.9% | 91.4% / 0.8% | 12.6% | 6.00 / 5.40 | 1.00 / 4.60 | 26 / 0 of 0 | 0 / 80 (unknown 0) | 0/0 (n/a) | n/a / n/a |
| strict-cadence | narrow | Balanced Points | 0.4 / 0.4 | 0.4 / 0.0 | 56.0% / 84.9% | 91.4% / 0.8% | 12.6% | 6.00 / 5.40 | 1.00 / 4.60 | 26 / 0 of 0 | 0 / 80 (unknown 0) | 0/0 (n/a) | n/a / n/a |
| strict-cadence | narrow | Balanced Rating/Elo | 0.0 / 0.0 | 0.0 / 0.0 | 56.6% / 84.6% | 91.3% / 0.0% | 12.6% | 6.00 / 5.40 | 1.00 / 4.60 | 26 / 0 of 0 | 0 / 80 (unknown 0) | 0/0 (n/a) | n/a / n/a |
| strict-cadence | wide | Balanced Points | 1.3 / 1.3 | 1.3 / 0.0 | 58.5% / 85.6% | 90.2% / 2.8% | 13.5% | 6.00 / 5.00 | 1.33 / 5.00 | 8 / 0 of 0 | 0 / 50 (unknown 0) | 0/0 (n/a) | n/a / n/a |
| strict-cadence | wide | Balanced Rating/Elo | 1.3 / 1.3 | 1.3 / 0.0 | 54.1% / 84.1% | 88.7% / 2.8% | 14.0% | 6.00 / 5.00 | 1.33 / 5.00 | 11 / 0 of 0 | 4 / 71 (unknown 0) | 0/0 (n/a) | n/a / n/a |
| type-entropy-first | narrow | Social | 9.2 / 199.2 | 47.4 / 50.2 | 58.2% / 100.0% | 96.4% / 100.0% | 26.3% | 7.00 / 5.80 | 1.00 / 4.60 | 76 / 9 of 18 | 160 / 578 (unknown 0) | 577/1995 (28.9%) | 0.035080 / 0.087427 |
| type-entropy-first | narrow | Balanced Points | 9.2 / 199.2 | 47.4 / 50.2 | 58.2% / 100.0% | 96.4% / 100.0% | 26.3% | 7.00 / 6.00 | 1.00 / 4.60 | 76 / 9 of 18 | 160 / 575 (unknown 0) | 578/1995 (29.0%) | 0.035080 / 0.087437 |
| type-entropy-first | narrow | Balanced Rating/Elo | 9.2 / 199.2 | 47.4 / 51.0 | 58.4% / 100.0% | 96.4% / 100.0% | 26.6% | 7.00 / 6.00 | 1.00 / 4.60 | 75 / 7 of 17 | 168 / 572 (unknown 0) | 589/1995 (29.5%) | 0.035080 / 0.087413 |
| type-entropy-first | wide | Balanced Points | 8.7 / 197.7 | 48.0 / 49.7 | 58.7% / 98.5% | 94.5% / 100.0% | 26.9% | 8.00 / 7.00 | 1.33 / 5.00 | 53 / 10 of 16 | 95 / 371 (unknown 0) | 342/1197 (28.6%) | 0.035077 / 0.085450 |
| type-entropy-first | wide | Balanced Rating/Elo | 8.7 / 198.7 | 47.3 / 51.0 | 55.3% / 95.6% | 92.4% / 100.0% | 28.1% | 8.00 / 6.67 | 1.33 / 5.00 | 56 / 10 of 20 | 94 / 361 (unknown 0) | 350/1197 (29.2%) | 0.035079 / 0.083192 |

`n/a` means the source artifact predates completed-match type-count and type-override instrumentation; no counts have been inferred from player-level coverage. The override denominator is certified one-court refills only; the opening two-court optimizer decision is excluded. The override witness proves that the selected candidate has higher effective match-type gain but more zero-rest assignments than a legal candidate in the same fairness/starvation/balance class.
