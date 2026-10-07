# Exact search notes for courtmate beneficial rescue

The `courtmate-beneficial-rescue` policy keeps the same candidate legality,
fairness, schedule, and starvation ordering. Its only search change is a set of
admissible bounds inside the opt-in policy path. The default Social matcher,
Balanced, `courtmate-first`, and `courtmate-near-best` do not use these bounds.

The current frozen matcher is SHA-256
`3fac6611ba7d116aab040b36e2f5e13b9ddfd1cbdd5d81f43d5051c83294ceb7`.
The pre-optimization control is SHA-256
`40538cb672c3a8cef256192b114dffb28bc853f8c1aa28790af40775f79b64e6`.
The source paths are [socialBatch.ts](../src/lib/matchmaking/v3/socialBatch.ts)
and [socialFrontierSearchBounds.ts](../src/lib/matchmaking/v3/socialFrontierSearchBounds.ts).

## Objective and certification

The first pass finds the strongest fairness, schedule-rank, and starvation
class, then certifies maximum completed-history courtmate gain `Gmax` and the
maximum signed rolling match-type gain `Tmax` among batches at `Gmax`. The
frontier considers every feasible player set in that class. For this pass only,
partitions with the same quartet mask have identical courtmate gain; the
search retains the partition with greatest `T`, since team layout affects the
match type but not the quartet’s six courtmate pairs.

The final pass admits a batch with `G = Gmax`, or with `G = Gmax − 1` only when
its exact signed `T` is strictly greater than `Tmax`. The unchanged comparator
then ranks admitted batches by signed `T`, raw `G`, ascending leximin
court-mate coverage, replay and soft cadence, new partner/opponent exposure,
relationship entropy, and the existing late penalties and tie breaks. The
admission predicate and comparator are in
[socialBatch.ts](../src/lib/matchmaking/v3/socialBatch.ts#L53).

The result is fully priority-certified only if both passes finish. A branch or
time limit in either pass leaves the priority result uncertified; a selection
may still be returned for diagnostics. This is enforced when the frontier and
selection phases set their completion flags and when `varietyOptimal` is
computed ([socialBatch.ts](../src/lib/matchmaking/v3/socialBatch.ts#L2196),
[socialBatch.ts](../src/lib/matchmaking/v3/socialBatch.ts#L2369)).

## Admissible bounds

The search prunes only when the best relaxed completion is strictly worse than
the incumbent. Equality stays searchable so the existing random and
side-balanced tie handling can see every distinct tied layout.

- **Court-mate gain.** Every new undirected courtmate pair contributes one
  endpoint gain to each of its two players. For each player, the bound takes
  their greatest possible gain on any remaining court, excludes already-used
  players, selects at most four players per remaining court, sums those
  endpoint gains, and divides by two with floor. This relaxes both court
  legality and overlaps between future courts, so it cannot understate the
  achievable pair count.
- **Rolling match-type gain.** For each remaining court, the bound uses its
  greatest exact signed `T` over the candidate list and adds those maxima to
  the chosen candidates’ `T`. It allows overlapping future candidates, which
  can only make the bound more optimistic. Frontier pruning applies the `T`
  bound only when the court-mate upper bound cannot exceed the incumbent `G`.
- **Leximin coverage.** The profile helper gives each still-available player
  their maximum one-court gain from the remaining candidate lists, then allows
  at most four upgrades per remaining court. It upgrades the lowest current
  fractions first; for equal starting fractions it chooses the greatest
  attainable endpoint. Exchanging an upgrade from a higher starting fraction
  to a lower one improves an earlier sorted order statistic; for equal starts,
  the larger endpoint gives the better sorted profile. This is the exact
  optimum of the relaxed subset problem, using integer cross-products for
  fraction comparisons. Selected and otherwise unavailable players remain
  fixed, and the profile keeps the full structural opportunity denominators.
- **Replay and cadence.** The replay lower bound assumes any remaining
  positive-rest players can fill the open slots. The soft-cadence bound fills
  those slots with the greatest remaining rest values. Both relax the future
  court assignment and therefore are optimistic.
- **Partner/opponent breadth.** Each remaining court contributes its maximum
  candidate exposure count independently. Future court overlap is ignored,
  making these sums upper bounds.
- **Relationship entropy.** For each remaining court and each facet, the
  bound takes the largest facet gain in that court’s candidate list. It then
  canonical-sums the chosen facet values together with each remaining court’s
  separate maximum, followed by the same canonical sum over the three
  relationship facets as the batch scorer. Coordinate-wise maxima dominate
  every feasible completion; sorting and finite IEEE additions are monotone
  under that domination. Keeping the nested grouping avoids reassociating the
  floating-point batch sum.
- **Late penalties and balance.** Per-court minimum penalties and balance gaps
  are lower bounds; maximum-gap fields use the maximum of the chosen gaps and
  per-court minima. A small downward roundoff allowance is subtracted only
  from floating penalty lower bounds. Once all earlier optimistic objectives
  tie the incumbent, a remaining candidate whose `balanceGap` is strictly
  greater than the incumbent maximum cannot win. Equal-gap candidates remain.

For identical physical courts in the three-court beneficial-rescue path, the
matcher keeps the first canonical candidate-ordinal ordering and skips only
its permutations. This removes duplicate batches without collapsing distinct
team layouts or objective ties. The two-court path retains its existing
canonical `b > a` ordering. These symmetry rules are guarded by the opt-in
policy and identical court constraints.

## Verification

The relaxed profile helper was compared with exhaustive subset enumeration
over unequal denominators and fixed players. The frozen-control contract suite
compares selected outputs, including side-balanced ties, against the original
engine snapshot; the differential audit reported 160 comparisons with no
mismatches. TypeScript and the focused frontier/beneficial-rescue tests passed.

The new materialized oracle enumerates all 81 legal unordered two-court layouts
for each of three eight-player 4/4 history fixtures (243 candidate layouts in
total). It independently recomputes each batch’s uncapped courtmate gain and
exact signed rolling-`T` units, compares the full `Gmax−1` admission set against
the strict predicate, and checks every candidate pair’s `T`-then-`G` order
against a separate comparator. The independent benchmark audit agrees on
candidate/admitted counts, `Gmax`, `TmaxAtGmax`, and the selected primary
objective. The fixtures cover a positive rescue, a rescue tied at `Tmax`, and
recovery from a negative `Tmax`.

Eight additional tracked fixtures compare the complete selected-batch
projection with the original frozen control: positive, tied, and negative
signed-`T` histories; arrival/fairness with a locked player; overdue
starvation; schedule rank; and side-balanced zero and nonzero salts. The
projection includes the full winning court/partition layout, selected metrics,
certificate flags, and late tie values. Its provenance is pinned to original
engine SHA `40538cb6…b64e6`, control dependency-manifest SHA
`4e2a366d…9537b`, and current engine SHA `3fac6611…4ceb7` in
[`socialCourtmateBeneficialRescueControl.json`](../src/lib/matchmaking/v3/socialCourtmateBeneficialRescueControl.json).

A direct unlimited-control comparison also completed for the legacy 16-player,
two-court opening. Both searches certified and returned the same full
projection: the optimized matcher explored 6,559 branches in about 307 ms;
the frozen original explored 3,950,156 branches in about 5.8 seconds. The
legacy 18-player, three-court original-control run did not finish within its
90-second diagnostic cap. The detached process group received `SIGTERM` and
then `SIGKILL`, and the post-run process check found no orphan. This is
inconclusive for old-versus-new full-winner equivalence at 18/3, not evidence
of a mismatch. The complete hash-pinned record, including the 16/2 winner
projection and 18/3 timeout status, is in the ignored
[`exactness-diagnostic-results.json`](../benchmarks/generated/social-frontier-scalability/control/exactness-diagnostic-results.json).

These checks are finite exhaustive enumerations and differential fixtures,
not a universal formal proof. The 18/3 original-control comparison remains
open because its exhaustive reference exceeded the practical diagnostic cap.

Default-budget one-match openings for seeds `1`, `4729`, and `104729` all
finished with full priority certificates. At 16 players over two courts, the
search explored 6,555–6,562 branches and took 248–305 ms. At 18 players over
three courts, it explored 45,736–45,777 branches and took 1,486–1,538 ms. Each
16-player opening proved `Gmax = 12`, `Tmax = 4`; each 18-player opening proved
`Gmax = 18`, `Tmax = 6`. These opening probes confirm the required exact search
fits the existing 50,000-branch and 2-second phase limits for those seeds and
sizes; they do not establish the same runtime for every later-history state.

## Production-hardening additions — 7 October 2026

The following changes apply only to the opt-in beneficial-rescue search. They
do not change its comparison order, admission predicate, default phase budgets,
or the ordinary Social/Points/Elo search branches.

**Strict partition dominance.** Candidates are compared only within one
physical court/profile and an identical selected-player mask and exact signed
T gain. A replacement therefore preserves eligibility, locks, disjointness,
fairness, schedule, starvation, replay and soft cadence. A provable strict
improvement in the first differing G/C-profile/P/O layer wins before all later
tie-breakers. Where those layers tie, the filter requires coordinatewise
non-worsening entropy facets, penalties and gaps, plus a provably strict gap
sum improvement. Per-player C dominance implies sorted leximin dominance;
canonical finite sums are monotone under coordinatewise improvements.

For `n > 1` gap terms, strictness requires the addend decrease to exceed
`2 * gamma * S`, where `gamma = n*EPSILON/(1-n*EPSILON)` and `S` bounds the
absolute sum of all possible court gap addends. This is deliberately looser
than the usual unit-roundoff bound. A single term compares directly. Equality,
non-finite bounds, and numerically ambiguous improvements remain visible to
the full comparator. The non-additive salted batch hash and side-balanced
minima cannot justify dominance and are never used to remove tied candidates.

**Compatible completion bounds.** Remaining court candidate sets can exclude
already-selected players and candidates forbidden by the existing canonical
court-order rule. Every valid continuation remains in these sets. The remaining
G upper bound is the minimum of the endpoint relaxation and the sum of each
remaining court's maximum raw new-C gain. Both relax cross-court overlap and
therefore independently upper-bound legal completions. Per-court exact signed
T maxima also remain upper bounds when all are negative; clamping them to zero
is unnecessary. Compatibility lists and their bounds are cached per list and
selected-mask/canonical-order state without merging distinct search states.

**Lazy frontier scoring.** The first pass requires only the stronger class and
G/T frontier. Deferring entropy materialization and full late-priority sorting
until the final pass does not remove a G/T possibility. Retained final-pass
candidates receive their complete scores before the unchanged comparator runs;
rank caches are cleared before that sorting. Random draw consumption is
unchanged.

**Independent 18/3 evidence.** The separate test in
[`socialFrontier18ThreeCourtExactness.test.ts`](../src/lib/matchmaking/v3/socialFrontier18ThreeCourtExactness.test.ts)
enumerates 3,348 legal opening courts and the complete exact-zero balance
frontier: 206 court layouts and 32,107 unordered disjoint triples. It derives
the constant fresh-state class/G/T/C/P/O/entropy/replay layers independently,
then independently hashes the complete remaining frontier for all three audit
seeds. It also enumerates all 18 legal first-refill layouts in each seed
history and checks the primary frontier and final winner. This establishes
the tested combined-score unordered winners without rerunning the unlimited
old engine. It is not a proof for arbitrary histories, side-balanced salts,
or every physical-court ordering. See the hardening results for measurements
and remaining limits.
