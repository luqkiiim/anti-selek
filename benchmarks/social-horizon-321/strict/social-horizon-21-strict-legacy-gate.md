# Social Horizon 321 benchmark

Engine policy: `strict`. Measurement source: `93262f36336b9533ba96b4e4bec5d7e8061eef6e`. Matcher coverage gain metric: `legacy-equal`.
Target: exactly 21 completed matches. Seeds: 1, 4729, 104729, 130363, 2097593. The score uses completed layouts only, caps courtmates/opponents/partners at 13/12/6 feasible opportunities, and weights the active facets 3:2:1 per player.

The relationship denominator remains the structural MIXICANO opportunity set. Empty facets are excluded and the remaining weights are renormalized. Match type is not part of this score.

| Format | Horizon score at 21 | Courtmates | Opponents | Partners | Mean distinct C/O/P |
|---|---:|---:|---:|---:|---|
| SOCIAL_MIX | 71.89% | 73.63% | 64.52% | 81.43% | 9.57 / 7.74 / 4.89 |
| POINTS | 71.40% | 72.97% | 63.57% | 82.38% | 9.49 / 7.63 / 4.94 |
| ELO | 72.18% | 73.41% | 65.48% | 81.90% | 9.54 / 7.86 / 4.91 |

Each JSON session includes the completed match layouts and per-player structural counts so the horizon score can be independently recomputed.
