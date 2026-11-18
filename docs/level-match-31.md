# Level Match 3.1 review

This report covers the original 3.1 experiment. The [refinement report](level-match-31-refinement.md) compares that version with the current draft.

**Recommendation:** Keep `LEVEL_MATCH_31_ENABLED` off. The candidate protects the existing fairness and balance rules, but the improvement in match-type distribution is inconsistent across the sessions that motivated the change.

## Why mixed doubles can dominate

Level Match 3.0 already ranks projected session distribution before relationship variety. In `findBestLevelBatchSelection()`, that ranking runs only after finding the strongest feasible fairness class, certifying team balance, and defining a skill-compatibility window. In Mixed Pairs, `buildLevelCompatibilityScorer()` measures the full four-player spread for same-side doubles and measures within-side gaps and relative ranks for mixed doubles. A mixed court can therefore stay in the skill window when all currently available same-side quartets fall outside it. A valid quartet of four women can also fall outside the fair turn or team-balance class.

A separate diagnostic replay of 37 wide-rating single-court mixed decisions found four women free in every case. Women's doubles had no admitted option due to skill compatibility in 18 decisions, fairness in 12, and team balance in seven. Those replays finished their searches. This identifies the limits on those scheduling paths. The ratings, exact timings, and committed history from the reported live session were unavailable for replay.

The ledger counted versioned completed matches, active courts, and queued and manual commitments. The wide replay reproduced high mixed counts with no queue and all targets captured from the first match. Legacy assignments without target snapshots still count for relationship history. Distribution accounting starts with the first versioned commitment. Reconstructing early categories would be possible for some sessions, but their assignment-time target and effective-side history cannot be reliably reconstructed.

## What the flagged candidate does

1. Keep the same legal roster, scheduling, effective match counts, arrival and starvation priority, and certified whole-batch team-balance guardrail. Keep relative-skill scoring for mixed doubles.
2. Certify the normal Level Match skill window. When the committed ledger shows at least one extra mixed match and at least 0.75 missing matches for a same-side category, test an extra 0.25 compatibility units for that category. This is equivalent to at most 25 rating points or 0.5 session points of additional quartet spread, plus a single 0.25-unit allowance on the batch sum of mean compatibility costs. Further widening stops at the existing severe cutoff. The existing fallback for unavoidable severe games still applies.
3. Optimize projected distribution across the entire batch. Use the extra window only if it reaches a strictly better distribution error band than the best available standard-window batch. Within a distribution band, prefer the standard window first, then keep the 3.0 skill band, individual exposure, opponent and partner variety, exact quality, and rest ordering.
4. Fall back to a certified standard-window result on interruption. Reshuffles with a previously certified selection context reuse that standard window. The flag is separate from `LEVEL_MATCH_3_ENABLED` and has no effect unless 3.0 is enabled. Commitments still use the same versioned target snapshots and stale-write verification.

The test was limited to Level Match with Mixed Pairs. Balanced Match's target formula, Social Match, Open pairing, Player Groups schedules, and match-count policies use their existing paths.

## Main replay

Comparison uses frozen 3.0 commit `fb040f8a586b0adeb09cc5dfbe40ff73dcf21414`. Each row has three seeds (1, 4729, 104729) with 12 upper / 8 lower, three courts, 30 games, staggered completions, automatic queue off, and no groups or attendance changes. Counts are men's / mixed / women's. The target fractions are 43.84% / 32.33% / 23.84%. With exactly six games for every player, the nearest integer target is **13/10/7**. The reported live **8/20/2** also fits six games each, with mixed taking 56% of upper appearances and 83% of lower appearances.

| Rating profile | 3.0 counts by seed | 3.1 counts by seed | Total-variation error, 3.0 → 3.1 |
| --- | --- | --- | --- |
| Identical | 13/10/7 · 13/10/7 · 13/10/7 | 13/10/7 · 13/10/7 · 13/10/7 | 1.0% → 1.0% |
| Narrow | 13/10/7 · 13/10/7 · 13/10/7 | 13/10/7 · 13/10/7 · 13/10/7 | 1.0% → 1.0% |
| Moderate | 12/12/6 · 10/16/4 · 12/12/6 | 10/16/4 · 12/12/6 · 12/12/6 | 12.1% → 12.1% |
| Wide | 6/24/0 · 6/24/0 · 9/18/3 | 6/24/0 · 6/24/0 · 11/14/5 | 41.0% → 36.6% |
| Different centers | 12/12/6 · 10/16/4 · 12/12/6 | 10/16/4 · 12/12/6 · 12/12/6 | 12.1% → 12.1% |
| Three skill tiers | 13/10/7 · 13/10/7 · 13/10/7 | 13/10/7 · 13/10/7 · 13/10/7 | 1.0% → 1.0% |

| Primary metric | Moderate, 3.0 → 3.1 | Wide, 3.0 → 3.1 |
| --- | --- | --- |
| Matches per player | 6 → 6 | 6 → 6 |
| Mean compatibility cost | 0.901 → 0.856 | 1.129 → 1.107 |
| Mean team-average rating gap | 17.7 → 17.0 | 23.5 → 23.5 |
| Unique opponents / partners per player | 6.17 / 4.60 → 6.43 / 4.73 | 6.43 / 4.07 → 6.30 / 4.07 |
| Max wait in completed games | 6 → 6 | 5 → 5 |
| Back-to-back appearances | 23.9% → 22.2% | 23.6% → 22.5% |
| Mean of seed p95 matcher times | 80 → 80 ms | 49 → 45 ms |
| Search interruptions / fallbacks | 0 / 0 → 0 / 0 | 0 / 0 → 0 / 0 |

All 18 primary reference and candidate pairs played to exactly six games per player, with zero legality, fairness-certificate, balance or avoidable-severe violations. Flag-off decisions reproduced the reference lineup sequence in all 18 controls. Identical and narrow rosters produced four fallback decisions per policy across the six runs and still reached 13/10/7. The cases with excess mixed games finished the search, so the proposed higher branch and time caps were not needed to diagnose those results. Local timing is illustrative and includes the work of generating the initial courts.

## Other scheduling checks

Generating one court per request produced two 3.0 replays with the reported **8/20/2** counts, one moderate and one wide. Both moved to **11/14/5** in 3.1. The six-seed comparison shows both the improvement and its limits:

| One-court requests, queue off | 3.0 counts by seed | 3.1 counts by seed |
| --- | --- | --- |
| Moderate | 7/22/1 · 8/20/2 · 12/12/6 | 12/12/6 · 11/14/5 · 12/12/6 |
| Wide | 7/22/1 · 6/24/0 · 8/20/2 | 6/24/0 · 6/24/0 · 11/14/5 |

For the moderate 8/20/2 replay that improved to 11/14/5, mean compatibility cost rose from 1.072 to 1.168 and mean team-average rating gap rose from 17.0 to 19.9. Unique opponents and partners fell from 7.2 and 4.9 to 5.4 and 3.6 per player. In the wide replay with the same count improvement, mean compatibility cost rose from 0.858 to 0.900, with unique opponents and partners rising from 5.3 and 3.9 to 5.4 and 4.3. Back-to-back appearances in that seed rose from 18.3% to 25.8%. Everyone still played six games.

### Rest preference

Level Match includes recently finished players in the available pool. The rest setting affects late tie-breaks. Effective match counts, arrival priority, and starvation protections still shape the fair group of candidates. Turning rest off produced identical lineups in all 24 paired moderate/wide replays across both versions and both no-queue scheduling modes. Match types, waiting gaps and back-to-back rates were therefore unchanged. The candidate leaves the existing rest setting in place.

### Other rosters and experiments

- At 7/7 and 21 games, both policies reached 7/7/7 without automatic queueing and 6/9/6 with queueing in both seeds. At 100, one no-queue 3.1 seed improved from 32/36/32 to 33/33/34. Both queued 100-game seeds still reached 65 mixed.
- At 10/5 and 100 games without queueing, mixed improved from 60/59 to 51/48 across the two seeds. At 12/4, one seed stayed at 28 mixed and the other improved from 50 to 40. The 10/2 and 2/10 short single-side constraints preserved the no-queue 14/7/0 and 0/7/14 counts.
- Open and the tested group-constrained scenarios retained their distributions and lineup sequences. The late-arrival and pause/resume cases kept their distribution counts. Effective-side override runs matched the corresponding queued rating runs.
- In the 12/8 queued Session Points test, one seed regressed from 11/14/5 to 8/20/2. The other stayed at 8/20/2. The replay still gave every player six games and met its skill and balance checks. This is an additional reason to hold activation.
- A separate benchmark-only preview tried up to three certified current-court alternatives and assessed a refill assuming the oldest live court finished next. Only one of the six moderate/wide replays changed, from 9/18/3 to 10/16/4. The preview required extra searches and did not earn a place in the live selector.
- A separate balance-only experiment increased the near-best Rating allowance from 30 to 50 while keeping the absolute 50 ceiling. It improved one wide seed from 9/18/3 to 10/16/4 and left the two 24-mixed seeds unchanged. Two moderate seeds regressed, one to 8/20/2. The flagged candidate keeps the current balance allowance.

## Reproduction

Run from the candidate with a clean checkout of the pinned 3.0 commit available:

```powershell
node scripts/run-level-match-3-benchmark.mjs --comparison=31 --baseline-worktree=PATH --cases=12-8-identical,12-8-narrow,12-8-moderate,12-8-wide,12-8-offset,12-8-tiers --schedules=async --horizons=30 --policies=reference,disabled,candidate
```

Use `--schedules=single` to generate one court per request, `--schedules=queued` for queueing, or `--rest=off` to bypass the existing soft rest preference. The `lookahead` benchmark policy is available for the asynchronous Rating replay. The JSON output includes per-player exposure and variety, strongest/middle/weakest summaries, team and skill quality, branch and interruption counts, and p50/p95/p99 latency.

## Verification

- Focused Level policy and distribution tests and SQLite integration coverage for Level generation, queue rebuild and activation, manual assignment, undo, reshuffle, replacement, and Player Groups.
- TypeScript, ESLint for touched source and tests, and the normal Next.js production build.
- No database migration or production flag change required.
