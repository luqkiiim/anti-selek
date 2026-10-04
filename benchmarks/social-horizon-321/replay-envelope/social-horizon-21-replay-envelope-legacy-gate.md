# Social Horizon 321 benchmark

Engine policy: `replay-envelope`. Measurement source: `7ab071ad0102ff8a2012a267d8cfe796a1f325a8`. Matcher coverage gain metric: `legacy-equal`.
Target: exactly 21 completed matches. Seeds: 1, 4729, 104729, 130363, 2097593. The score uses completed layouts only, caps courtmates/opponents/partners at 13/12/6 feasible opportunities, and weights the active facets 3:2:1 per player.

The relationship denominator remains the structural MIXICANO opportunity set. Empty facets are excluded and the remaining weights are renormalized. Match type is not part of this score.

| Format | Horizon score at 21 | Courtmates | Opponents | Partners | Mean distinct C/O/P |
|---|---:|---:|---:|---:|---|
| SOCIAL_MIX | 79.85% | 80.66% | 70.95% | 95.24% | 10.49 / 8.51 / 5.74 |
| POINTS | 79.85% | 80.66% | 70.95% | 95.24% | 10.49 / 8.51 / 5.74 |
| ELO | 79.97% | 80.66% | 71.19% | 95.48% | 10.49 / 8.54 / 5.77 |

Each JSON session includes the completed match layouts and per-player structural counts so the horizon score can be independently recomputed.
