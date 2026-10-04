# Social Horizon 321 benchmark

Engine policy: `baseline`. Measurement source: `de0254f84adef7414b512e3d3fd936033d65bef8`. Matcher coverage gain metric: `legacy-equal`.
Target: exactly 21 completed matches. Seeds: 1, 4729, 104729, 130363, 2097593. The score uses completed layouts only, caps courtmates/opponents/partners at 13/12/6 feasible opportunities, and weights the active facets 3:2:1 per player.

The relationship denominator remains the structural MIXICANO opportunity set. Empty facets are excluded and the remaining weights are renormalized. Match type is not part of this score.

| Format | Horizon score at 21 | Courtmates | Opponents | Partners | Mean distinct C/O/P |
|---|---:|---:|---:|---:|---|
| SOCIAL_MIX | 81.75% | 82.86% | 72.86% | 96.19% | 10.77 / 8.74 / 5.80 |
| POINTS | 81.75% | 82.86% | 72.86% | 96.19% | 10.77 / 8.74 / 5.80 |
| ELO | 81.72% | 82.64% | 73.10% | 96.19% | 10.74 / 8.77 / 5.80 |

Each JSON session includes the completed match layouts and per-player structural counts so the horizon score can be independently recomputed.
