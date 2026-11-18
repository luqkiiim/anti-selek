# Level Match 2.0

Baseline: `3d6fa887`. The current Level Match (`RACE`) selector certifies a
whole-batch class by effective appearances, arrivals, schedule and starvation.
Busy and paused players cannot be selected. Retained players, format legality
and Player Groups constrain the search. Mixed pairs permits same-side courts or
one player from each effective side per team. Open accepts any legal split.

Within the stronger class it certifies the best worst and total team-average
gap. Rating admits `min(50, best + 30)` where feasible, otherwise the best
worst and total gaps. Session Points admits `best + 1.5`. Current Level Match
then minimizes all-four spread and pairwise gaps, with one partition per
quartet. Social uses courtmate coverage and rolling match-type variety, plus
relationship breadth, repetition and rest in its own search and acceptance gate.

The shared Level selector in `ladder/levelSelection.ts` serves initial
generation, batches, refill, queues, reshuffles and replacement through
`generate-match/selection.ts`. It reuses candidate scans, canonicalizes
interchangeable courts, and prunes by optimistic bounds. Preserve the existing
two-second preparation/baseline and two-second quality budgets, and the shared
200,000-branch cap. Keep the certified baseline as a controlled fallback.

The setup screen starts on Club Rating, with Player Groups off. New API requests
that specify Level Match also default to Club Rating. Hosts can select Session
Points or enable Player Groups. Saved group schedules retain their priority.

## Selection order

1. Enforce legality, availability, retained players, court-time fairness,
   arrival priority, configured scheduling and starvation protections.
2. Certify the best team balance for the batch and freeze the existing balance
   limits. Keep a certified batch as the fallback.
3. Within those limits, find the best worst-court skill fit, then the lowest sum
   of average skill differences. Open and same-side matches measure individual
   skill differences. Mixed pairs compare the two players on each effective
   side and align their within-side midrank percentiles across sides. The
   reference roster includes busy players and excludes paused players. A tied
   rating shares a midpoint. Team balance uses the selected metric in its native
   units. Session Points measure performance in this session and start tied.
4. Admit up to half a compatibility unit over the best worst court and half a
   unit per court over the best batch sum. One unit represents a 100-rating or
   two-point spread, or half a roster in relative mixed-side position. An
   optional crossover can use the allowance up to 2.5 units. When the best fair
   court is already wider, the allowance preserves its best worst-court fit.
   There is always an eligible witness at the bound, whatever the ratings.
5. Among compatible batches, prefer new courtmates, underserved match-type
   exposure, new opponents, new partners, fewer exact rematches and fewer
   repeated courtmate encounters. Committed history includes active, manual and
   queued lineups. Mixed-pair results store their effective-side snapshot.
   Match-type exposure uses a population-sensitive target as a preference.
6. Break remaining ties by skill fit, team balance, the existing ordinary rest
   preference and a seeded or stable tie-break.

The search reuses the existing branch budget across all passes. The variety
pass uses integer costs with an optimistic component-wise bound. Counts are
additive across disjoint courts, so each quartet can keep its best admissible
partition without multiplying the layout search. When the balance policy also
requires the minimum batch total, a worse split for the same quartet cannot
join that optimum. Interrupted skill search keeps the best balance-admitted
witness and skips variety. Interrupted variety search keeps the best admitted
witness and reports the limit. Reshuffles reuse the original fairness, balance
and certified skill limits.

## Benchmark

Run the comparison with `node scripts/run-level-match-benchmark.mjs --policies=baseline,social,0.5`.
The runner loads the original selector from Git and compares it with the
production Social selection gate and the candidate. Three seeds (`1`, `4729`,
`104729`) cover 13 scenarios per policy and 1,056 completed matches per policy.
The cases include asynchronous refill, wide and narrow ratings, outliers,
both directions of a side-rating offset, 10/5 and 12/4 rosters, late joins,
pauses/resumes, Session Points and saved Player Groups. Timings measure
local matcher calls. The Social reference receives the same simulation inputs.

| Metric | Original Level Match | Social reference | Level Match 2.0 |
| --- | ---: | ---: | ---: |
| Distinct courtmates per player | 5.74 | 12.05 | 10.35 |
| Distinct opponents per player | 4.21 | 9.35 | 8.36 |
| Distinct partners per player | 2.26 | 6.06 | 5.08 |
| Repeated quartets per run | 16.92 | 0.56 | 3.38 |
| Exact rematches per run | 16.85 | 0.10 | 2.21 |
| Mean individual rating spread in Open and same-side matches | 141.21 | 227.58 | 149.10 |
| Mean worst within-side rating gap in Mixed pairs | 131.56 | 167.34 | 117.96 |
| Mean worst relative position gap in Mixed pairs | 0.30 | 0.32 | 0.27 |
| Mean team-average rating gap | 28.07 | 69.87 | 31.86 |
| Worst team-average rating gap | 314.0 | 637.0 | 307.5 |
| Severe rating mismatches | 139 | 251 | 153 |
| Certified avoidable severe rating mismatches | 12 | 164 | 0 |
| Maximum effective match-count disparity during play | 2 | 2 | 2 |
| Maximum wait in completions | 5 | 5 | 5 |
| Zero-rest starts | 21% | 26% | 26% |
| Worst scenario p95 decision time | 348 ms | 4,023 ms | 263 ms |
| Search interruptions / accepted fallbacks | 0 / 0 | 5 / 4 | 0 / 0 |

The candidate completed every scheduled match and passed the benchmark's
legality and fairness checks, with zero Level balance guardrail violations.
All three standard 14-player runs ended with exactly six matches per player.
Compared with original Level Match, standard runs went from 4.29 to 11.95
distinct courtmates per player and from 14.67 to zero exact rematches per run.
The average court spread increased from 33.57 to 63.62 rating points. The maximum
wait went from three to four completions in those runs, and average per-run p95
rose from 9 to 18 ms. Overall maximum wait held at five.

The candidate gained at least one distinct courtmate per player in every
scenario on average. No scenario increased mean compatibility cost by more
than half a unit. The worst local scenario p95 stayed below 400 ms. The
0.5-unit window gave substantial variety gains in the tolerance comparison.
The wider 1- and 1.5-unit windows gained more variety in some runs and widened
rating gaps further. This is why the candidate uses 0.5.

The severe-match comparison asks whether a non-severe batch was available
under Level fairness and balance for the same decision. Six candidate severe
matches occurred in Session Points runs and have no rating avoidability
classification. Mixed matches can still dominate when they fit the roster
and stronger priorities. The three 12/4 runs each produced 10 Upper, 11 Mixed
and zero Lower courts. This is a tradeoff for review, since the algorithm
does not guarantee each type a slot. The relative-skill regression fixtures
selected the top two on each side in both offset directions. The supplied
example yields `1200 + 880` against `1180 + 900`, an average team gap of zero.

The focused test suite covers the active Level selector, generated matches,
queue rebuilds, refill, reshuffle and replacement, saved groups, history
filtering, the creation defaults, small exhaustive search oracles and the
Social/Balanced isolation checks. TypeScript, targeted lint and the normal
production build ran locally. A missing `accountEmail` in an existing admin
browser test fixture was corrected to unblock type-checking.
