# Level Match implementation plan

Status: implemented and verified locally. Production delivery is verified separately.

## Intended behaviour

Level Match should select games between players close in the chosen metric,
with reasonably balanced teams and fair court time. Both variants use the same
selection policy:

- Rating: use the existing applicable saved player rating.
- Session points: retain the current completed-match Level point derivation
  and existing neutral late-entry/resume behaviour.
- Variety has no influence, including in ties. Repeated partners, opponents,
  quartets and exact matches are acceptable. Do not add coverage, entropy,
  recurrence or repeat penalties.

The existing hard pairing, player-group/crossover, retained-player, skip-next,
busy and paused rules still apply. Configured group scheduling is a constraint,
not an invitation to introduce automatic variety scoring.

## Measurements and selection order

Use one numeric skill input per player, selected by `balanceMetric`.

- Team balance: absolute difference between the two team averages.
- Level spread: highest minus lowest value among the four players.
- Level refinement: sum of the six absolute player-to-player differences.

All balance thresholds use team-average units. The current Level engine uses
team totals for its primary balance gap; convert consistently rather than
copying thresholds into the old units.

Selection proceeds in stages, rather than combining unrelated weighted scores:

1. Establish the strongest feasible class under hard constraints, court-time
   fairness, arrival priority and excessive-wait protection.
2. Find the best achievable team balance inside that same class, and freeze
   its admissible balance envelope.
3. Among admitted games, minimise level spread, then pairwise level differences.
4. Prefer better team balance after those level metrics tie. Session-point
   score-margin refinement may follow; rating games must not use session
   results as an extra skill objective.
5. Apply ordinary rest preference when enabled, then a seeded or stable neutral
   tie-break. Assignment history must not influence this tie-break.

Use Balanced's existing numerical guardrail as the initial policy:

| Metric | Admitted team-average gap |
| --- | --- |
| Rating, best achievable gap at most 50 | At most `min(50, best gap + 30)` |
| Rating, best achievable gap above 50 | Best achievable gap only |
| Session points | At most `best gap + 1.5` |

The allowance makes room for closer player levels. There is no variety stage.
Validate these starting limits against the representative cases below before
settling the implementation; do not add public tuning controls.

For multiple courts, establish the balance baseline across the whole disjoint
batch: minimise worst-court balance gap, then total balance gap. Use the same
envelope for the entire decision. If the rating ceiling is unattainable, retain
both the best worst-court and best total balance requirements, as Balanced does.
Rank admitted batches by worst-court level spread, total pairwise level
differences, worst-court balance gap and total balance gap. Apply the remaining
ties consistently with single-court selection.

No independent per-court baseline, or later fallback, may silently widen the
frozen batch envelope. A better level fit must not bypass fairness or exclude an
overdue player indefinitely.

## Implementation sequence

### 1. Resolve the metric explicitly

In `src/app/api/sessions/[code]/generate-match/selection.ts`, stop using the
legacy session type alone to determine Level's skill input. Pass an explicit
Level policy derived from `getSessionSettings(...).balanceMetric`.

Extend rating retrieval to Level + Rating, reusing the applicable current
rating-source rules, including existing guest and club/global handling. Refresh
the input at each new selection. Preserve existing point derivation for the
session-points variant. Neither variant should accidentally import the other metric.

Keep the legacy session-type dispatch and persistent data compatible. Existing
legacy `LADDER` sessions retain their wins-minus-losses behaviour; the new Level
policy applies to the `RACE` path used by current Level Match settings. Cover
that boundary with a regression test rather than rewriting old sessions.

### 2. Add a shared Level policy in the existing matcher

Add a small pure policy module under `src/lib/matchmaking/ladder/` for the chosen
metric, consistent measurements, balance admissibility and comparison order.
Reuse the existing pure balance-guardrail calculations where practical; do not
route Level through Balanced's recurrence engine.

Update `types.ts`, `balance.ts`, `ladderGrouping.ts` and `scoring.ts` to consume
that policy. Keep legacy ladder behaviour isolated. Move session point-difference
refinement behind the primary level and team-balance objectives. Remove Level's
soft preference for same-side courts ahead of balance; retain hard Mixed and
player-group legality rules.

Reuse Balanced's overdue-player protection where feasible. Apply it before
quality ranking, including when ordinary rest preference is disabled. Preserve
neutral entry and skip-next semantics.

### 3. Apply the policy to every automatic path

Update single-court and global batch selection, then the grouped-plan comparison
in the API adapter. The grouped path currently has its own Level metric vector;
it must use the same summaries and frozen envelope as ordinary batches.

Cover creation, asynchronous refill, automatic queue generation/rebuild,
reshuffle and replacement through their existing shared selectors. Replacement
keeps its mandatory retained players and establishes feasibility within those
constraints. Already queued lineups keep their existing stored assignment until
an existing rebuild/reshuffle action requests a new decision.

Explicit host reshuffling may request an alternative; this is not automatic
repeat avoidance. Search alternatives under the original decision's fairness
and balance envelope. If none exists, retain the current controlled
no-alternative result instead of accepting an unsafe alternative.

Keep current practical search budgets. Baseline and final selection must use the
same eligible candidate set, selected metric and hard constraints. Candidate
compression must preserve mandatory and overdue players and account for the
selected metric. Bounded results must not claim proven global optimality; a
fallback must remain legal and inside its established envelope, or return the
existing controlled search failure. Do not build a new search framework.

### 4. Add focused behavioural coverage

Use existing matcher and route test harnesses. The essential cases are:

- With equal eligibility, both supplied examples have zero team imbalance, and
  the quartet with spread 200 beats the quartet with spread 800.
- Switching Rating/Session points changes the chosen game when their player
  orderings disagree. Rating values reach the real matcher instead of zero.
- A slightly wider quartet wins when the tighter quartet violates the balance
  envelope; exercise the exact inclusive boundary and impossible-rating-cap
  fallback, including whole-batch total balance.
- Point difference cannot override better primary level/team-balance results.
  Rating mode does not use point difference to rank skill.
- Changing only partner/opponent/quartet/rematch history leaves the decision
  unchanged with the same random seed and fairness/rest state.
- A lone skill outlier, late joiner and resumed player still receive fair turns.
  Exercise rest enabled/disabled and retained-player replacement.
- Single court, batches, Mixed, player groups, queue rebuild and explicit
  reshuffle enforce the same policy and preserve legal composition.
- A small exhaustive batch oracle checks the chosen decision against the
  documented order. A few representative larger cases check practical search
  behaviour and controlled limits.

Reuse passing unchanged Balanced/Social checks; add focused isolation coverage
for any shared helper changes. No broad new benchmark programme is required.

### 5. Verify and prepare delivery

Update the relevant Level documentation and existing debug summaries to report
the selected metric, level spread, actual balance, allowed balance and any
unattainable ceiling or search limit. Keep this in existing diagnostics; no new
public explanation panel is needed.

Run the affected tests, relevant lint and a normal application build. Before
writing application code, read the relevant installed Next.js guides required
by `AGENTS.md`. Perform a brief local check of both settings and the main
generation/queue/reshuffle flows.

This is an application-only change with no planned schema migration, data
rewrite or downtime. Deployment is a separate delivery step; after an
authorised deployment, check important live flows and fresh runtime logs.

## Implementation notes

- `src/lib/matchmaking/ladder/levelPolicy.ts` contains the metric, grouping and
  comparison policy. `levelSelection.ts` runs the shared schedule-wide baseline
  and quality search. Legacy ladder calls remain available without that policy.
- The application resolves current Level Match (`RACE`) explicitly in the API
  adapter. Rating retrieval reuses the existing source policy; session points
  retain neutral entry handling and include recorded best-of-three winners.
- Grouped plans retain the configured crossover/seat rules, while personal
  crossover debt and physical-court repeat preferences do not rank Level games.
- The shared selector allows two seconds for candidate preparation plus the
  fairness/balance baseline, followed by up to two seconds for final ranking,
  with a four-second invocation cap and one 200,000-branch total allowance.
  An explicit `searchLimits.maxMs` remains an overall cap; an earlier caller
  deadline always wins. Small exhaustive cases are exact. A certified baseline's
  actual batch seeds final ranking, so a final-ranking interruption can return
  that admitted batch even before any quality-search branch is explored.
  `searchLimitReached` records interrupted ranking without claiming globally
  optimal quality. An uncertified baseline still returns a controlled failure.
- Player overlap and mandatory checks use arbitrary-width bit masks. Request-local,
  bounded caches reuse player-set priorities, optimistic completion bounds and
  compatible candidate scans. Incumbent-dependent balance pruning is evaluated
  against the current incumbent, separately from those caches. Quality bounds
  are calculated only in final ranking. Identically constrained courts use a
  canonical quartet order without forcing any surplus player to participate.
  A legal batch reaching independent global fairness and zero-balance lower
  bounds certifies the baseline immediately. Every eligible player and legal
  quartet remains available; there is no roster cap, shortlist or new matcher.
- Internal batch debug data includes `searchLimitPhase` and `phaseElapsedMs`
  for preparation, baseline and quality ranking. Public API and UI are unchanged.
- Internal `source: "level"` JSON stores the selected metric, lineups, level
  spread, baseline/allowed/actual balance, ceiling feasibility and search status.
  Existing queue and match writers preserve it. The existing public V3 reason
  parser/modal is unchanged; these Level diagnostics are internal.
- A one-line existing join-test response helper was corrected to accept its
  HTTP status argument, allowing the normal full TypeScript check to run.

Verification covers policy fixtures and independent exhaustive eight/nine-player
oracles, a source review with 90 additional small random oracle comparisons,
metric-input tests, actual selector adapter tests, legacy/group regressions and
both metrics through the real API plus an isolated temporary SQLite queue
lifecycle. Representative 14/18/24-player bounded searches returned legal
guardrail-admitted games; some larger final rankings reached their limit.

The focused policy, adapter, scoring, group and queue checks passed. Full
TypeScript checking, affected-file ESLint, diff whitespace checks, the normal
Next.js build and validation of the updated delegation skill passed. The
implementation phase performed no production deployment, database migration or
data write. No schema migration is required for delivery.

The batch-reliability follow-up freezes the previously timing-out 21-player,
three-court Rating fixture and checks additional irregular ratings, equal and
evenly spaced controls, nearby roster sizes, three-court exhaustive comparisons,
surplus-player/court symmetry, player masks above index 31, priority changes and
interrupted phases. In an isolated local comparison, the original selector
failed at about 1.5 seconds; the updated selector completed both passes in
0.34–0.40 seconds across five runs. These are measurements, not timing assertions
or a guarantee for every roster. A local production-build browser check also
created three disjoint courts and an automatic queue, verified stored Level
diagnostics, reloaded the page and rebuilt the queue against temporary SQLite.
