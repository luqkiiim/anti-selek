# Level Match 3.0 candidate

Reference: `cbbfd966c48989da3622a6afe5e8cc044995180b`. Keep the current
Level Match (`RACE`) legality, fairness, balance and skill passes. The
candidate changes the ranking of admitted matches under the Level-only
`LEVEL_MATCH_3_ENABLED=1` server flag.

Review criteria set before benchmarking: zero new legality, fairness,
balance or avoidable severe mismatch violations. Check six appearances per
player in the feasible 7/7, 21-match primary case. Compare each roster and
scheduling mode separately. Review a mean compatibility increase above 0.25
units, a maximum wait increase above one completion, a back-to-back increase
above five percentage points, and p95 growth above the larger of 20% or 25 ms.
Review the raw and same-match-type-mix opponent and partner gains, including
the worst individual outcomes. Treat gaps as reasons to refine or hold activation.

## Policy and accounting

Level Match 2.0 used the target for individual exposure. It ranked new
courtmates ahead of role-specific novelty. The candidate adds a session ledger
and ranks new opponents, then new partners, ahead of general courtmate variety.
Both engines use the same legal compositions, effective-side mixed percentiles,
selected metric, and fairness, arrival, scheduling, starvation, balance and
skill admission rules.

For ranking, group the sum of squared match-count deviations into fixed
half-unit bands. At a fixed projected match count this is the normalized
distribution error multiplied by the squared count. The pilot used absolute
quarter-unit bands for worst and mean compatibility. It cut novelty even in
the fixed-mix control. The final comparison uses a 0.4-unit worst-court band
anchored at the certified best fit, with exact worst and mean compatibility
still available as late refinements. The existing 0.5 and 2.5 compatibility
limits still govern admission. This band affects ranking only.

The remaining order is individual exposure debt beyond one appearance,
unseen opponents, unseen partners, remaining attainable novelty, repeat
frequency, recent repeats, repeated quartets, exact repeated partitions,
new courtmates, exact compatibility and balance, and existing rest and
neutral tie-breaks. Recency uses completed-match timestamps. Feasible
novelty counts use legal per-court choices within the decision's balance
and skill bounds. They are an upper bound on opportunities across a complete
disjoint batch. The branch-and-bound interval is optimistic in each type
coordinate, so a partial batch can only be pruned when its best possible
score cannot beat the incumbent. Certified fallbacks still apply.

Match-type scoring is active in Mixed Pairs. Ungrouped targets use the shared
maximum-entropy function, including its small-side cases. Group courts
project per composition onto categories that the active roster can legally
form, using proportional seats across both pools where possible. Busy players
stay in the structural roster. At 10/2 the targets are 2/3 upper and 1/3 mixed,
and the lower side has no own-side court. At 13/1 the candidate records the
proportional target as infeasible and can still make upper-only games. The
benchmark enumerates arithmetically feasible integer counts at its horizons
for fixed ungrouped rosters. The live selector treats these targets as goals.

The first versioned match or queue commitment starts the distribution ledger.
Old assignments still supply relationship history. A fresh session is the
review baseline. Committed assignments store their chosen category and
assignment-time targets in reason JSON. Queue activation preserves them,
and deleting, cancelling or replacing an assignment changes the ledger at
its source. Automatic writers check the roster, settings and commitment
fingerprint within the transaction. Queue replacement also checks the
original queue, and activation checks the stored lineup and reason. No
database schema change is required.

## Results and recommendation

**Refine before activation.** The candidate met the checked hard guards and
improved the roster mix, but missed the raw relationship-variety objective
and crossed some game-quality and latency review thresholds.

The [paired results](../benchmarks/level-match-3.summary.json) report 47
scenario/schedule/horizon combinations at three seeds, or 141 sessions and
5,331 completed matches per arm. The runner loads each engine and its imports
from a separate checkout. The baseline checkout is clean and pinned to the
Level Match 2.0 commit above. The primary scenarios use Mixed Pairs. The
queued simulator reserves one waiting lineup when all courts are occupied
and activates it when the next court opens. The fixed-mix control plays one
court at a time with the same `UPPER / MIXED / LOWER` sequence in both arms.
Both simulations use fixed ratings and deterministic results.

| Metric | Level Match 2.0 | Candidate |
| --- | ---: | ---: |
| Mean total-variation error, Mixed Pairs | 28.9% | 15.5% |
| Mean unique opponents per player | 8.05 | 7.15 |
| Mean unique partners per player | 5.43 | 5.13 |
| Mean of the worst individual opponent counts | 5.62 | 4.89 |
| Mean of the worst individual partner counts | 3.55 | 3.33 |
| Mean repeated quartets per session | 10.54 | 15.82 |
| Mean exact rematches per session | 7.31 | 12.36 |
| Mean compatibility cost | 1.023 | 1.029 |
| Mean balance gap in the selected metric | 19.71 | 19.03 |
| Maximum wait, in completions | 7 | 7 |
| Zero-rest starts | 27.1% | 26.2% |
| Mean per-session p95 matcher time | 39 ms | 53 ms |
| Legality / fairness certificate / balance violations | 0 / 0 / 0 | 0 / 0 / 0 |
| Measured avoidable severe matches / interruptions / fallbacks | 0 / 0 / 0 | 0 / 0 / 0 |

In the narrow 7/7 asynchronous case, the candidate produced **7/7/7**
in all three runs, with six games per player. The reference produced
**3/15/3** in all three. Queued candidate runs gave 6/9/6, 6/9/6 and 6/7/8.
Both versions ended those queued runs with players on **five to seven**
games, so mathematical feasibility did not guarantee equal realized play.
The largest individual mixed-exposure deviation fell in each queued seed.

| Candidate at 21 matches, upper/mixed/lower | Asynchronous | Queued |
| --- | --- | --- |
| 7/7, narrow | 7/7/7 in 3/3 | 6/9/6 to 6/7/8 |
| 7/7, wide | 0/21/0, 5/11/5, 2/17/2 | 0/21/0, 4/12/5, 6/8/7 |
| 8/6 | 8/8/5 in 3/3 | 8/7/6 in 3/3 |
| 10/5 | 7/14/0 to 9/11/1 | 6/15/0 to 10/8/3 |
| 12/4 | 11/10/0 in 3/3 | 11/10/0 or 12/8/1 |
| 10/2 | 14/7/0 in 3/3 | 14/7/0 or 15/6/0 |
| 2/10 | 0/7/14 in 3/3 | 0/6/15 in 3/3 |

The artifact includes the reversed rosters, 100-match checkpoints, all actual
and expected category counts, and individual appearances by seed. Wide skill
and availability constraints still left some sessions mostly mixed. The
2/10 queued result was the single scenario with higher mean distribution
error. The 12/4 offset case missed the illustrative 13/6/2 target in the
reviewed runs. The strong/middle/weak segments are thirds of the seeded rating
order for diagnostics only.

| Segment | Unique opponents, before → after | Unique partners, before → after | Compatibility cost, before → after |
| --- | ---: | ---: | ---: |
| Weakest | 7.93 → 7.17 | 5.43 → 5.20 | 1.069 → 1.069 |
| Middle | 8.34 → 7.35 | 5.50 → 5.26 | 0.914 → 0.868 |
| Strongest | 7.85 → 6.89 | 5.35 → 4.89 | 1.110 → 1.187 |

The same-type control held the mean at **7.81 opponents** and increased
partners from **5.57 to 5.76**. Its mean worst individual partner count
rose from 4.33 to 5.33. This isolates a partnership benefit but shows no
opponent gain. Six scenarios crossed the latency review threshold, most
notably two-court asynchronous Session Points. Four queued scenarios
crossed the mean compatibility review threshold despite passing admission.
No scenario crossed the waiting or back-to-back review limits.

## Verification and reproduction

```text
node scripts/run-level-match-3-benchmark.mjs --baseline-worktree=PATH
node scripts/run-level-match-3-benchmark.mjs --baseline-worktree=PATH --policies=reference,disabled --cases=7-7,10-5,12-4,10-2,points,groups --horizons=21 --schedules=async,queued --seeds=1,4729
```

The disabled matcher gave identical assignment fingerprints in all 24
parity runs. Route fixtures verify the metadata is absent when off and
cover flag-on Rating and Session Points, manual commitments, undo, an
actually stale roster decision, queue rebuild, reshuffle, replacement and
activation without changing the stored reason. The regression suite also
exercises Balanced, existing group constraints and shared history filtering.
Across the focused suite and isolated retry, 189 tests passed. The
three-court group test timed out once while the benchmark ran concurrently,
then passed on its own without changing the test or its timeout. TypeScript,
targeted ESLint and the normal production build also passed locally.
