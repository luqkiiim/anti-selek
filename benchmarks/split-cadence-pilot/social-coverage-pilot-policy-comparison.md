# Matchmaking policy pilot comparison

Seeds: 1. Wide-profile seeds: none. Each engine used the same P1–P14 roster and seeded external court-completion schedule per seed. The 20/400 counts include completed matches only; first/last windows are the first/last 100 completions of the 400-match run.

Policy provenance is per JSON row (commit, dirty state, and source hashes where available). Entropy-first is the original engine; strict-cadence is the 93262f36 engine; split-cadence is the current zero-rest → entropy → soft-rest policy.

| Policy | Profile | Format | OWN_SIDE at 20 / 400 | First 100 / last 100 OWN_SIDE | VCS at 20 / 400 | Relationship / type entropy at 400 | B2B rate | Max assignment rest | Fairness spread at 400 / max | ≥5 rest episodes / linked replay origins with fewer-zero alternative | Starvation changes / overdue decisions |
|---|---|---|---:|---:|---:|---|---:|---:|---:|---|---|
| entropy-first | narrow | Social | 8.0 / 173.0 | 44.0 / 42.0 | 61.9% / 100.0% | 97.5% / 98.7% | 29.9% | 6.00 | 1.00 / 5.00 | 17 / 1 of 5 | 0 / 129 (unknown 129) |
| entropy-first | narrow | Balanced Points | 8.0 / 173.0 | 44.0 / 42.0 | 61.9% / 100.0% | 97.5% / 98.7% | 29.9% | 6.00 | 1.00 / 5.00 | 17 / 1 of 5 | 0 / 129 (unknown 129) |
| entropy-first | narrow | Balanced Rating/Elo | 8.0 / 173.0 | 42.0 / 44.0 | 61.9% / 100.0% | 97.5% / 98.6% | 30.9% | 6.00 | 1.00 / 5.00 | 21 / 5 of 7 | 0 / 132 (unknown 132) |
| strict-cadence | narrow | Social | 0.0 / 0.0 | 0.0 / 0.0 | 50.5% / 84.6% | 91.3% / 0.0% | 12.4% | 6.00 | 1.00 / 5.00 | 6 / 0 of 0 | 0 / 12 (unknown 0) |
| strict-cadence | narrow | Balanced Points | 0.0 / 0.0 | 0.0 / 0.0 | 49.8% / 84.6% | 91.4% / 0.0% | 12.4% | 6.00 | 1.00 / 5.00 | 6 / 0 of 0 | 0 / 12 (unknown 0) |
| strict-cadence | narrow | Balanced Rating/Elo | 0.0 / 0.0 | 0.0 / 0.0 | 50.5% / 84.6% | 91.3% / 0.0% | 12.4% | 6.00 | 1.00 / 5.00 | 6 / 0 of 0 | 0 / 12 (unknown 0) |
| split-cadence | narrow | Social | 0.0 / 0.0 | 0.0 / 0.0 | 58.2% / 84.6% | 91.4% / 0.0% | 12.4% | 6.00 | 1.00 / 5.00 | 7 / 0 of 0 | 4 / 44 (unknown 0) |
| split-cadence | narrow | Balanced Points | 0.0 / 0.0 | 0.0 / 0.0 | 57.9% / 84.6% | 91.4% / 0.0% | 12.4% | 6.00 | 1.00 / 5.00 | 6 / 0 of 0 | 7 / 52 (unknown 0) |
| split-cadence | narrow | Balanced Rating/Elo | 0.0 / 0.0 | 0.0 / 0.0 | 58.2% / 84.6% | 91.4% / 0.0% | 12.4% | 6.00 | 1.00 / 5.00 | 8 / 0 of 0 | 5 / 45 (unknown 0) |

`n/a` means the source artifact predates completed-match type-count instrumentation; no counts have been inferred from player-level coverage. For split-cadence, the oracle's zero-rest frontier means minimum rest-zero selections only; equal-zero alternatives may still lose on entropy, which the current long-wait trace does not independently score.
