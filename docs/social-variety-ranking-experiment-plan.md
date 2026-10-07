# Plan: use corrected Social Variety gain to select matches

Status: proposed experiment; implementation and simulations have not started.
This extends the local gate-only experiment documented in
`social-variety-experiment.md`. Production defaults stay unchanged.

## Question and hypothesis

Does choosing an admissible batch by its predicted improvement in completed-only
`(3C + 2O + P + T) / 7` improve the normal 21-completion experience over choosing
by lifetime entropy? Does combining that ranking with Candidate A's rolling-type
gate improve recurrence without an unacceptable rest cost?

The prior gate-only candidates produced identical first-21 layouts to baseline.
They repaired later recurrence but increased long-run back-to-back assignments.
That is motivation for this test, not evidence that changing ranking will help.

## Controlled policies

| Policy | Replay/coverage gate | Primary variety ranking after admission |
|---|---|---|
| Baseline | Production legacy gate | Existing lifetime entropy |
| A | Existing relationship gate plus rolling T | Existing lifetime entropy |
| C | Production legacy gate | Signed corrected KPI gain |
| D | A's rolling-T gate | Signed corrected KPI gain |

C versus Baseline isolates ranking. D versus A isolates ranking under a rolling
gate. D versus C isolates the gate when ranking is fixed. The previous Candidate
B remains a reference result; adding it to this main matrix would not isolate
the requested ranking change.

Implement a separate benchmark-only ranking option. Do not overload the gate
metric, change production defaults, or enable an application caller.

## Exact ranking rule

Keep legal eligibility, availability, mandatory players, fairness/arrival and
schedule priorities, starvation protection, Balanced's frozen admissibility
envelope, and certified replay/coverage admission unchanged for each gate arm.

For every admitted complete batch, predict the completed KPI after appending
that batch's matches to the selected players' completed histories. Rank by:

1. The existing stronger priority class and gate admission.
2. Greatest signed change in the roster's mean corrected KPI.
3. Existing lifetime entropy, as a tie-breaker.
4. Existing soft-rest, balance and subsequent tie-breakers, in their current order.

Choose player sets, team partitions and match types jointly. Selecting the four
players with the lowest current score would not measure the benefit of their
actual possible match together. For two courts, optimize the whole disjoint batch.

C/O/P retain the existing capped distinct relationship coverage definitions and
structural denominators. They do not become rolling relationship windows. T uses
each player's latest six completed appearances. Score expiry as well as recovery:
when an older type leaves the window, a candidate can have a negative T delta.
Unselected players' scores do not change at assignment.

Build the ranking's history from completed matches only. Active matches remain
part of the existing availability/replay handling, but earn no completed KPI
credit. The full structural roster and session rules determine opportunities;
busy status, rest and the temporary Balanced envelope must not shrink them.
Use the existing empty-facet renormalization. Do not introduce ratios, quotas,
per-player debt, additional weights or forecasts of active-match completion order.

This inserts an objective above the existing soft-rest tie-breaker, so retaining
rest admission rules does not guarantee identical rest outcomes. Measure the cost.

## Implementation and correctness checks

- Reuse the signed 3211 scorer with a dedicated completed-only ranking context.
  Keep gate and ranking values separately named and separately reported.
- Update candidate ordering, batch comparison, cached scores, optimistic bounds,
  pruning, metric positions and tie-frontier handling together. Entropy bounds
  alone cannot certify the new primary objective. Keep exact rational comparisons
  for KPI gain, including zero and negative gains.
- Build a separate small-roster exhaustive oracle that enumerates legal batches,
  independently recomputes before/after KPI and verifies the full priority order.
  Check varied histories, two courts, signed expiration, singleton/empty feasible
  type sets, balance restrictions and batches where individual greedy choices fail.
- Extend the benchmark's independent selection audit to certify the new ranking,
  rather than assuming the old entropy optimum is still the correct winner.
- Require default-policy layouts and metrics to reproduce the existing baseline
  fixtures. Run relevant matcher/API regression tests, TypeScript, lint and diff
  checks. Search-limit or incomplete-oracle results are inconclusive, not passes.

## Staged runs

1. **Pilot:** seed 1, all three formats, all four policies, exactly 21 completions.
   Validate objective and gate certificates, completed-only recomputation, and
   baseline reproduction. Fix correctness problems before interpreting results.
2. **Primary paired comparison:** 14 players, 7/7 sides, two asynchronous courts;
   seeds `1, 4729, 104729, 130363, 2097593`; Social, Balanced Points and Balanced
   Rating/Elo. Run all four policies from one frozen source snapshot to 400
   completions, with independently verified checkpoints at exactly 21/100/400.
   This is 60 sessions. The 21-completion checkpoint remains primary.
3. **Confirmation if promising:** register 20 additional deterministic seeds
   before inspecting them. Compare baseline and the strongest qualifying candidate
   at 21 completions across all formats. Do not select or tune on these seeds.
4. **Generality if promising:** test uneven 10/4 and 12/2 rosters, narrow/wide
   strength profiles, one/two courts, arrivals and pauses/reactivation. Include
   asymmetric feasible type sets and structural-feasibility edge tests. Broader
   runs need complete certificates before supporting an adoption recommendation.

Use identical external completion schedules and initial seeds. Record layouts,
randomness provenance and source hashes; policy divergence can change internal
random consumption. Freeze inputs before measured runs and write fresh artifacts.

## Report and decision

At 21, show corrected KPI, C/O/P, old 321 score, unique relationship counts, T,
fractions at T=1/0.5/0, per-player windows and match-type counts. Show paired
candidate-minus-control differences per seed, win/tie/loss counts, means and
worst regressions by format. Five seeds are a screening sample, not a broad
statistical guarantee. Players within a session are not independent replicates.

Show back-to-back rate, p95/max assignment rest, count spread, starvation
interventions, replay allowance usage, Balanced admissibility and all proof
failures. Also record search time, branches and certification rates: an objective
that is too expensive to certify is not ready for production.

At 100/400, report T over time, single-type six-appearance windows, longest
per-player runs without each feasible type, final-100 global match-type counts,
per-player recent relationships/cohorts, and rest/starvation costs. Good coverage
does not require a 50/50 split. Finite runs cannot prove universal non-extinction.

Use a conservative screening rule: require a positive mean 21-match KPI change
in every format, with no mean regression in any C/O/P component, the old 321
score, back-to-back rate, p95 rest or maximum rest. Show individual-seed tradeoffs
even when means pass. Require all stronger-priority certificates to pass and
long-run recurrence to improve without hiding rest costs. This stricter screen
avoids inventing an unapproved tolerance for 'material' regressions. A candidate
that fails it can still be reported as a tradeoff; it is not an automatic adoption.

Confirm the result on held-out seeds and broader scenarios before recommending a
production policy. No improvement, a component/rest tradeoff, or an uncertified
search are valid experiment outcomes. Keep production unchanged and do not push
matcher-policy changes to main as part of this experiment.

## Delegation when execution is requested

Use the user's requested Luna Max agents. One owns the benchmark-only ranking
implementation and focused correctness tests; one owns the independent oracle,
benchmark integration and certification; one owns the runner, paired reports and
diagnostics. The orchestrator freezes the design, assigns non-overlapping files,
reviews the objective/pruning, controls measured runs, and makes the recommendation.
