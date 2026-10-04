# Social Horizon 321 benchmark

Engine policy: `current`. Measurement source: `bf5b54ad0eeead23a8d8023c6b95731972079c6d`. Matcher coverage gain metric: `legacy-equal`.
Target: exactly 21 completed matches. Seeds: 1, 4729, 104729, 130363, 2097593. The score uses completed layouts only, caps courtmates/opponents/partners at 13/12/6 feasible opportunities, and weights the active facets 3:2:1 per player.

The relationship denominator remains the structural MIXICANO opportunity set. Empty facets are excluded and the remaining weights are renormalized. Match type is not part of this score.

| Format | Horizon score at 21 | Courtmates | Opponents | Partners | Mean distinct C/O/P |
|---|---:|---:|---:|---:|---|
| SOCIAL_MIX | 81.16% | 81.76% | 72.86% | 95.95% | 10.63 / 8.74 / 5.80 |
| POINTS | 81.16% | 81.76% | 72.86% | 95.95% | 10.63 / 8.74 / 5.80 |
| ELO | 81.68% | 82.64% | 73.33% | 95.48% | 10.74 / 8.80 / 5.77 |

Each JSON session includes the completed match layouts and per-player structural counts so the horizon score can be independently recomputed.
