# Social Horizon 321 benchmark

Engine policy: `current`. Measurement source: `248eb35f4dbadacdafd7db0afe1d4f5e6589dfb0`. Matcher coverage gain metric: `social-horizon-321`.
Target: exactly 400 completed matches. Seeds: 1, 4729, 104729, 130363, 2097593. The score uses completed layouts only, caps courtmates/opponents/partners at 13/12/6 feasible opportunities, and weights the active facets 3:2:1 per player.

The relationship denominator remains the structural MIXICANO opportunity set. Empty facets are excluded and the remaining weights are renormalized. Match type is not part of this score.

| Format | Horizon score at 400 | Courtmates | Opponents | Partners | Mean distinct C/O/P |
|---|---:|---:|---:|---:|---|
| SOCIAL_MIX | 100.00% | 100.00% | 100.00% | 100.00% | 13.00 / 13.00 / 10.94 |
| POINTS | 100.00% | 100.00% | 100.00% | 100.00% | 13.00 / 13.00 / 10.94 |
| ELO | 100.00% | 100.00% | 100.00% | 100.00% | 13.00 / 13.00 / 10.54 |

Each JSON session includes the completed match layouts and per-player structural counts so the horizon score can be independently recomputed.
