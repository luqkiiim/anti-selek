# Balanced + Mixed courtmate exposure comparison

## Frozen baseline

Baseline results below were generated from commit 77bd46cd5645d209d63a142f5232fcbf0a5ee752 on codex/balanced-mixed-rotation in a detached worktree. The simulation helper and test now live in [exposureSimulation.ts](../src/lib/matchmaking/v3/exposureSimulation.ts) and [exposure.simulation.test.ts](../src/lib/matchmaking/v3/exposure.simulation.test.ts). The same helper is used for the after run.

## Fixture

- 14 players, P01–P07 men and P08–P14 women; everyone is available at 2026-10-01 09:00 UTC.
- Balanced + Mixed is exercised through the v3 MIXICANO selection APIs and Balanced Mixed single/batch overrides.
- 20 matches are scheduled and completed across two courts. When both courts are free, the matcher selects one global batch; when one court is free, it selects one match while the other court's match remains pending.
- Base match durations by scheduling number are fixed at 15, 18, 18, 17, 16, 14, 15, 15, 17, 13, 16, 14, 18, 15, 12, 17, 13, 16, 14, and 15 minutes, then uniformly scaled by 0.75. Rest turns and availableSince use actual completion timestamps; the final match completes after 119.25 minutes (1 hour 59 minutes 15 seconds).
- The matcher PRNG resets to seed 4729 for each metric. ELO club ratings use the same seeded integer fixture in 900–1100 for both runs and remain fixed. POINTS players begin with 0 standing points and 0 point difference. Fixed outcomes use a separate PRNG seeded 214488; match-number winners gain 3 standing points, losers gain 0, and scores are 21 to 14–20. Score differences update pointDiff. Results do not consume matcher randomness.
- Every scheduling decision receives completed history, pending matches in mixed history, outstanding match counts, current rest turns, and persisted Balanced Mixed obligations.

## Metric definitions

- Courtmate coverage counts unique unordered player pairs that have shared a court, out of 91 possible.
- Repeated encounters count each courtmate meeting after the first. Repeated pairs count unique relationships that occurred at least twice. Cumulative frequency load sums the number of prior meetings each repeated encounter had; a pair seen n times contributes n(n−1)/2.
- Partner and opponent coverage/repetition use the same definitions over the two partner pairs and four opponent pairs in each match. Exact rematches count repeats of the same two partner pairs on one court.
- The primary balance gap is the absolute difference between team average strength at scheduling time. For ELO, this is the club-rating gap. For POINTS, it is the session-standing-points gap. The separate pointDiff gap is reported for POINTS; it is not a rating gap.
- Match-count spread is based on completed games. Scheduled outstanding games are included in projected fairness checks.

## Implemented priority in the tested matcher

Selection keeps projected match-count fairness first, followed by arrival, pause/rest, outstanding-match, and persisted obligation safety. Balance qualifies candidates before variety: ELO uses the existing 50-point gap ceiling when an acceptable candidate exists and falls back to the best achievable balance otherwise; POINTS retains its safe tolerance of up to 1.5 points above the best balance gap per decision. Among balance-safe candidates, the order is repeated shared-court pair count, cumulative shared-court encounter frequency, partner/opponent coverage and repeat penalties (with exact-rematch avoidance late in the relationship tie-breaks), session composition diversity, smaller remaining balance gap, and seeded randomness only for otherwise equivalent candidates.

For two open courts, batch selection evaluates both courts together and prevents a player from appearing twice in the batch. The search is bounded at 50,000 branches and 2,000 ms, with the existing fallback retained; the batch comparison is global within the searched candidates, not an exhaustive guarantee over every possible combination. Composition remains a soft session-level diversity preference rather than a 50/25/25 quota.

## Before results

| Metric | POINTS | ELO |
| --- | ---: | ---: |
| Elapsed session | 119.25 minutes | 119.25 minutes |
| Match-count spread | 1 | 1 |
| Match counts | 6 games: P01, P02, P03, P04, P07, P09, P10, P11, P12, P13; 5 games: P05, P06, P08, P14 | 6 games: P02, P03, P04, P06, P07, P10, P11, P12, P13, P14; 5 games: P01, P05, P08, P09 |
| Unique courtmate pairs | 72 / 91 | 73 / 91 |
| Repeated courtmate encounters | 48 | 47 |
| Distinct repeated courtmate pairs | 33 | 34 |
| Cumulative courtmate frequency load | 69 | 63 |
| Partner coverage; repeat encounters / load | 40 / 91; 0 / 0 | 36 / 91; 4 / 4 |
| Opponent coverage; repeat encounters / load | 54 / 91; 26 / 34 | 56 / 91; 24 / 30 |
| Exact rematch encounters | 0 | 0 |
| MIXED / men’s / women’s matches | 10 / 5 / 5 | 10 / 5 / 5 |
| Average / worst primary balance gap | 0.675 / 1.5 session points | 17.475 / 40.5 rating points |
| Average / worst pointDiff gap | 2.225 / 7.5 | 0 / 0 (unused by ELO) |
| Decisions with a pending match | 14 | 14 |
| Decisions with both courts free | 3 | 3 |
| Batch search attempts; explored branches; max branches per decision | 4; 68,700; 36,975 | 4; 57,996; 27,525 |
| Batch search budget fallbacks | 0 | 0 |

Both runs scheduled and completed all 20 matches in 119.25 minutes, with 80 total player appearances. Ten players finished with 6 games and four with 5. Every generated court was MIXICANO-legal. ELO worst rating gap stayed within the 50-point ceiling; POINTS gaps are session standings points and are listed separately. No batch search reached its default branch or time budget.

## After results

The final run used the matcher working tree on `codex/balanced-mixed-rotation` based on HEAD `77bd46cd5645d209d63a142f5232fcbf0a5ee752`. It includes the full supported anchor skipping and global pair rescue. The fixture, matcher seed, schedule, outcomes, and scoring state match the frozen baseline.

| Metric | POINTS | ELO |
| --- | ---: | ---: |
| Elapsed session | 119.25 minutes | 119.25 minutes |
| Match-count spread | 1 | 1 |
| Match counts | 6 games: P01, P02, P04, P05, P06, P08, P10, P11, P12, P13; 5 games: P03, P07, P09, P14 | 6 games: P01, P03, P04, P05, P06, P08, P09, P10, P12, P13; 5 games: P02, P07, P11, P14 |
| Unique courtmate pairs | 76 / 91 | 77 / 91 |
| Repeated courtmate encounters | 44 | 43 |
| Distinct repeated courtmate pairs | 34 | 35 |
| Cumulative courtmate frequency load | 55 | 51 |
| Partner coverage; repeat encounters / load | 36 / 91; 4 / 4 | 37 / 91; 3 / 3 |
| Opponent coverage; repeat encounters / load | 59 / 91; 21 / 22 | 63 / 91; 17 / 20 |
| Exact rematch encounters | 0 | 0 |
| MIXED / men’s / women’s matches | 16 / 2 / 2 | 16 / 2 / 2 |
| Average / worst primary balance gap | 0.525 / 3 session points | 18.65 / 44.5 rating points |
| Average / worst pointDiff gap | 3.05 / 9 | 0 / 0 (unused by ELO) |
| Decisions with a pending match | 14 | 14 |
| Decisions with both courts free | 3 | 3 |
| Batch search attempts; explored branches; max branches per decision | 4; 129,774; 50,120 | 4; 114,835; 50,079 |
| Decisions reporting a bounded search-limit fallback | 2 | 2 |

Both modes scheduled and completed 20 legal matches with 80 player appearances. Ten players finished with 6 games and four with 5. Each scheduling decision kept projected active-player spread at or below 1; the final spread is also 1. Every court was MIXICANO-legal, and ELO's worst gap remained under 50. Each run had 14 decisions with an outstanding match, at most one outstanding match per player, and 3 decisions where both courts were free. Two decisions per mode reported the retained bounded search-limit fallback; their maximum explored branch counts were 50,120 (POINTS) and 50,079 (ELO), around the 50,000-branch cap. The exact fallback diagnostics reproduced identically in two consecutive runs. The production debug flag combines branch and time limits, so these results disclose the bounded fallback without treating absence of a time cutoff as separately instrumented.

## Before / after comparison

| Metric | POINTS before → after | ELO before → after |
| --- | ---: | ---: |
| Match-count spread | 1 → 1 | 1 → 1 |
| Unique courtmate pairs / 91 | 72 → 76 (+4) | 73 → 77 (+4) |
| Repeated courtmate encounters | 48 → 44 (−4) | 47 → 43 (−4) |
| Distinct repeated courtmate pairs | 33 → 34 | 34 → 35 |
| Courtmate frequency load | 69 → 55 (−14) | 63 → 51 (−12) |
| Partner coverage / 91 | 40 → 36 | 36 → 37 |
| Partner repeat encounters / load | 0 / 0 → 4 / 4 | 4 / 4 → 3 / 3 |
| Opponent coverage / 91 | 54 → 59 | 56 → 63 |
| Opponent repeat encounters / load | 26 / 34 → 21 / 22 | 24 / 30 → 17 / 20 |
| Exact rematch encounters | 0 → 0 | 0 → 0 |
| MIXED / men’s / women’s matches | 10 / 5 / 5 → 16 / 2 / 2 | 10 / 5 / 5 → 16 / 2 / 2 |
| Average / worst primary balance gap | 0.675 / 1.5 → 0.525 / 3 session points | 17.475 / 40.5 → 18.65 / 44.5 rating points |
| Average / worst pointDiff gap | 2.225 / 7.5 → 3.05 / 9 | 0 / 0 → 0 / 0 (unused) |
| Decisions reporting a bounded search-limit fallback | 0 → 2 | 0 → 2 |

Court mate coverage improves by four unique pairs in each mode and cumulative courtmate frequency load falls by 14 in POINTS and 12 in ELO, while the required match-count spread remains 1. Opponent coverage improves by five pairs in POINTS and seven in ELO; opponent repeat encounters and frequency load fall in both modes. Partner metrics are mixed: ELO gains one unique partner pair and has one fewer repeated partner encounter; POINTS loses four unique partner pairs and gains four repeat encounters. This POINTS trade-off follows the requested priority: shared-court novelty is primary, with partner novelty later. Composition moves from 10/5/5 to 16/2/2 in both modes; all three formats still occur, and the higher mixed share is allowed when it produces better player exposure. ELO's worst balance gap increases by 4 points but stays below the 50-point ceiling. POINTS' average standing-points gap improves from 0.675 to 0.525, while its worst gap rises from 1.5 to 3; pointDiff gap also rises slightly. Two decisions per run use the retained bounded search fallback; the results are unchanged across two consecutive deterministic runs.

## Per-player match counts

| Player | POINTS before | POINTS after | ELO before | ELO after |
| --- | ---: | ---: | ---: | ---: |
| P01 | 6 | 6 | 5 | 6 |
| P02 | 6 | 6 | 6 | 5 |
| P03 | 6 | 5 | 6 | 6 |
| P04 | 6 | 6 | 6 | 6 |
| P05 | 5 | 6 | 5 | 6 |
| P06 | 5 | 6 | 6 | 6 |
| P07 | 6 | 5 | 6 | 5 |
| P08 | 5 | 6 | 5 | 6 |
| P09 | 6 | 5 | 5 | 6 |
| P10 | 6 | 6 | 6 | 6 |
| P11 | 6 | 6 | 6 | 5 |
| P12 | 6 | 6 | 6 | 6 |
| P13 | 6 | 6 | 6 | 6 |
| P14 | 5 | 5 | 6 | 5 |

The before run used the frozen detached HEAD listed above. The final helper/test passed for both modes after dropping the unrequested zero-fallback assertion; fairness, legality, and ELO balance checks remain hard assertions. The test records bounded fallback counts and the comparison reports them without imposing an exhaustive-search or zero-fallback quota. Verification command: `npx vitest run --pool=threads --maxWorkers=1 --disableConsoleIntercept src/lib/matchmaking/v3/exposure.simulation.test.ts` (Vitest 4.1.11, Node 24.13.1; 2 tests passed).

## Final repository verification

The final broad gate passed: 37/37 test files and 442/442 tests. TypeScript, ESLint across all changed TypeScript files, and the diff check also passed.
