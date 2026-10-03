# Matchmaking policy pilot comparison

Seeds: 1. Wide-profile seeds: none. Each engine used the same P1–P14 roster and seeded external court-completion schedule per seed. The 20/400 counts include completed matches only; first/last windows are the first/last 100 completions of the 400-match run.

Policy provenance is per JSON row (commit, dirty state, and source hashes where available). Entropy-first is the original engine; strict-cadence is the 93262f36 engine; type-entropy-first is the current policy: in MIXED, match-type entropy → zero-rest count → relationship entropy → soft rest; other modes start with zero-rest count.

| Policy | Profile | Format | OWN_SIDE at 20 / 400 | First 100 / last 100 OWN_SIDE | VCS at 20 / 400 | Relationship / type entropy at 400 | B2B rate | Worst / mean of per-seed max rest | Fairness spread at 400 / max | ≥5 rest episodes / linked replay origins with fewer-zero alternative | Starvation changes / overdue decisions | Type-priority overrides / certified refills | Mean type / relationship gain per refill |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---|---|---:|---:|
| entropy-first | narrow | Social | 8.0 / 173.0 | 44.0 / 42.0 | 61.9% / 100.0% | 97.5% / 98.7% | 29.9% | 6.00 / 6.00 | 1.00 / 5.00 | 17 / 1 of 5 | 0 / 129 (unknown 129) | 0/0 (n/a) | n/a / n/a |
| entropy-first | narrow | Balanced Points | 8.0 / 173.0 | 44.0 / 42.0 | 61.9% / 100.0% | 97.5% / 98.7% | 29.9% | 6.00 / 6.00 | 1.00 / 5.00 | 17 / 1 of 5 | 0 / 129 (unknown 129) | 0/0 (n/a) | n/a / n/a |
| entropy-first | narrow | Balanced Rating/Elo | 8.0 / 173.0 | 42.0 / 44.0 | 61.9% / 100.0% | 97.5% / 98.6% | 30.9% | 6.00 / 6.00 | 1.00 / 5.00 | 21 / 5 of 7 | 0 / 132 (unknown 132) | 0/0 (n/a) | n/a / n/a |
| strict-cadence | narrow | Social | 0.0 / 0.0 | 0.0 / 0.0 | 50.5% / 84.6% | 91.3% / 0.0% | 12.4% | 6.00 / 6.00 | 1.00 / 5.00 | 6 / 0 of 0 | 0 / 12 (unknown 0) | 0/0 (n/a) | n/a / n/a |
| strict-cadence | narrow | Balanced Points | 0.0 / 0.0 | 0.0 / 0.0 | 49.8% / 84.6% | 91.4% / 0.0% | 12.4% | 6.00 / 6.00 | 1.00 / 5.00 | 6 / 0 of 0 | 0 / 12 (unknown 0) | 0/0 (n/a) | n/a / n/a |
| strict-cadence | narrow | Balanced Rating/Elo | 0.0 / 0.0 | 0.0 / 0.0 | 50.5% / 84.6% | 91.3% / 0.0% | 12.4% | 6.00 / 6.00 | 1.00 / 5.00 | 6 / 0 of 0 | 0 / 12 (unknown 0) | 0/0 (n/a) | n/a / n/a |
| type-entropy-first | narrow | Social | 10.0 / 198.0 | 48.0 / 47.0 | 55.3% / 100.0% | 96.6% / 100.0% | 25.2% | 6.00 / 6.00 | 1.00 / 5.00 | 17 / 3 of 4 | 26 / 123 (unknown 0) | 118/399 (29.6%) | 0.035078 / 0.087654 |
| type-entropy-first | narrow | Balanced Points | 10.0 / 198.0 | 48.0 / 47.0 | 55.3% / 100.0% | 96.6% / 100.0% | 25.2% | 6.00 / 6.00 | 1.00 / 5.00 | 17 / 3 of 4 | 26 / 123 (unknown 0) | 118/399 (29.6%) | 0.035078 / 0.087654 |
| type-entropy-first | narrow | Balanced Rating/Elo | 10.0 / 198.0 | 48.0 / 51.0 | 55.7% / 100.0% | 96.6% / 100.0% | 26.6% | 6.00 / 6.00 | 1.00 / 5.00 | 16 / 2 of 4 | 33 / 120 (unknown 0) | 127/399 (31.8%) | 0.035078 / 0.087660 |

`n/a` means the source artifact predates completed-match type-count and type-override instrumentation; no counts have been inferred from player-level coverage. The override denominator is certified one-court refills only; the opening two-court optimizer decision is excluded. The override witness proves that the selected candidate has higher effective match-type gain but more zero-rest assignments than a legal candidate in the same fairness/starvation/balance class.
