# Refined Level Match 3.1

The revised policy favors a good badminton game and a sustainable mix of match types. Repeating partners and opponents carries little weight. The earlier [Level Match 3.1 review](level-match-31.md) describes the initial 0.25-unit experiment.

## What still allowed 24 mixed games

The 3.0 selector already ranks match-type distribution first within the set that passes fairness, balance and skill. It cannot correct a type deficit with a candidate excluded earlier in the search. Same-side compatibility measures the full four-player spread. Mixed compatibility compares the two pairs' within-side skill gaps and relative positions, so a mixed court can offer a good game even when the nearest legal same-side group spans a wide rating range. The original 3.1 recovery test only added 0.25 compatibility units and kept the normal near-best balance window.

With a single court opening, the other lineups stay committed. A women’s doubles game needs four available women from the current fair allocation, and those four still need an acceptable game. Queue reservations move that selection earlier. Session Points uses the players' current standings, so completing a match can change which later quartets fit even when the players' ratings and availability stay the same. These are different scheduling paths even when they converge on six games per player.

## Selection policy

1. Certify the strongest legal scheduling and fairness class as before, including match counts, arrival, starvation, retained players and Player Groups. Certify its team-balance baseline and usual skill window.
2. When mixed doubles is at least 0.75 matches over its committed target and an upper or lower category is at least half a match short, consider that same-side category in a bounded recovery window. Add up to 0.75 compatibility units of individual spread and 0.75 total units on the sum of mean compatibility costs across the batch. Keep the existing severe skill cutoff and standard fallback if the best certified game already exceeds it. Allow up to 15 additional Rating points on the team-average gap while retaining the absolute 50-point cap when feasible. Keep the existing Session Points balance limit and the exact balance fallback when a batch cannot meet the Rating cap.
3. Minimize the exact squared deviation from the cumulative roster-adaptive match-type target. The old policy grouped scores into half-match-squared bands. At equal error, stay in the standard window. The same evaluation considers every court in the batch and uses the existing versioned snapshots for completed, active, queued and manual commitments.
4. Among comparably distributed batches, compare worst-court then total skill compatibility, followed by team balance. Evaluate individual mixed exposure next. Exact team repeats and soft rest break later ties. The refined policy skips the earlier opponent/partner novelty scans. It does not prescribe skill bands or a crossover frequency.
5. On search interruption, fall back to a standard-window result if the currently preferred batch uses the wider envelope. Reshuffles still use the stored standard envelope. The branch/time budgets and the commit-time validation of the roster and existing commitments are unchanged.

The existing Level-only `LEVEL_MATCH_31_ENABLED` flag gates the refined Mixed Pairs ranking and recovery window. The flag defaults off. The change uses the existing Open, Balanced and Social selection paths and needs no schema change.

## Results

The [per-seed comparison](../benchmarks/level-match-31-refined.csv) contains 447 records across the three versions. It includes game distribution and expected counts, skill and team gaps, fair turns, individual exposure, waiting and back-to-backs, relationship variety, and search latency. The simulations reproduce the session shape rather than the exact historical lineups or scores.

The fixed 12 upper / 8 lower roster targets approximately 13.15 upper, 9.70 mixed and 7.15 lower games in 30 matches. **13/10/7** is the closest feasible integer split with six games per player. All 63 refined primary runs finished with six games per player and zero failed selections, legality violations, fairness violations, balance violations or avoidable severe matches under the certified fairness and balance class. Total-variation error improved in 27 runs, tied in 33 and worsened in three against 3.0. Against original 3.1 it improved in 24, tied in 37 and worsened in two. Identical and narrow-rating sessions reached 13/10/7 in each of the nine scheduling and seed combinations across all three versions.

| 12/8, 30 games | Seed | Level 3.0 | Original 3.1 | Refined |
| --- | ---: | ---: | ---: | ---: |
| Wide, initially batched and staggered | 1 | 6/24/0 | 6/24/0 | **11/14/5** |
| Wide, initially batched and staggered | 4729 | 6/24/0 | 6/24/0 | **11/14/5** |
| Wide, initially batched and staggered | 104729 | 9/18/3 | 11/14/5 | **13/10/7** |
| Wide, one court per request | 1 | 7/22/1 | 6/24/0 | **10/16/4** |
| Wide, one court per request | 4729 | 6/24/0 | 6/24/0 | **11/14/5** |
| Wide, one court per request | 104729 | 8/20/2 | 11/14/5 | **12/12/6** |
| Wide, automatic queue | 1 | 6/24/0 | 6/24/0 | **10/16/4** |
| Wide, automatic queue | 4729 | 6/24/0 | 6/24/0 | **10/16/4** |
| Wide, automatic queue | 104729 | 10/16/4 | 11/14/5 | **12/12/6** |
| Moderate, one court per request | 4729 | 8/20/2 | 11/14/5 | **11/14/5** |
| Session Points, automatic queue | 1 | 11/14/5 | 8/20/2 | **9/18/3** |
| Session Points, automatic queue | 4729 | 8/20/2 | 8/20/2 | **8/20/2** |
| Session Points, automatic queue | 104729 | 7/22/1 | 7/22/1 | **8/20/2** |

The main wide one-court comparison across 90 games makes the quality trade-off visible:

| Metric | Level 3.0 | Original 3.1 | Refined |
| --- | ---: | ---: | ---: |
| Mean distribution error | 41.0% | 36.6% | 14.3% |
| Mean skill compatibility cost | 1.183 | 1.170 | 1.488 |
| Worst skill compatibility cost | 6.03 | 6.03 | 6.03 |
| Mean team-average Rating gap | 20.9 | 24.4 | 20.6 |
| Severe games under existing skill metric | 11 | 11 | 18 |
| Maximum wait, measured in completions | 5 | 5 | 4 |
| Back-to-back appearances | 21.4% | 23.6% | 13.3% |
| Mean unique opponents / partners | 6.20 / 4.27 | 5.97 / 4.10 | 2.93 / 1.83 |
| Mean of seed p95 matcher times | 44 ms | 40 ms | 43 ms |
| Search interruptions | 0 | 0 | 0 |

Every match above the severe threshold had a certified best fit that already exceeded that threshold in its eventual state. The schedule still reached those states more often. In the wide one-court comparison the weakest rating third averaged 0.81 severe appearances per player, the middle third 1.10, and the strongest third 1.78. Original 3.1 averaged 0.48, 0.62, and 1.17, respectively. The highest individual mixed-exposure deviation remained 68.6 percentage points in this comparison. Across all 63 main replays, the refined policy used the additional Rating balance allowance in 14 games.

For large tied batches, the refined search now bounds the remaining distribution error using whole categories rather than a continuous interval. It still ignores candidate overlap for that bound so pruning is conservative. On identical-rating staggered batches, mean seed p95 was 313 / 353 / 366 ms for 3.0, initial 3.1 and refined, with two interruptions in each. The narrow-rating mean was 234 / 237 / 152 ms. These are local matcher measurements. The live request budget was not increased.

## Where deficits remain

For the two additional 12/8 seeds (17 and 9973), each of the six refined wide-rating replays finished between 12 and 14 mixed games. Across their 61 one-court decisions that still added to an existing mixed surplus, the same-side counterfactual found women’s doubles unavailable or illegal 11 times, outside the certified fair class 12 times, beyond the balance limit 16 times, and outside the skill window 22 times. It found no admitted women’s doubles candidate that lost on ranking. The counterfactuals diagnose the state at those decisions. Earlier lineup choices can still change the state of later turns.

- **7/7, 21 games with staggered courts.** Both seeds moved from 7/7/7 to 6/9/6. At 100 games with queueing, one seed improved from 65 to 42 mixed and the other stayed at 65. In the latter seed, among 61 audited decisions for either same-side category, 48 lacked a legal available quartet and 13 failed the fair allocation. The quality limits were never the reason.
- **10/5, 100 games without queueing.** The three versions produced 60 → 51 → 36 and 59 → 48 → 39 mixed games in the two seeds. The **10/2** and reversed **2/10** 21-game no-queue runs retained the legal one-third mixed share.
- **12/4, 100 games without queueing.** One seed stayed at 28 mixed. The other went from 50 to 40 with original 3.1 and back to 50 with the refined policy. In that refined replay, 24 of 26 audited women’s doubles alternatives failed the fair allocation, one had no legal quartet available, and one failed skill.
- **Queued Session Points.** The fixed 12/8 seed that had moved from 14 to 20 mixed improved to 18. In the two additional seeds it moved from 20 and 18 mixed in 3.0 to 20 and 22. By contrast, all three primary 12/8 asynchronous Session Points seeds improved. Smaller 7/7 queued Session Points also improved in one seed and tied in the other. This is a scheduling-sensitive regression that warrants further testing.
- **Other operations.** The matrix includes effective-side overrides, grouped courts, late entry, pause/resume and Open. The 16 flag-off control replays reproduced the pinned 3.0 lineup fingerprints. Route tests cover manual commitments, stale proposal rejection, queue rebuilding and activation, reshuffling and retained players.

**Recommendation:** Keep the flag off for general rollout. The Rating distribution gains justify a targeted trial, but more severe games accumulated in wide-skill sessions, and the queued Session Points and some smaller-roster cases remain variable. Lower opponent and partner variety is expected under the revised priorities.

## Reproduce

The three-way comparison pins Level Match 3.0 at `fb040f8a586b0adeb09cc5dfbe40ff73dcf21414` and pre-refinement 3.1 at `5b39825506b12214409ec95640f4c46f441ba8f2`. From the refined checkout, point the script at clean worktrees at those commits.

```powershell
node scripts/run-level-match-3-benchmark.mjs --comparison=31 --baseline-worktree=PATH_30 --previous-worktree=PATH_31 --cases=12-8-identical,12-8-narrow,12-8-moderate,12-8-wide,12-8-offset,12-8-tiers,12-8-points --schedules=async,single,queued --horizons=30
```

`async` generates initially open courts together with staggered completions. `single` generates one court per request. `queued` includes a committed automatic reservation. The default seeds are 1, 4729 and 104729. `--diagnose=1` adds certified same-side counterfactuals for individual-court mixed decisions without adding those probe calls to matcher timing. `--policies=reference,disabled` compares exact lineup fingerprints with the flag off.

## Verification

All 132 focused tests passed. Coverage includes single-court and batched matching, Rating and Session Points queue rebuilding and activation, Player Groups, manual commitment persistence, undo, and rejection of stale proposals. Focused ESLint, TypeScript, and the normal production build passed. The production flag and deployment were left untouched.
