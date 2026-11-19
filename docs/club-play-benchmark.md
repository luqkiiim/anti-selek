# Club Play benchmark

Run `npm run benchmark:club-play` for the complete paired suite. Filter with `--cases=compact,wide,three-court-24`, `--seeds=1`, or `--policies=club-play,level-match,grouped-points`. Each run writes a JSON trace in the ignored `benchmarks/generated/` directory. Add `--out=PATH` to choose a new output file.

## Method

The runner drives the app's single- and multiple-court selectors using the same synthetic rosters and external event schedules for Club Play, default Level Match with Rating, and grouped Balanced Points. Optional Level Match 3 and Balanced distribution experiments are disabled. Grouped Points uses the default recurrence policy and its existing fallback. Lower/Higher categories use effective pairing sides, including overrides. Open play is measured separately.

Sessions run on a 120-minute clock with pseudo-random 8–10-minute games. The 7/7 and 8/8 tied controls use 21 and 24 five-minute matches respectively. The 20-, 24-, and 28-player trajectories include two late arrivals, a pause and resume, an early departure, a court closure, asynchronous completion and an automatic reserve lineup. Availability changes apply to subsequent games. The runner uses the production no-catch-up credit function and Club Play queue revalidation selector. Transactional queue and reshuffle tests cover database writes separately.

Only finished games contribute to counts, exposure, skill and balance outcomes. Starts, waits, still-playing games and queue activity have separate counters. Final spreads compare the players who were present throughout and could form a legal court. Wait maxima include incomplete waits. Worst-player and strength-segment outcomes are in the JSON. A low- or high-skill player's opponent is considered similar in the clustered fixture if they are from the same planted cluster. In continuous fixtures the diagnostic uses a 100-point difference in synthetic true skill, with the planted offset removed for Mixed. This diagnostic has no effect on lineup selection.

The wide fixture treats a game containing both planted extreme clusters as severe. Its Club Play witness search is limited to the selected players and tests whether they could form an entire legal, balance-guardrail-compliant batch without a severe game. Forecast error in the historical-pool fixture compares an Elo team-average prediction with one from hidden synthetic skill. It illustrates the rating limitation with results from two disconnected synthetic pools. The production club's Elo calibration remains unmeasured.

## Paired results

Seed 1 covered all 19 scenarios. Values separated by `/` in the completed, spread and majority columns are Club Play, Level Match and grouped Points. Within each mix entry the counts are Higher, Mixed and Lower. The majority column gives the number of players who completed more own-side games than mixed games.

| Scenario | Completed | Final spread | Mix for each format | Own-side majority |
| --- | --- | --- | --- | --- |
| Compact 7/7 | 26/26/26 | 1/1/1 | 7/11/8 · 0/26/0 · 3/20/3 | 11/0/0 |
| Tied 7/7 | 21/21/21 | 0/0/0 | 6/9/6 · 3/15/3 · 3/15/3 | 6/0/0 |
| Tied 8/8 | 24/24/24 | 0/0/0 | 8/8/8 · 3/18/3 · 3/18/3 | 16/0/0 |
| Wide 12/12 | 39/39/38 | 1/1/1 | 13/13/13 · 0/39/0 · 9/21/8 | 24/0/4 |
| Segregated history | 26/26/26 | 1/1/1 | 7/12/7 · 0/25/1 · 4/18/4 | 8/0/0 |
| Offset cohorts 7/7 | 26/26/26 | 1/1/1 | 7/11/8 · 0/26/0 · 3/20/3 | 11/0/0 |
| 8/6 | 26/26/26 | 1/1/1 | 10/9/7 · 3/23/0 · 5/20/1 | 12/0/0 |
| 10/5 | 26/26/26 | 1/1/1 | 13/9/4 · 10/15/1 · 10/15/1 | 13/7/9 |
| 12/4 | 26/26/26 | 1/1/1 | 16/7/3 · 14/11/1 · 15/10/1 | 12/11/11 |
| 4/12 | 26/26/26 | 1/1/1 | 3/7/16 · 0/13/13 · 1/10/15 | 12/11/12 |
| 10/2 | 26/26/26 | 1/1/1 | 17/9/0 · 17/9/0 · 18/8/0 | 10/10/8 |
| 13/1 | 26/26/26 | 0/0/0 | 26/0/0 · 26/0/0 · 26/0/0 | 13/13/13 |
| 2/2 | 13/13/13 | 0/0/0 | 0/13/0 · 0/13/0 · 0/13/0 | 0/0/0 |
| One side | 26/26/26 | 1/1/1 | 26/0/0 · 26/0/0 · 26/0/0 | 12/12/12 |
| 20 players, three courts | 37/37/37 | 1/1/1 | 6/24/7 · 1/34/2 · 6/25/6 | 8/0/0 |
| 24 players, three courts | 37/37/36 | 1/1/1 | 11/14/12 · 3/31/3 · 8/20/8 | 17/0/6 |
| 28 players, three courts | 37/37/36 | 1/1/1 | 11/14/12 · 0/37/0 · 8/21/7 | 21/0/6 |
| Overrides and outliers | 26/26/26 | 1/1/1 | 10/9/7 · 5/19/2 · 5/20/1 | 10/0/1 |
| Open with a guest | 26/26/26 | 1/1/1 | Open pairing | — |

Club Play completed 520 games. It had zero invalid assignments, detected fairness or balance violations, or structurally eligible players with zero starts. The harness audited 471 Club Play decisions against the returned balance guardrail. One Club Play search used its certified fallback. Level Match completed 520 games with one exhausted search and no recorded fallback. Grouped Points completed 517 with 12 exhausted searches, eight fallbacks and four failed requests. Baseline guardrail counts reflect the proof available from each selector.

An exhaustive count-only oracle establishes nine as the minimum mixed games after 21 single-court matches for the tied 7/7 roster under the strongest per-turn count rule. Club Play matched the bound. Eight players got three own-side and three mixed games, and six got four own-side and two mixed. In 12/4 and its reverse, all four players on the smaller side finished with at least as many mixed games as own-side games. For 10/2 and 2/2, all appearances by a side with only two players had to be mixed. In 13/1, only the side of 13 could form a Mixed-mode lineup.

## Match quality and player outcomes

| Scenario | Same-cluster opponents for weakest segment | Same-cluster opponents for strongest segment | Severe games | Mean Elo team gap |
| --- | --- | --- | --- | --- |
| Wide 12/12 | 100%/73%/53% | 100%/74%/59% | 0/4/10 | 3/10/119 |
| 20 players, three courts | 56%/55%/40% | 84%/82%/64% | 8/8/13 | 23/23/113 |
| 24 players, three courts | 92%/65%/53% | 92%/79%/56% | 1/5/10 | 3/11/110 |
| 28 players, three courts | 82%/77%/65% | 83%/74%/62% | 8/6/8 | 26/9/101 |

In the clean wide roster, mean four-player rating spread was 74 in Club Play, 302 in Level Match, and 413 in grouped Points. Club Play chose 25 exact rematches there, versus zero in the two baselines. In the 24-player lifecycle case, Club Play's longest wait was 25 minutes, versus 25 and 27, and its back-to-back starts were 26 versus 17 and seven. All 24 Club Play queue activations included a fresh decision and seven changed lineups. One queue was canceled and another was unplayed when time expired.

The hardest individual results included H6 in the 20-player Club Play case with seven mixed games out of seven, L6 from the middle segment in the same case with 29% same-cluster opponents, and H2 in the 28-player case with a 27-minute wait. The same-seat witness found zero avoidable severe Club Play games in the wide trajectories. The 28-player result still included more severe games and a larger mean observed team gap than Level Match. In the compact case, the strongest segment had 59% similarly skilled opponents compared with 64% for Level Match. H7 had 36%, while H1 received five mixed games out of seven. This is a trade-off between the broader mix and individual skill fit.

In the offset roster, Club Play still made 11 mixed games, with a mean effective-side relative rank gap of 0.26 and a mean observed team gap of 14 across all its games. In the segregated fixture the focal social player H4 went from an equal seed to 1,029 Elo after the synthetic prehistory. The hidden strength was 933, and five stronger competitive players had lower Elo. Club Play gave H4 seven games against at least one competitive opponent, with one win, 14% similar opponents and a 22-percentage-point mean difference between predicted and hidden-skill team win chances. Grouped Points had eight games featuring both groups across the session, versus 25 for Club Play and 26 for Level Match. A continuous pool exposes rating errors to new results, and the early mixed-pool games can still be mismatched.

## Operational results

Times are local selector p95 in milliseconds. The table splits requests by court count. Club Play measured 159, 146 and 353 ms p95 for queue work in the 20-, 24- and 28-player cases respectively, including fresh evaluation on activation.

| Scenario | Club Play 1/2/3 courts | Level Match 1/2/3 courts | Grouped Points 1/2/3 courts |
| --- | --- | --- | --- |
| Compact 7/7 | 39/363/— | 22/113/— | 149/433/— |
| Wide 12/12 | 42/184/575 | 69/251/1,385 | 1,161/2,143/4,407 |
| 20 players, three courts | 15/97/84 | 19/92/156 | 393/620/1,782 |
| 24 players, three courts | 28/90/529 | 55/237/503 | 1,086/1,535/4,403 |
| 28 players, three courts | 83/926/2,327 | 190/1,824/2,368 | 2,113/3,554/9,127 |

The 20-, 24- and 28-player Club Play scenarios each started 40 games and completed 37 before the two-hour cutoff. That was 7.4, 6.2 and 5.3 completed games per rostered player respectively, with attendance and a court closure reducing capacity. Wall-clock values depend on the host and on the timing of certified fallbacks.

## Additional seeds

The same compact, wide and 20-, 24-, and 28-player scenarios ran again at seeds 4729 and 104729 against Level Match. Club Play completed 352 games and Level Match completed 350. The final spread for both formats was one in each of the ten additional sessions. Club Play had zero invalid assignments or detected fairness, balance or starvation violations in those runs.

Across all three seeds, Club Play made 9–11 mixed games out of 26 in the compact case. Between eight and 14 of 14 players there had an own-side majority. The clean wide roster finished at 13/13/13 and no severe games in every seed, with an own-side majority for all 24 players. All opposing pairs in those Club Play matches came from the same planted skill cluster. Level Match had two to five severe games there.

| Club Play lifecycle case | Mixed games out of 37 | Own-side majority | Severe games | Longest wait, minutes | Three-court p95, ms |
| --- | --- | --- | --- | --- | --- |
| 20 players | 23–24 | 6–8 of 20 | 7–10 | 18–19 | 40–84 |
| 24 players | 13–14 | 12–17 of 24 | 1–3 | 25–27 | 311–529 |
| 28 players | 13–14 | 15–21 of 28 | 7–8 | 27–29 | 1,338–2,327 |

The 20-player case still favored mixed play under staggered rest and court commitments. Level Match scheduled 34–37 mixed games in those sessions. The 24-player seed 4729 included a severe mixed game with Higher players H9 and H10 and Lower players L3 and L4. Changing the batch within the same seats could satisfy the balance guardrail while avoiding that extreme combination. This was the only such witness observed in the Club Play runs. The 28-player cases used a certified fallback twice. Eligibility and balance were preserved, with the extra search cost visible in the largest batches.

## Exact 20-game replays

The replay stops after 20 completed games and reports remaining starts and reservations separately. These snapshots use a 7/7 roster, two courts, and the same three seeds as the earlier simulations. For each Club Play decision the audit enumerates disjoint legal quartets, taking the most balanced partition for each quartet. It then checks whether the certified fairness class, team-balance guardrail and adaptive skill window admit a batch with at least one same-side court. The enumerated fairness optimum agreed with the production proof in every recorded decision.

```sh
npm run benchmark:club-play -- --cases=tied-20,compact-20,wide-20,wide-queued-20,offset-20,offset-queued-20,outliers-20 --seeds=1,4729,104729 --policies=club-play
```

| Scenario | Mixed games before the follow-up | Mixed games after the follow-up | Post-change starts with a same-side option inside fairness, balance and skill |
| --- | --- | --- | --- |
| Tied 7/7 | 8/7/8 | 8/7/8 | 32 of 46 |
| Compact 7/7 | 8/7/8 | 8/7/8 | 30 of 46 |
| Wide 7/7 | 20/20/20 | 20/20/20 | 0 of 46 |
| Wide 7/7 with queue | 20/20/20 | 20/20/20 | 0 of 59 |
| Offset 7/7 | 8/7/8 | 8/7/8 | 30 of 46 |
| Offset 7/7 with queue | 16/12/18 | 8/8/8 | 33 of 59 |
| Tied ratings with outliers | 14/14/14 | 10/8/8 | 27 of 46 |

The offset queue result improved when promotion began comparing the reserved match's effect on the mix with that of a fresh decision. The outlier result improved when the local skill margin started using nonzero steps between distinct rating levels if ties had made the ordinary local estimate zero. In its seed-1 opening, a balanced Lower-side court spanning 20 Elo scored 0.072 against the previous zero allowance. The adjusted allowance was 0.122, and the matcher started two same-side courts. The outlier scenario went from 13 to 27 of 46 starts admitting a same-side option.

Wide 7/7 had just two or three players from each side in each planted skill cluster. In all six runs, every fair and balanced batch containing a same-side court fell outside the quality window. The audit found such batches inside fairness and balance in 31 of 46 unqueued decisions and 28 of 59 queued start or activation decisions. In the first unqueued opening, the closest same-side alternative included a Higher court with a 2.5 Elo team-average gap, a 395-point individual spread and compatibility cost 1.013, above the 0.705 allowance. The best all-mixed batch scored 0.177 at worst. Both paths completed 20 mixed games per seed and a final match-count spread of one. The larger wide 12/12 roster offers more local same-side options and still achieved 13/13/13 across its three longer runs.
