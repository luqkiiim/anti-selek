# Rolling match-type Social Variety experiment

This experiment starts from `main` at `973081e7120bfd78f7c3808360aa37344b18e051`.
The production coverage-gated policy remains the default. Experimental matcher
options are exercised only by the benchmark; nothing is pushed or deployed.

## Metric

The corrected completed-only Social Variety KPI is `(3C + 2O + P + T) / 7`,
averaged per player. C/O/P keep the existing capped structural denominators
`min(feasible, 13/12/6)`. T is the distinct feasible match types in each player's
most recent six completed matches divided by that player's feasible type count.
Empty structural facets are omitted with weight renormalization. Availability,
busy status, rest and Balanced admissibility do not reduce the KPI vocabulary.

Match type is coverage: a 5:1 split and a 3:3 split both earn full T. There are
no target percentages, quotas, debt, ratio errors or extra weights. The rolling
window can lose coverage when an old type expires; candidate deltas must therefore
be signed. Unclassifiable completed matches consume window slots without earning
type credit. Assignment-time snapshots classify history when available.

## Policies

| Policy | Replay gate value | Ranking after admission |
|---|---|---|
| Baseline | Existing equal-facet lifetime first-exposure coverage | Existing combined lifetime entropy and later ties |
| A | Existing relationship first exposures plus signed rolling T gain, with existing equal-facet normalization | Unchanged |
| B | Capped 3:2:1 relationship gain plus signed rolling T gain, normalized 3:2:1:1 | Unchanged |

All policies retain the same legality, count/arrival/schedule priorities,
starvation protection, fixed Balanced envelope and certified minimum-replay
class. Minimum-replay batches remain admissible. One additional immediate replay
is admitted only if its coverage gain strictly exceeds the best gain at the
minimum. No candidate forces a match type. Neither A nor B changes the final
entropy objective; the experiment tests the smallest gate-only change first.

## Evaluation

The primary checkpoint is exactly 21 completed matches: 14 players, a 7/7 side
split, two courts, asynchronous completions and seeds
`1, 4729, 104729, 130363, 2097593`. Formats are Social, Balanced Points and
Balanced Rating/Elo, using the existing narrow strength profile. Each policy
uses the same external completion schedule and initial random seed. Long-run
diagnostics continue to 400 completions and are secondary to the 21-match result.

Report C/O/P, old relationship score, distinct relationship counts, T and its
per-player windows separately from the aggregate. Rest, replay, fairness,
starvation and balance certificates remain visible. Completed histories allow
independent KPI recomputation. A finite run can detect disappearance and recovery;
it cannot prove that a type will never disappear in every possible session.

## Result and recommendation

Keep the production policy unchanged. A and B reproduce the baseline's entire
first 21 completed-match layout sequence for every seed and format. Consequently,
neither improves the corrected primary-horizon KPI; neither meets the requested
production decision criterion of a better 21-match score.

Rolling T does address the later disappearance of OWN_SIDE in this scenario.
Candidate A is the more promising continuation of the existing policy: it has
higher late T than B while retaining the legacy relationship gate. Its long-run
rest cost must remain explicit. This is an experimental recommendation, not a
production switch. No matcher policy was pushed to `main`, deployed, or enabled
by an application caller. No database migration was run.

## Primary result: exactly 21 completed matches

Every row below applies equally to Baseline, A and B. Percentages and counts are
means over five seeds within the format. C/O/P are the capped horizon fractions.

| Format | New 3211 KPI | Old 321 relationship KPI | C | O | P | T | Unique C/O/P per player | MIXED / OWN_SIDE matches |
|---|---:|---:|---:|---:|---:|---:|---|---|
| Social | 83.54% | 81.16% | 81.76% | 72.86% | 95.95% | 97.86% | 10.63 / 8.74 / 5.80 | 13.8 / 7.2 |
| Balanced Points | 83.54% | 81.16% | 81.76% | 72.86% | 95.95% | 97.86% | 10.63 / 8.74 / 5.80 | 13.8 / 7.2 |
| Balanced Rating/Elo | 83.99% | 81.68% | 82.64% | 73.33% | 95.48% | 97.86% | 10.74 / 8.80 / 5.77 | 13.8 / 7.2 |

In each format, 67 of the 70 player/seed observations have T=1 (95.71%) and
3 have T=0.5 (4.29%). These are the same players and windows under all policies.

| Format | Back-to-back rate | Mean per-seed p95 assignment rest | Worst assignment rest | Mean / worst completed-count spread | Starvation interventions across five seeds |
|---|---:|---:|---:|---|---:|
| Social | 23.14% | 4 | 5 | 0.4 / 2 | 3 |
| Balanced Points | 23.14% | 4 | 5 | 0.4 / 2 | 3 |
| Balanced Rating/Elo | 23.43% | 4 | 5 | 0.4 / 2 | 4 |

Rest is measured in completed-match events accumulated while available, sampled
at assignment. The opening assignments are excluded from the back-to-back cohort.
The back-to-back percentage is a mean of per-seed rates, not a pooled percentage.
The p95 column averages each seed's p95; the maximum column is the worst seed.

No combined score conceals a short-horizon regression: the layout prefixes,
component scores, type counts, rest, completed counts and starvation metrics all
match exactly. The first layout divergence occurs at completed match 26–48 for
A and 22–45 for B, depending on format and seed.

## Secondary result: recurrence over longer runs

All policies reach 100% capped C/O/P and the old 321 relationship score by 100
completions. By 400 they also reach 100% uncapped structural relationship coverage:
every player has experienced every feasible courtmate, opponent and partner.
Thus the following differences in the final KPI are caused by T.

| Policy | Format | T at 100 | T at 400 | New KPI at 400 | Players with only one type in latest six at 400 | Mean T over completion events 301–400 | Final 100 MIXED / OWN_SIDE matches, mean per seed |
|---|---|---:|---:|---:|---|---:|---|
| Baseline | Social | 87.86% | 50.00% | 92.86% | 70 / 70 | 50.00% | 100.0 / 0.0 |
| A | Social | 96.43% | 97.86% | 99.69% | 3 / 70 | 95.36% | 61.4 / 38.6 |
| B | Social | 95.71% | 92.14% | 98.88% | 11 / 70 | 94.53% | 60.2 / 39.8 |
| Baseline | Balanced Points | 87.14% | 50.00% | 92.86% | 70 / 70 | 50.00% | 100.0 / 0.0 |
| A | Balanced Points | 96.43% | 95.71% | 99.39% | 6 / 70 | 95.13% | 61.8 / 38.2 |
| B | Balanced Points | 95.71% | 92.86% | 98.98% | 10 / 70 | 94.46% | 61.4 / 38.6 |
| Baseline | Balanced Rating/Elo | 85.71% | 50.00% | 92.86% | 70 / 70 | 50.00% | 100.0 / 0.0 |
| A | Balanced Rating/Elo | 97.14% | 96.43% | 99.49% | 5 / 70 | 95.54% | 61.2 / 38.8 |
| B | Balanced Rating/Elo | 96.43% | 92.14% | 98.88% | 11 / 70 | 94.51% | 60.4 / 39.6 |

Every player under A and B experiences both types within the final **100 global
completed matches** in each seed. The latest-six windows are not always complete:
A has 3/6/5 single-type player observations across the five seeds by format, and
B has 11/10/11. In these final windows all single-type observations have T=0.5;
all other observations have T=1. There are no T=0 observations.

At 400, T=1/T=0.5 percentages are 95.71/4.29, 91.43/8.57 and 92.86/7.14 for
A; 84.29/15.71, 85.71/14.29 and 84.29/15.71 for B, in Social/Points/Elo order.
Baseline is 0/100 in every format. Raw reports retain every player's ordered
latest-six window and independently recomputed T at every completion prefix.

The baseline has no OWN_SIDE games in the final 100 matches of any of the 15
sessions. A and B keep OWN_SIDE recurring. This is finite-run evidence; it does
not establish a universal guarantee that a feasible type can never disappear.
The observed splits are outcomes of coverage admission and the unchanged entropy
ranking, not percentages requested from the matcher.

## Long-run rest and starvation tradeoff

| Policy | Format | Back-to-back rate at 400 | Mean per-seed p95 rest | Worst rest | Completed-count spread in every seed | Starvation interventions across five seeds |
|---|---|---:|---:|---:|---:|---:|
| Baseline | Social | 14.68% | 3.4 | 7 | 1 | 49 |
| A | Social | 19.04% | 4.0 | 7 | 1 | 86 |
| B | Social | 18.50% | 4.0 | 7 | 1 | 79 |
| Baseline | Balanced Points | 14.68% | 3.4 | 6 | 1 | 46 |
| A | Balanced Points | 18.97% | 4.0 | 7 | 1 | 86 |
| B | Balanced Points | 18.60% | 4.0 | 7 | 1 | 81 |
| Baseline | Balanced Rating/Elo | 14.63% | 3.4 | 6 | 1 | 49 |
| A | Balanced Rating/Elo | 19.14% | 4.0 | 7 | 1 | 92 |
| B | Balanced Rating/Elo | 18.75% | 4.0 | 7 | 1 | 81 |

Long-run back-to-back rates increase by 4.29–4.51 percentage points under A and
3.82–4.12 points under B. P95 rest increases from a mean of 3.4 to 4 events;
Points/Elo worst rest increases by one event. These costs are visible even though
the 21-match experience is unchanged. Starvation protection still selects within
the certified stronger class; interventions become more frequent as rolling
coverage reopens the extra-replay allowance.

## Cohorts and remaining gaps

The longest MIXED-only streak in a player's own completed appearances is
97/97/105 under Baseline, 22/22/18 under A and 24/24/22 under B, in
Social/Points/Elo order. Consequently, rolling coverage admission alone does not
guarantee an OWN_SIDE game in every six appearances. It allows recurrence while
stronger priorities and the unchanged final ranking can still defer a type.

There is no evidence of persistent isolated courtmate cohorts in these candidate
runs: within the final 100 global matches, every player under A meets at least
12 of 13 feasible courtmates; under B the minimum is 11. Mean recent distinct
courtmates is approximately 12.9 in both. At least 10 distinct partners and
11 distinct opponents occur for every candidate player in that period. Lifetime
coverage reaches all 13 in every relationship facet. These checks cover the
fixed 7/7 narrow-strength scenario; they do not establish behavior for uneven
rosters, arrivals, pauses, player groups, interclub or wide-strength envelopes.

## Validation and reproducibility

- 45 full sessions: three policies × five seeds × three formats, each ending at
  exactly 400 completions, with independent 21/100/400 component recomputation.
- All 21-match baseline layouts match the frozen current-policy fixture; all
  400-match baseline type sequences match the frozen coverage-gated benchmark.
- Across every policy and checkpoint, no fairness, starvation, balance, replay,
  coverage, search-limit or incomplete-counterfactual certification failures
  occur. Each policy independently certifies 300/1485/5985 refill decisions at
  21/100/400 across its 15 sessions, including no-starvation counterfactuals.
- 358 matcher/API regression tests pass; rolling scorer tests, TypeScript, lint,
  and the frozen-prefix audit also pass.
- Engine SHA-256 is `8e22574c0502`… and harness SHA-256 is `c9dbab9d884e`…,
  identical across all measured policies. Full hashes are in each raw report.

Run the experiment with:

```sh
node scripts/run-social-rolling-variety-benchmark.mjs --out-dir benchmarks/generated/rolling-social-variety/new-run
```

The default is all three policies, five seeds, and 400 completions. Use
`--pilot` for seed 1 at 21 completions or `--only-policy baseline|a|b` for an
isolated policy run. Existing outputs are never overwritten. Raw artifacts
remain ignored under `benchmarks/generated/rolling-social-variety/full-2026-10-06/`.
Each policy has its validated JSON, completed layouts, per-player windows,
full time series, proof counters and per-seed Markdown report there.

The separate postprocessor rechecks all 135 checkpoints for missing or nonzero
certification failures, complete replay/coverage cohorts, identical input source
hashes and global match counts. It writes a combined aggregate JSON without
changing or rerunning the measured matcher:

```sh
node scripts/summarize-social-rolling-variety.mjs --input-dir benchmarks/generated/rolling-social-variety/full-2026-10-06 --out-dir benchmarks/generated/rolling-social-variety/reviewed-summary
```

The saved default combined artifact is
`full-2026-10-06/social-rolling-variety-400-combined-summary.json` under the same
ignored benchmark directory. Its `strictCertificationStatus` must be `passed`;
the raw report's score-validation marker alone is insufficient.

The decision criterion is not met: short-session performance is preserved but
not improved. Production adoption remains held. A is suitable for a subsequent
review of whether preserving that horizon while repairing later recurrence is
worth its measured long-run rest cost; B does not establish a reason to replace
the existing relationship gate with 3:2:1:1 gain.
