# Matchmaking policy comparison

Seeds: 1, 4729, 104729, 130363, 2097593. Wide-profile seeds: 30011, 65537, 999983. Each engine used the same P1–P14 roster and seeded external court-completion schedule per seed. The 21/400 counts include completed matches only; first/last windows are the first/last 100 completions of the 400-match run.

Comparison aggregation revision 71927c6cbc70e13e6ec28b4a534fcdf8481a95c1; dirty worktree true; runner/harness SHA-256 f5ab332d4aafdd73020991612df3bf7d683daafb562a35a27546d8e0d61234fd. Current measured report harness SHA-256 f5ab332d4aafdd73020991612df3bf7d683daafb562a35a27546d8e0d61234fd.

Policy provenance is per JSON row (commit, dirty state, and source hashes where available). The comparison includes original entropy-first, strict cadence, type-entropy-first, the ungated best-plus-one replay envelope, and the current coverage-gated best-plus-one policy. The current policy first freezes the best immediate-replay count and maximum first-exposure coverage among that minimum-replay frontier inside the strongest rotation class and fixed Balanced envelope; a best+1 replay is admitted only when it strictly improves that frozen coverage maximum. Combined entropy and soft cadence rank the admitted set.

## Primary narrow-profile comparison

Values are means across the five matched narrow-profile seeds. VCS is relationship coverage; rest rates use completed assignments only.

| Policy | Format | VCS21 | B2B21 | VCS400 | B2B400 | Partner400 | OWN_SIDE400 | OWN_SIDE, last 100 |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| entropy-first | Social | 64.9% | 28.9% | 100.0% | 29.5% | 100.0% | 173.4 | 43.2 |
| entropy-first | Balanced Points | 64.9% | 28.9% | 100.0% | 29.7% | 100.0% | 174.0 | 44.2 |
| entropy-first | Balanced Rating/Elo | 64.9% | 29.7% | 100.0% | 29.8% | 100.0% | 173.8 | 44.4 |
| strict-cadence | Social | 56.9% | 11.1% | 84.9% | 12.6% | 54.7% | 0.4 | 0.0 |
| strict-cadence | Balanced Points | 56.6% | 11.1% | 84.9% | 12.6% | 54.7% | 0.4 | 0.0 |
| strict-cadence | Balanced Rating/Elo | 57.2% | 10.9% | 84.6% | 12.6% | 53.8% | 0.0 | 0.0 |
| type-entropy-first | Social | 59.6% | 24.6% | 100.0% | 26.3% | 100.0% | 199.2 | 50.2 |
| type-entropy-first | Balanced Points | 59.6% | 24.6% | 100.0% | 26.3% | 100.0% | 199.2 | 50.2 |
| type-entropy-first | Balanced Rating/Elo | 59.5% | 24.3% | 100.0% | 26.6% | 100.0% | 199.2 | 51.0 |
| replay-envelope-best-plus-one | Social | 63.4% | 23.4% | 100.0% | 24.9% | 100.0% | 175.2 | 43.8 |
| replay-envelope-best-plus-one | Balanced Points | 63.4% | 23.4% | 100.0% | 24.7% | 100.0% | 173.8 | 44.8 |
| replay-envelope-best-plus-one | Balanced Rating/Elo | 63.6% | 23.7% | 100.0% | 24.8% | 100.0% | 173.8 | 45.2 |
| coverage-gated-best-plus-one | Social | 64.5% | 23.1% | 100.0% | 14.7% | 100.0% | 40.4 | 0.0 |
| coverage-gated-best-plus-one | Balanced Points | 64.5% | 23.1% | 100.0% | 14.7% | 100.0% | 40.4 | 0.0 |
| coverage-gated-best-plus-one | Balanced Rating/Elo | 64.9% | 23.4% | 100.0% | 14.6% | 100.0% | 41.6 | 0.0 |

## Full cross-profile metrics

| Policy | Profile | Format | VCS21/400 | Partner21/400 | Opponent21/400 | Courtmate21/400 | Type coverage MIXED/OWN_SIDE21/400 | Rel entropy21/400 | Type entropy21/400 | All entropy21/400 | B2B21/400 | Mean rest21/400 | P95 rest21/400 | Worst max rest21/400 | +1/+2 threshold reaches21/400 | Completed MIXED/OWN_SIDE400 | First100/last100 OWN_SIDE | Fairness spread21/400/max | +1 selected/certified; higher-entropy rejected decisions/candidates; 5+ linked/total | Starvation changes/overdue (rate; unknown) | 100% seeds | Balance/replay/gate/admissible/later-priority/never-strongest missing |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---:|---:|---|---|---|---:|---|
| entropy-first | narrow | Social | 64.9%/100.0% | 44.6%/100.0% | 67.3%/100.0% | 82.9%/100.0% | 100.0%/98.6%; 100.0%/100.0% | 79.1%/97.4% | 89.4%/98.7% | 81.7%/97.8% | 28.9%/29.5% | 1.47/1.50 | 4.00/4.00 | 5.00/7.00 | 6.8/167.8; 0.4/17.6 | 226.6/173.4 | 43.2/43.2 | 0.40/1.00/4.60 | n/a (unavailable) | n/a/646 (n/a; 646 unknown) | 5 | 0/0/0/0/0/0 |
| entropy-first | narrow | Balanced Points | 64.9%/100.0% | 44.6%/100.0% | 67.3%/100.0% | 82.9%/100.0% | 100.0%/98.6%; 100.0%/100.0% | 79.1%/97.4% | 89.4%/98.7% | 81.7%/97.8% | 28.9%/29.7% | 1.47/1.50 | 4.00/4.00 | 5.00/7.00 | 6.8/171.0; 0.4/16.4 | 226.0/174.0 | 43.2/44.2 | 0.40/1.00/4.60 | n/a (unavailable) | n/a/643 (n/a; 643 unknown) | 5 | 0/0/0/0/0/0 |
| entropy-first | narrow | Balanced Rating/Elo | 64.9%/100.0% | 44.6%/100.0% | 67.5%/100.0% | 82.6%/100.0% | 100.0%/98.6%; 100.0%/100.0% | 79.1%/97.4% | 89.4%/98.7% | 81.7%/97.8% | 29.7%/29.8% | 1.46/1.50 | 4.00/4.00 | 5.00/7.00 | 7.6/173.6; 0.4/17.6 | 226.2/173.8 | 42.6/44.4 | 0.40/1.00/4.60 | n/a (unavailable) | n/a/644 (n/a; 644 unknown) | 5 | 0/0/0/0/0/0 |
| entropy-first | wide | Balanced Points | 62.9%/98.5% | 42.5%/95.6% | 63.4%/100.0% | 82.8%/100.0% | 100.0%/100.0%; 100.0%/100.0% | 76.9%/96.0% | 94.4%/98.5% | 81.3%/96.6% | 29.5%/30.3% | 1.38/1.50 | 3.67/4.00 | 5.00/8.00 | 6.3/173.3; 0.3/16.3 | 228.3/171.7 | 39.7/42.3 | 1.33/1.33/5.00 | n/a (unavailable) | n/a/390 (n/a; 390 unknown) | n/a | 12/0/0/0/0/0 |
| entropy-first | wide | Balanced Rating/Elo | 60.6%/95.6% | 39.9%/89.0% | 62.3%/97.8% | 79.5%/100.0% | 100.0%/100.0%; 100.0%/100.0% | 75.5%/94.4% | 93.7%/98.2% | 80.0%/95.4% | 28.1%/30.5% | 1.39/1.50 | 3.67/4.00 | 5.00/6.00 | 6.7/165.3; 0.3/17.3 | 230.3/169.7 | 40.7/43.3 | 1.33/1.33/5.00 | n/a (unavailable) | n/a/382 (n/a; 382 unknown) | n/a | 36/0/0/0/0/0 |
| strict-cadence | narrow | Social | 56.9%/84.9% | 37.6%/54.7% | 59.6%/100.0% | 73.6%/100.0% | 100.0%/11.4%; 100.0%/11.4% | 71.9%/91.4% | 7.4%/0.8% | 55.8%/68.7% | 11.1%/12.6% | 1.48/1.50 | 3.00/3.00 | 4.00/6.00 | 0.8/28.4; 0.0/5.2 | 399.6/0.4 | 0.4/0.0 | 0.40/1.00/4.60 | n/a (unavailable) | 0/80 (0.0%; 0 unknown) | 0 | 0/206/0/0/0/0 |
| strict-cadence | narrow | Balanced Points | 56.6%/84.9% | 38.0%/54.7% | 58.7%/100.0% | 73.0%/100.0% | 100.0%/11.4%; 100.0%/11.4% | 71.9%/91.4% | 7.4%/0.8% | 55.8%/68.7% | 11.1%/12.6% | 1.48/1.50 | 3.00/3.00 | 4.00/6.00 | 0.8/28.4; 0.0/5.2 | 399.6/0.4 | 0.4/0.0 | 0.40/1.00/4.60 | n/a (unavailable) | 0/80 (0.0%; 0 unknown) | 0 | 0/206/0/0/0/0 |
| strict-cadence | narrow | Balanced Rating/Elo | 57.2%/84.6% | 37.8%/53.8% | 60.4%/100.0% | 73.4%/100.0% | 100.0%/0.0%; 100.0%/0.0% | 72.5%/91.3% | 0.0%/0.0% | 54.4%/68.5% | 10.9%/12.6% | 1.48/1.50 | 3.00/3.00 | 4.00/6.00 | 0.8/28.4; 0.0/5.2 | 400.0/0.0 | 0.0/0.0 | 0.40/1.00/4.60 | n/a (unavailable) | 0/80 (0.0%; 0 unknown) | 0 | 0/210/0/0/0/0 |
| strict-cadence | wide | Balanced Points | 59.1%/85.6% | 35.5%/56.8% | 62.6%/100.0% | 79.1%/100.0% | 100.0%/38.1%; 100.0%/38.1% | 72.8%/90.2% | 24.7%/2.8% | 60.7%/68.4% | 9.5%/13.5% | 1.44/1.50 | 2.67/3.00 | 3.00/6.00 | 1.3/31.0; 0.0/2.7 | 398.7/1.3 | 1.3/0.0 | 1.33/1.33/5.00 | n/a (unavailable) | 0/50 (0.0%; 0 unknown) | n/a | 12/95/0/11/0/0 |
| strict-cadence | wide | Balanced Rating/Elo | 54.9%/84.1% | 31.5%/54.6% | 60.1%/97.8% | 73.3%/100.0% | 100.0%/38.1%; 100.0%/38.1% | 69.9%/88.7% | 24.7%/2.8% | 58.6%/67.2% | 10.0%/14.0% | 1.43/1.50 | 2.67/3.00 | 3.00/6.00 | 1.3/37.3; 0.0/3.7 | 398.7/1.3 | 1.3/0.0 | 1.33/1.33/5.00 | n/a (unavailable) | 4/71 (5.6%; 0 unknown) | n/a | 36/88/0/6/0/0 |
| type-entropy-first | narrow | Social | 59.6%/100.0% | 44.0%/100.0% | 60.7%/100.0% | 74.1%/100.0% | 100.0%/100.0%; 100.0%/100.0% | 75.6%/96.4% | 95.4%/100.0% | 80.6%/97.3% | 24.6%/26.3% | 1.47/1.50 | 4.00/4.00 | 5.00/7.00 | 6.4/150.8; 0.2/15.2 | 200.8/199.2 | 47.4/50.2 | 0.40/1.00/4.60 | n/a (unavailable) | 160/578 (27.7%; 0 unknown) | 5 | 0/0/0/0/0/0 |
| type-entropy-first | narrow | Balanced Points | 59.6%/100.0% | 44.0%/100.0% | 60.7%/100.0% | 74.1%/100.0% | 100.0%/100.0%; 100.0%/100.0% | 75.6%/96.4% | 95.4%/100.0% | 80.6%/97.3% | 24.6%/26.3% | 1.47/1.50 | 4.00/4.00 | 5.00/7.00 | 6.4/150.8; 0.2/15.2 | 200.8/199.2 | 47.4/50.2 | 0.40/1.00/4.60 | n/a (unavailable) | 160/575 (27.8%; 0 unknown) | 5 | 0/0/0/0/0/0 |
| type-entropy-first | narrow | Balanced Rating/Elo | 59.5%/100.0% | 44.4%/100.0% | 60.4%/100.0% | 73.6%/100.0% | 100.0%/100.0%; 100.0%/100.0% | 75.7%/96.4% | 95.4%/100.0% | 80.7%/97.3% | 24.3%/26.6% | 1.47/1.50 | 4.00/4.00 | 5.00/7.00 | 6.2/151.2; 0.2/15.0 | 200.8/199.2 | 47.4/51.0 | 0.40/1.00/4.60 | n/a (unavailable) | 168/572 (29.4%; 0 unknown) | 5 | 0/0/0/0/0/0 |
| type-entropy-first | wide | Balanced Points | 60.1%/98.5% | 42.1%/95.6% | 61.2%/100.0% | 76.9%/100.0% | 100.0%/100.0%; 100.0%/100.0% | 75.5%/94.5% | 94.5%/100.0% | 80.2%/95.8% | 23.3%/26.9% | 1.39/1.50 | 3.67/4.00 | 5.00/8.00 | 5.7/153.0; 0.7/17.7 | 202.3/197.7 | 48.0/49.7 | 1.33/1.33/5.00 | n/a (unavailable) | 95/371 (25.6%; 0 unknown) | n/a | 0/0/0/0/12/0 |
| type-entropy-first | wide | Balanced Rating/Elo | 56.7%/95.6% | 38.8%/89.0% | 55.7%/97.8% | 75.5%/100.0% | 100.0%/100.0%; 100.0%/100.0% | 72.5%/92.4% | 94.3%/100.0% | 78.0%/94.3% | 22.9%/28.1% | 1.40/1.50 | 3.67/4.00 | 5.00/8.00 | 5.0/158.3; 0.3/19.0 | 201.3/198.7 | 47.3/51.0 | 1.33/1.33/5.00 | n/a (unavailable) | 94/361 (26.0%; 0 unknown) | n/a | 0/0/0/0/36/0 |
| replay-envelope-best-plus-one | narrow | Social | 63.4%/100.0% | 44.2%/100.0% | 65.5%/100.0% | 80.7%/100.0% | 100.0%/95.7%; 100.0%/100.0% | 78.0%/97.4% | 88.1%/98.9% | 80.5%/97.8% | 23.4%/24.9% | 1.47/1.50 | 3.80/4.00 | 5.00/7.00 | 5.2/141.0; 0.2/13.4 | 224.8/175.2 | 42.2/43.8 | 0.40/1.00/4.60 | 752/1995 (37.7%); 301/1809; 14/67 | 137/558 (24.6%; 0 unknown) | 5 | 0/0/0/0/0/0 |
| replay-envelope-best-plus-one | narrow | Balanced Points | 63.4%/100.0% | 44.2%/100.0% | 65.5%/100.0% | 80.7%/100.0% | 100.0%/95.7%; 100.0%/100.0% | 78.0%/97.4% | 88.1%/98.7% | 80.5%/97.7% | 23.4%/24.7% | 1.47/1.50 | 3.80/4.00 | 5.00/7.00 | 5.2/140.4; 0.2/15.0 | 226.2/173.8 | 42.0/44.8 | 0.40/1.00/4.60 | 734/1995 (36.8%); 301/1825; 16/75 | 128/556 (23.0%; 0 unknown) | 5 | 0/0/0/0/0/0 |
| replay-envelope-best-plus-one | narrow | Balanced Rating/Elo | 63.6%/100.0% | 44.4%/100.0% | 65.7%/100.0% | 80.7%/100.0% | 100.0%/95.7%; 100.0%/100.0% | 78.2%/97.4% | 87.7%/98.7% | 80.5%/97.8% | 23.7%/24.8% | 1.46/1.50 | 3.80/4.00 | 5.00/7.00 | 5.4/142.4; 0.2/15.4 | 226.2/173.8 | 42.4/45.2 | 0.40/1.00/4.60 | 741/1995 (37.1%); 282/1692; 16/77 | 126/562 (22.4%; 0 unknown) | 5 | 0/0/0/0/0/0 |
| replay-envelope-best-plus-one | wide | Balanced Points | 62.8%/98.5% | 42.5%/95.6% | 64.8%/100.0% | 81.0%/100.0% | 100.0%/100.0%; 100.0%/100.0% | 77.3%/95.9% | 93.0%/98.5% | 81.2%/96.6% | 24.8%/25.6% | 1.40/1.50 | 3.67/4.00 | 5.00/8.00 | 6.0/133.7; 0.3/13.7 | 227.7/172.3 | 40.0/44.0 | 1.33/1.33/5.00 | 440/1197 (36.8%); 176/650; 10/41 | 73/324 (22.5%; 0 unknown) | n/a | 12/0/0/0/0/0 |
| replay-envelope-best-plus-one | wide | Balanced Rating/Elo | 61.4%/95.6% | 38.8%/89.0% | 62.3%/97.8% | 83.2%/100.0% | 100.0%/100.0%; 100.0%/100.0% | 75.6%/94.3% | 87.5%/98.3% | 78.6%/95.3% | 25.7%/26.5% | 1.38/1.50 | 3.33/4.00 | 4.00/6.00 | 5.7/138.0; 0.0/12.7 | 229.7/170.3 | 39.0/42.3 | 1.33/1.33/5.00 | 432/1197 (36.1%); 151/378; 5/38 | 86/333 (25.8%; 0 unknown) | n/a | 36/0/0/0/0/0 |
| coverage-gated-best-plus-one | narrow | Social | 64.5%/100.0% | 44.6%/100.0% | 67.3%/100.0% | 81.8%/100.0% | 100.0%/95.7%; 100.0%/100.0% | 78.8%/95.5% | 81.1%/46.7% | 79.4%/83.3% | 23.1%/14.7% | 1.46/1.50 | 4.00/3.40 | 5.00/7.00 | 4.8/79.6; 0.2/10.8 | 359.6/40.4 | 38.2/0.0 | 0.40/1.00/4.60 | 105/1995 (5.3%); 656/13459; 0/54 | 49/325 (15.1%; 0 unknown) | 5 | 0/0/0/0/0/0 |
| coverage-gated-best-plus-one | narrow | Balanced Points | 64.5%/100.0% | 44.6%/100.0% | 67.3%/100.0% | 81.8%/100.0% | 100.0%/95.7%; 100.0%/100.0% | 78.8%/95.5% | 81.1%/46.7% | 79.4%/83.3% | 23.1%/14.7% | 1.46/1.50 | 4.00/3.40 | 5.00/6.00 | 4.8/79.8; 0.2/9.6 | 359.6/40.4 | 38.2/0.0 | 0.40/1.00/4.60 | 105/1995 (5.3%); 643/13287; 0/48 | 46/320 (14.4%; 0 unknown) | 5 | 0/0/0/0/0/0 |
| coverage-gated-best-plus-one | narrow | Balanced Rating/Elo | 64.9%/100.0% | 44.4%/100.0% | 67.7%/100.0% | 82.6%/100.0% | 100.0%/95.7%; 100.0%/100.0% | 78.9%/95.6% | 81.2%/47.9% | 79.5%/83.6% | 23.4%/14.6% | 1.46/1.50 | 4.00/3.40 | 5.00/6.00 | 5.4/80.6; 0.2/11.0 | 358.4/41.6 | 39.4/0.0 | 0.40/1.00/4.60 | 102/1995 (5.1%); 635/13104; 0/55 | 49/332 (14.8%; 0 unknown) | 5 | 0/0/0/0/0/0 |
| coverage-gated-best-plus-one | wide | Balanced Points | 63.7%/98.5% | 42.9%/95.6% | 64.1%/100.0% | 84.2%/100.0% | 100.0%/100.0%; 100.0%/100.0% | 77.8%/93.8% | 89.3%/42.8% | 80.7%/81.1% | 22.4%/15.6% | 1.40/1.50 | 3.00/4.00 | 4.00/6.00 | 4.0/89.3; 0.0/5.7 | 364.7/35.3 | 33.7/0.0 | 1.33/1.33/5.00 | 71/1197 (5.9%); 382/4626; 0/17 | 46/212 (21.7%; 0 unknown) | n/a | 12/0/0/0/0/0 |
| coverage-gated-best-plus-one | wide | Balanced Rating/Elo | 62.0%/95.6% | 39.2%/89.0% | 63.4%/97.8% | 83.5%/100.0% | 100.0%/100.0%; 100.0%/100.0% | 76.0%/92.5% | 85.4%/42.9% | 78.3%/80.1% | 21.9%/16.5% | 1.41/1.50 | 3.33/4.00 | 4.00/6.00 | 5.7/95.3; 0.0/6.0 | 364.7/35.3 | 31.7/0.0 | 1.33/1.33/5.00 | 69/1197 (5.8%); 347/2457; 0/18 | 49/222 (22.1%; 0 unknown) | n/a | 36/0/0/0/0/0 |

## Completed player-match counts at exactly 21 matches

Each seed below reports completed-match counts per roster identity; the aggregate spread is measured from those completed matches and does not assume that every player has six.

| Policy | Profile | Format | Seed | Player counts | Min / max / spread | All 14 exactly six? |
|---|---|---|---:|---|---:|---|
| entropy-first | narrow | Social | 1 | P1=5, P10=5, P11=7, P12=5, P13=6, P14=7, P2=5, P3=6, P4=6, P5=6, P6=6, P7=6, P8=7, P9=7 | 5 / 7 / 2 | no |
| entropy-first | narrow | Social | 4729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| entropy-first | narrow | Social | 104729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| entropy-first | narrow | Social | 130363 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| entropy-first | narrow | Social | 2097593 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| entropy-first | narrow | Balanced Points | 1 | P1=5, P10=5, P11=7, P12=5, P13=6, P14=7, P2=5, P3=6, P4=6, P5=6, P6=6, P7=6, P8=7, P9=7 | 5 / 7 / 2 | no |
| entropy-first | narrow | Balanced Points | 4729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| entropy-first | narrow | Balanced Points | 104729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| entropy-first | narrow | Balanced Points | 130363 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| entropy-first | narrow | Balanced Points | 2097593 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| entropy-first | narrow | Balanced Rating/Elo | 1 | P1=6, P10=5, P11=7, P12=7, P13=7, P14=5, P2=6, P3=6, P4=5, P5=6, P6=6, P7=5, P8=6, P9=7 | 5 / 7 / 2 | no |
| entropy-first | narrow | Balanced Rating/Elo | 4729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| entropy-first | narrow | Balanced Rating/Elo | 104729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| entropy-first | narrow | Balanced Rating/Elo | 130363 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| entropy-first | narrow | Balanced Rating/Elo | 2097593 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| entropy-first | wide | Balanced Points | 30011 | P1=5, P10=5, P11=7, P12=5, P13=7, P14=7, P2=6, P3=5, P4=6, P5=6, P6=6, P7=6, P8=6, P9=7 | 5 / 7 / 2 | no |
| entropy-first | wide | Balanced Points | 65537 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| entropy-first | wide | Balanced Points | 999983 | P1=5, P10=5, P11=7, P12=7, P13=6, P14=5, P2=6, P3=6, P4=6, P5=6, P6=6, P7=5, P8=7, P9=7 | 5 / 7 / 2 | no |
| entropy-first | wide | Balanced Rating/Elo | 30011 | P1=6, P10=5, P11=7, P12=6, P13=6, P14=7, P2=7, P3=5, P4=5, P5=7, P6=6, P7=6, P8=5, P9=6 | 5 / 7 / 2 | no |
| entropy-first | wide | Balanced Rating/Elo | 65537 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| entropy-first | wide | Balanced Rating/Elo | 999983 | P1=5, P10=7, P11=7, P12=5, P13=7, P14=5, P2=5, P3=6, P4=6, P5=6, P6=6, P7=6, P8=7, P9=6 | 5 / 7 / 2 | no |
| strict-cadence | narrow | Social | 1 | P1=5, P10=6, P11=5, P12=5, P13=7, P14=6, P2=6, P3=7, P4=6, P5=6, P6=7, P7=5, P8=6, P9=7 | 5 / 7 / 2 | no |
| strict-cadence | narrow | Social | 4729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| strict-cadence | narrow | Social | 104729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| strict-cadence | narrow | Social | 130363 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| strict-cadence | narrow | Social | 2097593 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| strict-cadence | narrow | Balanced Points | 1 | P1=5, P10=5, P11=5, P12=6, P13=6, P14=6, P2=5, P3=7, P4=6, P5=7, P6=6, P7=6, P8=7, P9=7 | 5 / 7 / 2 | no |
| strict-cadence | narrow | Balanced Points | 4729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| strict-cadence | narrow | Balanced Points | 104729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| strict-cadence | narrow | Balanced Points | 130363 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| strict-cadence | narrow | Balanced Points | 2097593 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| strict-cadence | narrow | Balanced Rating/Elo | 1 | P1=5, P10=7, P11=7, P12=5, P13=5, P14=6, P2=7, P3=6, P4=6, P5=6, P6=5, P7=7, P8=6, P9=6 | 5 / 7 / 2 | no |
| strict-cadence | narrow | Balanced Rating/Elo | 4729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| strict-cadence | narrow | Balanced Rating/Elo | 104729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| strict-cadence | narrow | Balanced Rating/Elo | 130363 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| strict-cadence | narrow | Balanced Rating/Elo | 2097593 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| strict-cadence | wide | Balanced Points | 30011 | P1=5, P10=6, P11=5, P12=5, P13=6, P14=6, P2=6, P3=7, P4=5, P5=7, P6=6, P7=6, P8=7, P9=7 | 5 / 7 / 2 | no |
| strict-cadence | wide | Balanced Points | 65537 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| strict-cadence | wide | Balanced Points | 999983 | P1=5, P10=5, P11=5, P12=7, P13=6, P14=7, P2=5, P3=7, P4=6, P5=7, P6=6, P7=6, P8=6, P9=6 | 5 / 7 / 2 | no |
| strict-cadence | wide | Balanced Rating/Elo | 30011 | P1=5, P10=5, P11=7, P12=5, P13=6, P14=6, P2=6, P3=6, P4=5, P5=7, P6=7, P7=6, P8=6, P9=7 | 5 / 7 / 2 | no |
| strict-cadence | wide | Balanced Rating/Elo | 65537 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| strict-cadence | wide | Balanced Rating/Elo | 999983 | P1=6, P10=7, P11=5, P12=6, P13=7, P14=5, P2=5, P3=7, P4=6, P5=5, P6=6, P7=7, P8=6, P9=6 | 5 / 7 / 2 | no |
| type-entropy-first | narrow | Social | 1 | P1=7, P10=6, P11=6, P12=6, P13=6, P14=5, P2=7, P3=7, P4=5, P5=5, P6=7, P7=6, P8=5, P9=6 | 5 / 7 / 2 | no |
| type-entropy-first | narrow | Social | 4729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| type-entropy-first | narrow | Social | 104729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| type-entropy-first | narrow | Social | 130363 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| type-entropy-first | narrow | Social | 2097593 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| type-entropy-first | narrow | Balanced Points | 1 | P1=7, P10=6, P11=6, P12=6, P13=6, P14=5, P2=7, P3=7, P4=5, P5=5, P6=7, P7=6, P8=5, P9=6 | 5 / 7 / 2 | no |
| type-entropy-first | narrow | Balanced Points | 4729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| type-entropy-first | narrow | Balanced Points | 104729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| type-entropy-first | narrow | Balanced Points | 130363 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| type-entropy-first | narrow | Balanced Points | 2097593 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| type-entropy-first | narrow | Balanced Rating/Elo | 1 | P1=7, P10=5, P11=6, P12=6, P13=6, P14=6, P2=7, P3=6, P4=5, P5=7, P6=7, P7=5, P8=6, P9=5 | 5 / 7 / 2 | no |
| type-entropy-first | narrow | Balanced Rating/Elo | 4729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| type-entropy-first | narrow | Balanced Rating/Elo | 104729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| type-entropy-first | narrow | Balanced Rating/Elo | 130363 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| type-entropy-first | narrow | Balanced Rating/Elo | 2097593 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| type-entropy-first | wide | Balanced Points | 30011 | P1=6, P10=6, P11=5, P12=5, P13=5, P14=5, P2=7, P3=7, P4=7, P5=6, P6=7, P7=6, P8=6, P9=6 | 5 / 7 / 2 | no |
| type-entropy-first | wide | Balanced Points | 65537 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| type-entropy-first | wide | Balanced Points | 999983 | P1=5, P10=7, P11=7, P12=7, P13=7, P14=6, P2=5, P3=6, P4=5, P5=6, P6=6, P7=5, P8=6, P9=6 | 5 / 7 / 2 | no |
| type-entropy-first | wide | Balanced Rating/Elo | 30011 | P1=7, P10=6, P11=6, P12=6, P13=5, P14=5, P2=7, P3=6, P4=7, P5=6, P6=7, P7=6, P8=5, P9=5 | 5 / 7 / 2 | no |
| type-entropy-first | wide | Balanced Rating/Elo | 65537 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| type-entropy-first | wide | Balanced Rating/Elo | 999983 | P1=5, P10=7, P11=6, P12=7, P13=7, P14=6, P2=6, P3=5, P4=6, P5=5, P6=5, P7=6, P8=7, P9=6 | 5 / 7 / 2 | no |
| replay-envelope-best-plus-one | narrow | Social | 1 | P1=7, P10=6, P11=5, P12=5, P13=6, P14=6, P2=5, P3=7, P4=7, P5=7, P6=5, P7=6, P8=6, P9=6 | 5 / 7 / 2 | no |
| replay-envelope-best-plus-one | narrow | Social | 4729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| replay-envelope-best-plus-one | narrow | Social | 104729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| replay-envelope-best-plus-one | narrow | Social | 130363 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| replay-envelope-best-plus-one | narrow | Social | 2097593 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| replay-envelope-best-plus-one | narrow | Balanced Points | 1 | P1=7, P10=6, P11=5, P12=5, P13=6, P14=6, P2=5, P3=7, P4=7, P5=7, P6=5, P7=6, P8=6, P9=6 | 5 / 7 / 2 | no |
| replay-envelope-best-plus-one | narrow | Balanced Points | 4729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| replay-envelope-best-plus-one | narrow | Balanced Points | 104729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| replay-envelope-best-plus-one | narrow | Balanced Points | 130363 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| replay-envelope-best-plus-one | narrow | Balanced Points | 2097593 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| replay-envelope-best-plus-one | narrow | Balanced Rating/Elo | 1 | P1=7, P10=5, P11=5, P12=6, P13=7, P14=6, P2=5, P3=6, P4=6, P5=6, P6=7, P7=5, P8=6, P9=7 | 5 / 7 / 2 | no |
| replay-envelope-best-plus-one | narrow | Balanced Rating/Elo | 4729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| replay-envelope-best-plus-one | narrow | Balanced Rating/Elo | 104729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| replay-envelope-best-plus-one | narrow | Balanced Rating/Elo | 130363 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| replay-envelope-best-plus-one | narrow | Balanced Rating/Elo | 2097593 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| replay-envelope-best-plus-one | wide | Balanced Points | 30011 | P1=5, P10=6, P11=6, P12=7, P13=7, P14=6, P2=5, P3=7, P4=5, P5=7, P6=5, P7=6, P8=6, P9=6 | 5 / 7 / 2 | no |
| replay-envelope-best-plus-one | wide | Balanced Points | 65537 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| replay-envelope-best-plus-one | wide | Balanced Points | 999983 | P1=6, P10=6, P11=7, P12=5, P13=7, P14=7, P2=5, P3=6, P4=6, P5=6, P6=5, P7=6, P8=5, P9=7 | 5 / 7 / 2 | no |
| replay-envelope-best-plus-one | wide | Balanced Rating/Elo | 30011 | P1=6, P10=7, P11=7, P12=7, P13=6, P14=7, P2=6, P3=5, P4=6, P5=6, P6=6, P7=5, P8=5, P9=5 | 5 / 7 / 2 | no |
| replay-envelope-best-plus-one | wide | Balanced Rating/Elo | 65537 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| replay-envelope-best-plus-one | wide | Balanced Rating/Elo | 999983 | P1=7, P10=6, P11=6, P12=5, P13=5, P14=6, P2=7, P3=6, P4=5, P5=7, P6=5, P7=7, P8=6, P9=6 | 5 / 7 / 2 | no |
| coverage-gated-best-plus-one | narrow | Social | 1 | P1=5, P10=6, P11=5, P12=6, P13=6, P14=5, P2=5, P3=6, P4=7, P5=7, P6=6, P7=6, P8=7, P9=7 | 5 / 7 / 2 | no |
| coverage-gated-best-plus-one | narrow | Social | 4729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| coverage-gated-best-plus-one | narrow | Social | 104729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| coverage-gated-best-plus-one | narrow | Social | 130363 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| coverage-gated-best-plus-one | narrow | Social | 2097593 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| coverage-gated-best-plus-one | narrow | Balanced Points | 1 | P1=5, P10=6, P11=5, P12=6, P13=6, P14=5, P2=5, P3=6, P4=7, P5=7, P6=6, P7=6, P8=7, P9=7 | 5 / 7 / 2 | no |
| coverage-gated-best-plus-one | narrow | Balanced Points | 4729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| coverage-gated-best-plus-one | narrow | Balanced Points | 104729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| coverage-gated-best-plus-one | narrow | Balanced Points | 130363 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| coverage-gated-best-plus-one | narrow | Balanced Points | 2097593 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| coverage-gated-best-plus-one | narrow | Balanced Rating/Elo | 1 | P1=7, P10=5, P11=5, P12=6, P13=7, P14=6, P2=5, P3=6, P4=6, P5=6, P6=7, P7=5, P8=6, P9=7 | 5 / 7 / 2 | no |
| coverage-gated-best-plus-one | narrow | Balanced Rating/Elo | 4729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| coverage-gated-best-plus-one | narrow | Balanced Rating/Elo | 104729 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| coverage-gated-best-plus-one | narrow | Balanced Rating/Elo | 130363 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| coverage-gated-best-plus-one | narrow | Balanced Rating/Elo | 2097593 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| coverage-gated-best-plus-one | wide | Balanced Points | 30011 | P1=5, P10=6, P11=6, P12=7, P13=7, P14=6, P2=6, P3=7, P4=7, P5=5, P6=5, P7=5, P8=6, P9=6 | 5 / 7 / 2 | no |
| coverage-gated-best-plus-one | wide | Balanced Points | 65537 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| coverage-gated-best-plus-one | wide | Balanced Points | 999983 | P1=6, P10=6, P11=7, P12=7, P13=6, P14=6, P2=5, P3=5, P4=6, P5=5, P6=5, P7=6, P8=7, P9=7 | 5 / 7 / 2 | no |
| coverage-gated-best-plus-one | wide | Balanced Rating/Elo | 30011 | P1=6, P10=6, P11=5, P12=6, P13=5, P14=5, P2=6, P3=7, P4=6, P5=7, P6=7, P7=7, P8=6, P9=5 | 5 / 7 / 2 | no |
| coverage-gated-best-plus-one | wide | Balanced Rating/Elo | 65537 | P1=6, P10=6, P11=6, P12=6, P13=6, P14=6, P2=6, P3=6, P4=6, P5=6, P6=6, P7=6, P8=6, P9=6 | 6 / 6 / 0 | yes |
| coverage-gated-best-plus-one | wide | Balanced Rating/Elo | 999983 | P1=6, P10=5, P11=6, P12=5, P13=5, P14=6, P2=6, P3=7, P4=7, P5=7, P6=6, P7=7, P8=6, P9=5 | 5 / 7 / 2 | no |

Replay-envelope metrics are shown for the ungated replay-envelope and current coverage-gated policies and use one-court refill decisions; the opening two-court decision is excluded. For the current policy, a rejected +1 candidate fails the frozen first-exposure coverage frontier; candidates above best+1 are outside the replay allowance. Higher-entropy rejected candidates beat the selected combined entropy but exceeded the applicable allowance. Starvation rates are unknown if any overdue counterfactual was uncertified.

## Replay-envelope and coverage-gate measurements

A linked ≥5-rest episode means the rest period followed an assignment involving a rest-zero player from a certified decision that used the +1 allowance. This is decision-level attribution and does not identify a uniquely marginal player.

| Policy | Profile | Format | Refills / replay-certified / full certified | Replay-uncertified | Coverage-gate certified / uncertified | +1 selected / rate | +1 available / eligible / rejected (decisions / candidates) | Higher-entropy outside-allowance decisions / candidates | ≥5-rest total / linked +1 / linked other replay / no replay link | No-starvation replay-certified / uncertified |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| replay-envelope-best-plus-one | narrow | Social | 1995 / 1995 / 1995 | 0 | n/a / n/a | 752 / 37.7% | n/a / n/a; n/a / n/a; n/a / n/a | 301 / 1809 | 67 / 14 / 7 / 46 | 1995 / 0 |
| replay-envelope-best-plus-one | narrow | Balanced Points | 1995 / 1995 / 1995 | 0 | n/a / n/a | 734 / 36.8% | n/a / n/a; n/a / n/a; n/a / n/a | 301 / 1825 | 75 / 16 / 8 / 51 | 1995 / 0 |
| replay-envelope-best-plus-one | narrow | Balanced Rating/Elo | 1995 / 1995 / 1995 | 0 | n/a / n/a | 741 / 37.1% | n/a / n/a; n/a / n/a; n/a / n/a | 282 / 1692 | 77 / 16 / 10 / 51 | 1995 / 0 |
| replay-envelope-best-plus-one | wide | Balanced Points | 1197 / 1197 / 1197 | 0 | n/a / n/a | 440 / 36.8% | n/a / n/a; n/a / n/a; n/a / n/a | 176 / 650 | 41 / 10 / 3 / 28 | 1197 / 0 |
| replay-envelope-best-plus-one | wide | Balanced Rating/Elo | 1197 / 1197 / 1197 | 0 | n/a / n/a | 432 / 36.1% | n/a / n/a; n/a / n/a; n/a / n/a | 151 / 378 | 38 / 5 / 1 / 32 | 1197 / 0 |
| coverage-gated-best-plus-one | narrow | Social | 1995 / 1995 / 1995 | 0 | 1995 / 0 | 105 / 5.3% | 1182 / 53498; 120 / 1364; 1178 / 52134 | 656 / 13459 | 54 / 0 / 2 / 52 | 1995 / 0 |
| coverage-gated-best-plus-one | narrow | Balanced Points | 1995 / 1995 / 1995 | 0 | 1995 / 0 | 105 / 5.3% | 1182 / 53567; 120 / 1364; 1178 / 52203 | 643 / 13287 | 48 / 0 / 2 / 46 | 1995 / 0 |
| coverage-gated-best-plus-one | narrow | Balanced Rating/Elo | 1995 / 1995 / 1995 | 0 | 1995 / 0 | 102 / 5.1% | 1186 / 53546; 121 / 1323; 1181 / 52223 | 635 / 13104 | 55 / 0 / 2 / 53 | 1995 / 0 |
| coverage-gated-best-plus-one | wide | Balanced Points | 1197 / 1197 / 1197 | 0 | 1197 / 0 | 71 / 5.9% | 692 / 17394; 90 / 706; 691 / 16688 | 382 / 4626 | 17 / 0 / 1 / 16 | 1197 / 0 |
| coverage-gated-best-plus-one | wide | Balanced Rating/Elo | 1197 / 1197 / 1197 | 0 | 1197 / 0 | 69 / 5.8% | 673 / 8128; 88 / 354; 667 / 7774 | 347 / 2457 | 18 / 0 / 0 / 18 | 1197 / 0 |

## Wide-profile unseen structurally feasible relationships

Exact names below come from each report’s unchanged structural opportunity denominator. A relationship can be missing because it was outside the observed balance envelope, replay/cadence allowance, current first-exposure coverage gate, or later selection priorities; `admissible but unchosen` uses the policy frontier recorded for that run. The JSON retains directed player/facet opportunity counts and every per-seed record.

| Policy | Format | Seed | Balance-envelope excluded | Replay / coverage gate / cadence excluded | Admissible but unchosen | Combined or facet entropy / soft cadence exclusions | Never in strongest class |
|---|---|---:|---|---|---|---|
| entropy-first | Balanced Points | 30011 | P1–P2 partners, P13–P14 partners, P6–P7 partners, P8–P9 partners | none | none | none | none |
| entropy-first | Balanced Rating/Elo | 30011 | P1–P14 opponents, P7–P8 opponents, P1–P2 partners, P1–P3 partners, P1–P8 partners, P10–P8 partners, P12–P14 partners, P13–P14 partners, P14–P7 partners, P5–P7 partners, P6–P7 partners, P8–P9 partners | none | none | none | none |
| entropy-first | Balanced Points | 65537 | P1–P2 partners, P13–P14 partners, P6–P7 partners, P8–P9 partners | none | none | none | none |
| entropy-first | Balanced Rating/Elo | 65537 | P1–P14 opponents, P7–P8 opponents, P1–P2 partners, P1–P3 partners, P1–P8 partners, P10–P8 partners, P12–P14 partners, P13–P14 partners, P14–P7 partners, P5–P7 partners, P6–P7 partners, P8–P9 partners | none | none | none | none |
| entropy-first | Balanced Points | 999983 | P1–P2 partners, P13–P14 partners, P6–P7 partners, P8–P9 partners | none | none | none | none |
| entropy-first | Balanced Rating/Elo | 999983 | P1–P14 opponents, P7–P8 opponents, P1–P2 partners, P1–P3 partners, P1–P8 partners, P10–P8 partners, P12–P14 partners, P13–P14 partners, P14–P7 partners, P5–P7 partners, P6–P7 partners, P8–P9 partners | none | none | none | none |
| strict-cadence | Balanced Points | 30011 | P1–P2 partners, P13–P14 partners, P6–P7 partners, P8–P9 partners | P1–P3 partners, P1–P4 partners, P1–P5 partners, P1–P6 partners, P1–P7 partners, P10–P11 partners, P10–P12 partners, P10–P13 partners, P10–P14 partners, P10–P8 partners, P10–P9 partners, P11–P12 partners, P11–P13 partners, P11–P14 partners, P11–P8 partners, P11–P9 partners, P12–P13 partners, P12–P14 partners, P12–P8 partners, P12–P9 partners, P13–P8 partners, P13–P9 partners, P14–P8 partners, P14–P9 partners, P2–P3 partners, P2–P4 partners, P2–P5 partners, P2–P6 partners, P2–P7 partners, P3–P4 partners, P3–P5 partners, P3–P6 partners, P3–P7 partners, P4–P5 partners, P4–P6 partners, P4–P7 partners, P5–P6 partners, P5–P7 partners | none | none | none |
| strict-cadence | Balanced Rating/Elo | 30011 | P1–P14 opponents, P7–P8 opponents, P1–P2 partners, P1–P3 partners, P1–P8 partners, P10–P8 partners, P12–P14 partners, P13–P14 partners, P14–P7 partners, P5–P7 partners, P6–P7 partners, P8–P9 partners | P1–P4 partners, P1–P5 partners, P1–P6 partners, P1–P7 partners, P10–P11 partners, P10–P12 partners, P10–P13 partners, P10–P14 partners, P10–P9 partners, P11–P12 partners, P11–P13 partners, P11–P14 partners, P11–P8 partners, P11–P9 partners, P12–P13 partners, P12–P8 partners, P12–P9 partners, P13–P8 partners, P13–P9 partners, P14–P8 partners, P14–P9 partners, P2–P3 partners, P2–P4 partners, P2–P5 partners, P2–P6 partners, P2–P7 partners, P3–P4 partners, P3–P5 partners, P3–P6 partners, P3–P7 partners, P4–P5 partners, P4–P6 partners, P4–P7 partners, P5–P6 partners | none | none | none |
| strict-cadence | Balanced Points | 65537 | P1–P2 partners, P13–P14 partners, P6–P7 partners, P8–P9 partners | P1–P3 partners, P1–P4 partners, P1–P5 partners, P1–P6 partners, P1–P7 partners, P10–P11 partners, P10–P12 partners, P10–P13 partners, P10–P14 partners, P10–P8 partners, P10–P9 partners, P11–P12 partners, P11–P13 partners, P11–P14 partners, P11–P8 partners, P11–P9 partners, P12–P13 partners, P12–P14 partners, P12–P8 partners, P13–P9 partners, P14–P8 partners, P14–P9 partners, P2–P3 partners, P2–P4 partners, P3–P4 partners, P4–P5 partners, P4–P6 partners, P4–P7 partners | P2–P5 partners, P2–P6 partners, P3–P5 partners, P3–P7 partners, P5–P6 partners, P5–P7 partners | none | none |
| strict-cadence | Balanced Rating/Elo | 65537 | P1–P14 opponents, P7–P8 opponents, P1–P2 partners, P1–P3 partners, P1–P8 partners, P10–P8 partners, P12–P14 partners, P13–P14 partners, P14–P7 partners, P5–P7 partners, P6–P7 partners, P8–P9 partners | P1–P4 partners, P1–P5 partners, P1–P6 partners, P1–P7 partners, P10–P11 partners, P10–P12 partners, P10–P13 partners, P10–P14 partners, P10–P9 partners, P11–P12 partners, P11–P13 partners, P11–P14 partners, P11–P8 partners, P11–P9 partners, P12–P13 partners, P12–P8 partners, P13–P9 partners, P14–P8 partners, P14–P9 partners, P2–P3 partners, P2–P4 partners, P2–P5 partners, P3–P4 partners, P4–P5 partners, P4–P6 partners, P4–P7 partners | P2–P6 partners, P3–P5 partners, P3–P7 partners, P5–P6 partners | none | none |
| strict-cadence | Balanced Points | 999983 | P1–P2 partners, P13–P14 partners, P6–P7 partners, P8–P9 partners | P1–P3 partners, P1–P4 partners, P1–P5 partners, P1–P6 partners, P1–P7 partners, P10–P11 partners, P10–P12 partners, P10–P8 partners, P11–P12 partners, P11–P13 partners, P11–P14 partners, P11–P8 partners, P11–P9 partners, P12–P13 partners, P12–P14 partners, P12–P8 partners, P12–P9 partners, P2–P3 partners, P2–P4 partners, P2–P5 partners, P2–P6 partners, P3–P4 partners, P3–P5 partners, P3–P7 partners, P4–P5 partners, P4–P6 partners, P4–P7 partners, P5–P6 partners, P5–P7 partners | P10–P13 partners, P10–P14 partners, P10–P9 partners, P13–P8 partners, P14–P9 partners | none | none |
| strict-cadence | Balanced Rating/Elo | 999983 | P1–P14 opponents, P7–P8 opponents, P1–P2 partners, P1–P3 partners, P1–P8 partners, P10–P8 partners, P12–P14 partners, P13–P14 partners, P14–P7 partners, P5–P7 partners, P6–P7 partners, P8–P9 partners | P1–P4 partners, P1–P5 partners, P1–P6 partners, P1–P7 partners, P10–P11 partners, P10–P12 partners, P10–P14 partners, P10–P9 partners, P11–P12 partners, P11–P13 partners, P11–P14 partners, P11–P8 partners, P11–P9 partners, P12–P13 partners, P12–P8 partners, P12–P9 partners, P13–P8 partners, P2–P3 partners, P2–P4 partners, P2–P5 partners, P2–P6 partners, P3–P4 partners, P3–P5 partners, P3–P7 partners, P4–P5 partners, P4–P6 partners, P4–P7 partners, P5–P6 partners | P10–P13 partners, P14–P9 partners | none | none |
| type-entropy-first | Balanced Points | 30011 | none | none | none | P1–P2 partners, P13–P14 partners, P6–P7 partners, P8–P9 partners | none |
| type-entropy-first | Balanced Rating/Elo | 30011 | none | none | none | P1–P14 opponents, P7–P8 opponents, P1–P2 partners, P1–P3 partners, P1–P8 partners, P10–P8 partners, P12–P14 partners, P13–P14 partners, P14–P7 partners, P5–P7 partners, P6–P7 partners, P8–P9 partners | none |
| type-entropy-first | Balanced Points | 65537 | none | none | none | P1–P2 partners, P13–P14 partners, P6–P7 partners, P8–P9 partners | none |
| type-entropy-first | Balanced Rating/Elo | 65537 | none | none | none | P1–P14 opponents, P7–P8 opponents, P1–P2 partners, P1–P3 partners, P1–P8 partners, P10–P8 partners, P12–P14 partners, P13–P14 partners, P14–P7 partners, P5–P7 partners, P6–P7 partners, P8–P9 partners | none |
| type-entropy-first | Balanced Points | 999983 | none | none | none | P1–P2 partners, P13–P14 partners, P6–P7 partners, P8–P9 partners | none |
| type-entropy-first | Balanced Rating/Elo | 999983 | none | none | none | P1–P14 opponents, P7–P8 opponents, P1–P2 partners, P1–P3 partners, P1–P8 partners, P10–P8 partners, P12–P14 partners, P13–P14 partners, P14–P7 partners, P5–P7 partners, P6–P7 partners, P8–P9 partners | none |
| replay-envelope-best-plus-one | Balanced Points | 30011 | P1–P2 partners, P13–P14 partners, P6–P7 partners, P8–P9 partners | none | none | none | none |
| replay-envelope-best-plus-one | Balanced Rating/Elo | 30011 | P1–P14 opponents, P7–P8 opponents, P1–P2 partners, P1–P3 partners, P1–P8 partners, P10–P8 partners, P12–P14 partners, P13–P14 partners, P14–P7 partners, P5–P7 partners, P6–P7 partners, P8–P9 partners | none | none | none | none |
| replay-envelope-best-plus-one | Balanced Points | 65537 | P1–P2 partners, P13–P14 partners, P6–P7 partners, P8–P9 partners | none | none | none | none |
| replay-envelope-best-plus-one | Balanced Rating/Elo | 65537 | P1–P14 opponents, P7–P8 opponents, P1–P2 partners, P1–P3 partners, P1–P8 partners, P10–P8 partners, P12–P14 partners, P13–P14 partners, P14–P7 partners, P5–P7 partners, P6–P7 partners, P8–P9 partners | none | none | none | none |
| replay-envelope-best-plus-one | Balanced Points | 999983 | P1–P2 partners, P13–P14 partners, P6–P7 partners, P8–P9 partners | none | none | none | none |
| replay-envelope-best-plus-one | Balanced Rating/Elo | 999983 | P1–P14 opponents, P7–P8 opponents, P1–P2 partners, P1–P3 partners, P1–P8 partners, P10–P8 partners, P12–P14 partners, P13–P14 partners, P14–P7 partners, P5–P7 partners, P6–P7 partners, P8–P9 partners | none | none | none | none |
| coverage-gated-best-plus-one | Balanced Points | 30011 | P1–P2 partners, P13–P14 partners, P6–P7 partners, P8–P9 partners | none | none | none | none |
| coverage-gated-best-plus-one | Balanced Rating/Elo | 30011 | P1–P14 opponents, P7–P8 opponents, P1–P2 partners, P1–P3 partners, P1–P8 partners, P10–P8 partners, P12–P14 partners, P13–P14 partners, P14–P7 partners, P5–P7 partners, P6–P7 partners, P8–P9 partners | none | none | none | none |
| coverage-gated-best-plus-one | Balanced Points | 65537 | P1–P2 partners, P13–P14 partners, P6–P7 partners, P8–P9 partners | none | none | none | none |
| coverage-gated-best-plus-one | Balanced Rating/Elo | 65537 | P1–P14 opponents, P7–P8 opponents, P1–P2 partners, P1–P3 partners, P1–P8 partners, P10–P8 partners, P12–P14 partners, P13–P14 partners, P14–P7 partners, P5–P7 partners, P6–P7 partners, P8–P9 partners | none | none | none | none |
| coverage-gated-best-plus-one | Balanced Points | 999983 | P1–P2 partners, P13–P14 partners, P6–P7 partners, P8–P9 partners | none | none | none | none |
| coverage-gated-best-plus-one | Balanced Rating/Elo | 999983 | P1–P14 opponents, P7–P8 opponents, P1–P2 partners, P1–P3 partners, P1–P8 partners, P10–P8 partners, P12–P14 partners, P13–P14 partners, P14–P7 partners, P5–P7 partners, P6–P7 partners, P8–P9 partners | none | none | none | none |
