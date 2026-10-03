# Matchmaking v3

Social maximizes fair, organic rotation variety. Balanced maximizes the same
variety inside an explicit balance envelope. Both use `socialBatch.ts` for
single courts, global batches, player groups, interclub, reshuffles and player
replacement. Level Match uses the separate ladder matcher.

## Priority policies

Legality, busy/paused availability, mandatory retained players and hard format
constraints are enforced before ranking. Shared priorities are effective match
counts, arrival priority, applicable structural schedule rank, then starvation.

Social then ranks entropy, enabled ordinary rest, actual team balance, its
existing late recent-repeat ties, exact rematches and seeded randomness.
Balanced then applies a fixed balance envelope and ranks entropy, enabled
ordinary rest, actual worst/total balance, Points point-difference balance,
exact rematches and seeded randomness. Consecutive-play burden is diagnostic.

## Shared variety and starvation

`socialVariety.ts` is the single definition of variety. It measures changes in
normalized lifetime Shannon entropy for courtmates, partners, opponents and,
with Mixed pairing, MIXED versus OWN_SIDE experiences. Feasible facets have
equal scale; a facet with fewer than two opportunities contributes zero.
Negative gains are valid. There are no Mixed percentages, debt or obligations.

Opportunities use the full unpaused roster, including busy and queued players,
and obey pairing, player-group and club restrictions. Temporary rest and court
occupancy do not shrink the vocabulary. Paused players keep their history;
resuming or adding players expands feasible opportunities naturally.
Completed and committed active/queued/manual games count once. Assignment-time
Mixed-side snapshots survive queue activation. Undo, cancellation and
replacement remove reservations; legacy unclassifiable games still contribute
interpersonal history.

The expected completed-match rest gap is `max(0, ceil((N - 4) / 4))`, using the
full unpaused roster size. Available players above it are overdue. Before
entropy or balance, minimize overdue players left out, their highest wait,
then their total wait. This remains enabled when ordinary rest is disabled.
Neutral entry/resume baselines preserve the existing no-catch-up behavior.

## Balance admissibility

`balanceGuardrail.ts` contains the format policy. Balanced search first finds
the strongest feasible fairness/arrival/schedule/starvation class and its
lexicographic minimum `(maxBalanceGap, totalBalanceGap)`. It then freezes the
envelope and searches whole batches for the best entropy within it.

Points admits `maxBalanceGap <= bestMaxBalanceGap + 1.5`. Rating admits
`maxBalanceGap <= min(50, bestMaxBalanceGap + 30)`. The Rating window adapts the
previous 30-rating rematch tolerance; it is deliberately separate from the
absolute 50 ceiling. Both limits are explicit configurable policy inputs.
The windows include the boundary. No pairwise tolerance comparator is used.
Total gap is secondary actual balance quality after entropy/rest; several good
courts cannot conceal a court outside the worst-gap envelope.

If Rating's stronger class cannot meet 50, fairness and starvation still win:
only its best achievable worst gap and total gap are admitted. Debug/reason
output exposes this unavoidable-ceiling fallback. A prettier match from a
weaker starvation or fairness class cannot set the baseline.

## Search and diagnostics

Balanced retires the old candidate caps, rest tie zones, quartet exemplars,
anchor locks and repeat/coverage pruning. Every legal partition remains visible
to entropy. Small one/two-court decisions with at most fourteen available
players are exhaustive by default. Larger decisions use bounded global search
and admissible pruning, with separate 50,000-branch / two-second budgets for
baseline and entropy passes. Baseline scoring defers entropy, and collapses
only worse-balanced partitions of an identical quartet; the entropy pass
restores every admissible partition. A Balanced timeout may return an incumbent only when
fairness, schedule, starvation and the balance baseline are certified; otherwise
it reports a search limit. It never grants an unproven envelope or falls back
to greedy courts. Diagnostics distinguish incomplete entropy optimization.

Balanced entropy uses fixed 1e-12 score buckets for transitive effective ties;
Social retains its existing exact score ordering. Raw total/facet gains remain
available. Debug and persisted reasons expose fairness, starvation, baseline,
allowed gap, chosen gap, entropy facets and whether a final exact-rematch,
seeded-random or deterministic tie decided the result.

The old `mixedVariety.ts` target/debt engine is removed. Shared-court repetition,
partner/opponent coverage and recent repeats no longer influence Balanced.
Exact rematches remain a late literal-layout tie-break. Social's existing late
repeat ties and opportunity semantics remain unchanged.

Player-group seat compositions and crossover schedule ranks remain stronger
structural rules. Balanced no longer uses personal crossover debt or elapsed
wait vectors to narrow equally fair selections; shared entropy decides those
ties. Level Match retains its separate group-selection policy.

Observed rest bounds remain subject to stronger count fairness and legality:
asynchronous 7/7 Mixed simulations can defer a player for five completed-court
events when Mixed parity prevents their inclusion in the fairest count class.
An independent legal oracle verifies starvation is optimal inside that class.
