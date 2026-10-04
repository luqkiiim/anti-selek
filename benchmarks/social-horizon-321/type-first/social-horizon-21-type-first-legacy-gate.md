# Social Horizon 321 benchmark

Engine policy: `type-first`. Measurement source: `bcf07fb22cded580c7e2c0c72d6a5a58bc4eb49d`. Matcher coverage gain metric: `legacy-equal`.
Target: exactly 21 completed matches. Seeds: 1, 4729, 104729, 130363, 2097593. The score uses completed layouts only, caps courtmates/opponents/partners at 13/12/6 feasible opportunities, and weights the active facets 3:2:1 per player.

The relationship denominator remains the structural MIXICANO opportunity set. Empty facets are excluded and the remaining weights are renormalized. Match type is not part of this score.

| Format | Horizon score at 21 | Courtmates | Opponents | Partners | Mean distinct C/O/P |
|---|---:|---:|---:|---:|---|
| SOCIAL_MIX | 74.77% | 74.07% | 65.71% | 95.00% | 9.63 / 7.89 / 5.71 |
| POINTS | 74.77% | 74.07% | 65.71% | 95.00% | 9.63 / 7.89 / 5.71 |
| ELO | 74.59% | 73.63% | 65.48% | 95.71% | 9.57 / 7.86 / 5.77 |

Each JSON session includes the completed match layouts and per-player structural counts so the horizon score can be independently recomputed.
