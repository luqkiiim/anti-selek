# Social courtmate frontier scalability results

The default-budget optimized engine completed all three 100-match sessions at 14, 16, and 18 players. It fully certified every executed batch, with no search-limit calls in any of those sessions. The original engine control completed only the 14-player profiles; its default opening search reached the limit for all 16- and 18-player seeds before returning an executable, fully certified batch.

All reported sessions use seeds `1`, `4729`, and `104729`. Every output was retained and independently validated by the runner. Search budgets were not overridden. Latencies below are per matcher call; “all calls” includes opening and refill calls, while opening/refill columns separate them. Totals count only actual session decision calls; the cloned 18-player diagnostics are reported separately. The branch counters are implementation-specific expansion/pruning units, not a common unit of raw work. In profiles outside the exact-search case (at most 14 active players and at most two courts), the existing matcher limit is 50,000 branches and 2,000 ms per search phase. A matcher call may contain more than one phase and therefore can report more than 50,000 total explored branches or take more than two seconds. The counts below sum each call’s actual debug totals across the three seeds; they are not the per-phase cap.

| Profile | Engine | 100-match sessions | Fully certified calls | Search-limit calls | All-call median / p95 / max ms | Opening median / p95 ms | Refill median / p95 ms | Matcher seconds | Explored / pruned |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 14 players, 7/7, 2 courts | Original control | 3/3 | 300/300 | 0 | 10.5 / 13.4 / 1,278.6 | 1,171.1 / 1,278.6 | 10.5 / 13.2 | 6.80 | 3,710,920 / 0 |
| 14 players, 7/7, 2 courts | Optimized | 3/3 | 300/300 | 0 | 9.4 / 10.9 / 151.5 | 92.3 / 151.5 | 9.4 / 10.9 | 3.14 | 107,950 / 4,580 |
| 16 players, 8/8, 2 courts | Original control | 0/3 | 0/3 | 3 | 183.3 / 234.7 / 234.7 | 183.3 / 234.7 | — | 0.59 | 150,000 / 0 |
| 16 players, 8/8, 2 courts | Optimized | 3/3 | 300/300 | 0 | 20.8 / 25.0 / 304.1 | 209.1 / 304.1 | 20.8 / 24.7 | 7.03 | 254,783 / 8,327 |
| 18 players, 9/9, 3 courts | Original control | 0/3 | 0/3 | 3 | 499.7 / 520.0 / 520.0 | 499.7 / 520.0 | — | 1.50 | 150,000 / 0 |
| 18 players, 9/9, 3 courts | Optimized | 3/3 | 300/300 | 0 | 9.5 / 11.6 / 1,503.6 | 1,281.3 / 1,503.6 | 9.5 / 11.5 | 6.84 | 238,187 / 18,669 |
| 14 players, 8/6, 2 courts | Original control | 3/3 | 300/300 | 0 | 10.2 / 13.1 / 1,316.0 | 1,093.5 / 1,316.0 | 10.1 / 13.0 | 6.61 | 3,732,794 / 0 |
| 14 players, 8/6, 2 courts | Optimized | 3/3 | 300/300 | 0 | 9.3 / 11.1 / 141.1 | 91.4 / 141.1 | 9.2 / 10.9 | 3.09 | 108,739 / 4,568 |
| 14 players, 10/4, 2 courts | Original control | 3/3 | 300/300 | 0 | 11.3 / 26.1 / 1,400.5 | 1,315.5 / 1,400.5 | 11.2 / 25.8 | 7.78 | 4,290,300 / 0 |
| 14 players, 10/4, 2 courts | Optimized | 3/3 | 300/300 | 0 | 9.9 / 22.2 / 150.5 | 104.6 / 150.5 | 9.9 / 22.1 | 3.59 | 123,849 / 4,780 |

For the 14-player 7/7 profile, both engines matched the frozen beneficial-rescue report exactly for all 100 completed layouts at all three overlapping seeds. Their control/current histories were also identical. Both the 21- and 100-match checkpoints matched the frozen 3211 KPI values. The two optional 14-player side-split regressions likewise matched their saved 100-match reports, including the independent structural coverage and match-type metrics at both checkpoints; control and optimized histories were identical in all six regression runs.

| Profile, at 100 matches | Engine | Mean rolling T | Mean full-type coverage | Mean courtmate coverage | Mean match-count spread |
|---|---|---:|---:|---:|---:|
| 14, 7/7 | Control / optimized (identical) | 0.9286 | 0.8571 | 1.0000 | 2.67 |
| 16, 8/8 | Optimized | 0.9583 | 0.9167 | 1.0000 | 1.67 |
| 18, 9/9 | Optimized | 0.9074 | 0.8148 | 0.9956 | 3.67 |
| 14, 8/6 | Control / optimized (identical) | 0.9881 | 0.9762 | 1.0000 | 2.67 |
| 14, 10/4 | Control / optimized (identical) | 0.9762 | 0.9524 | 1.0000 | 2.67 |

The current 18-player, three-court sessions made six cloned joint-search probes after 20- and 50-match prefixes, one of each per seed. The original control did not reach those prefixes because its opening search stopped without a selection. None of the six current-engine probes was fully certified, and none was executed. Five probes returned search-limited with no certified selection; the remaining seed-1 prefix-20 probe returned a proposal without a complete certificate. They are separate from the successful 18-player asynchronous session calls.

| Seed | Prefix | Result | Explored / pruned | Search ms |
|---:|---:|---|---:|---:|
| 1 | 20 | Proposal returned, uncertified | 96,368 / 57,944 | 2,275 |
| 1 | 50 | Search limit, no certified selection | 50,000 / 3,531 | 280 |
| 4729 | 20 | Search limit, no certified selection | 50,000 / 4,234 | 262 |
| 4729 | 50 | Search limit, no certified selection | 50,000 / 2,854 | 215 |
| 104729 | 20 | Search limit, no certified selection | 50,000 / 8,255 | 192 |
| 104729 | 50 | Search limit, no certified selection | 50,000 / 34 | 142 |

The 20-player opening’s optimized per-seed totals were 53,609/5,211, 53,625/5,243, and 53,601/5,262 explored/pruned. The 24-player totals were 58,660/12,861, 58,692/12,858, and 58,660/12,927. These totals include work from all search phases; each call still records the unmodified default limits and is marked search-limited.

Opening-only diagnostics at 20 and 24 players did not assign a batch. The original and optimized engines both hit their built-in search limits on all six seed/profile openings. The new engine pruned work but did not certify an opening at either size.

| Opening profile | Engine | Certified openings | Search-limited calls | Median / p95 / max ms | Explored / pruned |
|---|---|---:|---:|---:|---:|
| 20 players, 10/10, 3 courts | Original control | 0/3 | 3/3 | 567.9 / 680.0 / 680.0 | 150,000 / 0 |
| 20 players, 10/10, 3 courts | Optimized | 0/3 | 3/3 | 1,413.1 / 1,543.3 / 1,543.3 | 160,835 / 15,716 |
| 24 players, 12/12, 3 courts | Original control | 0/3 | 3/3 | 936.4 / 1,068.9 / 1,068.9 | 150,000 / 0 |
| 24 players, 12/12, 3 courts | Optimized | 0/3 | 3/3 | 3,332.5 / 3,842.7 / 3,842.7 | 176,012 / 38,646 |

The optimized 16- and 18-player runs therefore show successful end-to-end scaling under the existing default budgets, while fresh 20- and 24-player openings remain uncertified. The six mid-session joint probes also remain uncertified. These boundaries are reported as limits, not as successful batches or evidence that the next roster sizes are ready.

Raw decision traces, histories, per-seed checkpoints, source hashes, and independent validation records are in the three validated directories:

- `benchmarks/generated/social-frontier-scalability/primary-2026-10-06-v1/`
- `benchmarks/generated/social-frontier-scalability/regressions-2026-10-06-v1/`
- `benchmarks/generated/social-frontier-scalability/opening-2026-10-06-v1/`

The current engine source-set SHA-256 is `4c0b336d294b273e6d86cd4b99417b07ae4bf9d2e9ed527c10fc10d4cdd7bd5e`; the original control `socialBatch.ts` SHA-256 is `40538cb672c3a8cef256192b114dffb28bc853f8c1aa28790af40775f79b64e6`. Harness/source-set SHA-256: `ce0752a3c85e5bacf553241bd4620b53a153c37c8ad6f40f742fa766112a8498`. The source revision is `973081e7120bfd78f7c3808360aa37344b18e051`; the working tree was dirty with the experiment changes.
