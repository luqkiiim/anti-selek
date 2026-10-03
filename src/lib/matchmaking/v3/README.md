# Matchmaking v3

Social maximizes fair, organic rotation variety. Balanced maximizes the same
variety inside an explicit balance envelope. Both use `socialBatch.ts` for
single courts, global batches, player groups, interclub, reshuffles and player
replacement. Level Match uses the separate ladder matcher.

## Priority policies

Legality, busy/paused availability, mandatory retained players and hard format
constraints are enforced before ranking. Shared priorities are effective match
counts, arrival priority, applicable structural schedule rank, then starvation.

After those priorities tie, Mixed sessions compare match-type entropy first.
They then minimize the number of selected players with zero completed-match
rest, compare relationship entropy (courtmates, partners and opponents), and
use the ascending rest-turn vector as a soft tie-break when relationship
entropy is tied. In MEXICANO, where there is no match-type facet, zero-rest
count comes before relationship entropy. Social then compares actual team
balance, its existing late recent-repeat ties, exact rematches and seeded
randomness. Balanced first establishes its fixed balance envelope inside the
strongest rotation class, then applies the same mode-aware entropy/cadence
layers inside that envelope before actual worst/total balance, Points
point-difference balance, exact rematches and seeded randomness.
Consecutive-play burden is diagnostic.

The zero-rest count and soft rest vector compare the whole selected set for a
refill batch. `restTurns === 0` counts as an immediate replay. The later soft
vector maximizes the ascending sorted completed-match rest turns
lexicographically: maximize the lowest rest, then the next-lowest, and so on.
Total rest is not an objective. Social compares each entropy layer exactly;
Balanced uses its fixed 1e-12 score bucket independently for match-type and
relationship entropy. `respectPlayerRest: false` disables both cadence layers,
while starvation protection remains enabled. In Mixed sessions a stronger
match-type gain can outrank fewer immediate replays; among effectively tied
type gains, the matcher minimizes zero-rest selections before optimizing
relationships. Structural opportunity coverage continues to report feasible
relationships regardless of the choices admitted by the balance envelope.

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
cadence, entropy or balance, minimize overdue players left out, their highest
wait, then their total wait. This remains enabled when ordinary cadence is
disabled. Neutral entry/resume baselines preserve the existing no-catch-up
behavior.

## Running the relationship-coverage benchmark

Run the full deterministic asynchronous benchmark manually with:

```sh
npm run benchmark:matchmaking
```

The default run uses five narrow-profile seeds (`1, 4729, 104729, 130363,
2097593`) for Social, Balanced Points and Balanced Rating/Elo, plus three
wide-profile sensitivity seeds (`30011, 65537, 999983`) for the two Balanced
formats. It uses the same 14-player 7/7 roster and seeded court-completion
schedule across formats. Each run records checkpoints after exactly 20 and 400
completed matches; unfinished active assignments do not count toward coverage.
All match point differences are zero because these runs measure matchmaking,
not match outcomes. The full run writes
`benchmarks/social-coverage-full-current.md` and
`benchmarks/social-coverage-full-current.json`.

Variety Coverage Score measures whether distinct relationships have occurred:
for each player and facet, it divides experienced feasible courtmates,
partners or opponents by that facet's structurally feasible opportunities.
The player's relationship score is the equal-weight mean of the facets with
opportunities; the session score averages those player scores. The opportunity
sets use the same structural vocabulary as Social entropy and do not shrink to
relationships admitted by a Balanced guardrail. A facet with zero opportunities
has no score and is excluded from its means. A singleton facet is meaningful:
it counts as 0% until its sole feasible relationship occurs, then 100%.
Normalized Shannon entropy is reported separately because it measures how
evenly repeated experiences are distributed; entropy omits facets with fewer
than two possible experiences, so a singleton can affect coverage without
entering entropy. MIXED and OWN_SIDE coverage are also reported separately and
do not contribute to the relationship score.

Use `--pilot` for the one-narrow-seed smoke run. `--seeds` and `--wide-seeds`
accept comma-separated seed lists and override the corresponding defaults. For
example:

```sh
npm run benchmark:matchmaking -- --seeds 1,4729,104729 --wide-seeds 30011,65537
```

To compare against a previously saved report, pass `--baseline-json <path>`.
To generate a baseline report from an explicit worktree, pass
`--baseline-worktree <path>`; the worktree must contain the benchmark test and
measurement files. `--skip-baseline` runs only the current engine, and
`--out-dir <path>` changes the output directory. The long benchmark case is
skipped in the normal Vitest/CI run and is enabled by this script.

## Balance admissibility

`balanceGuardrail.ts` contains the format policy. Balanced search first finds
the strongest feasible fairness/arrival/schedule/starvation class and its
lexicographic minimum `(maxBalanceGap, totalBalanceGap)`. It then freezes the
envelope before searching whole batches. In Mixed sessions, match-type entropy
is followed by zero-rest count, relationship entropy and soft rest; in
MEXICANO, zero-rest count precedes relationship entropy and soft rest.

Points admits `maxBalanceGap <= bestMaxBalanceGap + 1.5`. Rating admits
`maxBalanceGap <= min(50, bestMaxBalanceGap + 30)`. The Rating window adapts the
previous 30-rating rematch tolerance; it is deliberately separate from the
absolute 50 ceiling. Both limits are explicit configurable policy inputs.
The windows include the boundary. No pairwise tolerance comparator is used.
Total gap is secondary actual balance quality after entropy and soft cadence;
several good courts cannot conceal a court outside the worst-gap envelope.

If Rating's stronger class cannot meet 50, fairness and starvation still win:
only its best achievable worst gap and total gap are admitted. Debug/reason
output exposes this unavoidable-ceiling fallback. A prettier match from a
weaker starvation or fairness class cannot set the baseline.

## Search and diagnostics

Balanced retires the old candidate caps, rest tie zones, quartet exemplars,
anchor locks and repeat/coverage pruning. Every admissible partition remains
visible to the shared mode-aware entropy and cadence ordering. Small
one/two-court decisions with at most fourteen available players are exhaustive
by default. Larger decisions use bounded global search
and admissible pruning, with separate 50,000-branch / two-second budgets for
baseline and selection passes. Baseline scoring defers zero-rest ranking,
entropy and soft cadence, and collapses only worse-balanced partitions of an
identical quartet; the second pass restores every admissible partition. Its
optimistic zero-rest bound is relaxed across all remaining players. For Mixed
sessions, type-entropy pruning precedes the zero-rest bound; that bound applies
only when the type score ties. Relationship-entropy pruning follows only when
the zero-rest layer ties, and the soft-rest bound applies only when relationship
entropy ties. MEXICANO skips the type layer. A Balanced timeout may return an incumbent only
when fairness, schedule, starvation and the balance baseline are certified;
otherwise it reports a search limit. It never grants an unproven envelope or
falls back to greedy courts. Diagnostics distinguish incomplete entropy or
soft-rest optimization.

Balanced entropy uses fixed 1e-12 score buckets for transitive effective ties;
Social retains its existing exact score ordering. No pairwise epsilon is used.
Raw total/facet gains remain available. Debug and persisted reasons expose
fairness, starvation, baseline, allowed gap, chosen gap, the chosen batch's
zero-rest selected-player count (which can include first assignments) and
ascending completed-match rest vector, entropy facets and whether a final exact-rematch,
seeded-random or deterministic tie decided the result.
The opt-in `measureRotationStarvationIntervention` benchmark helper runs the
same search with starvation priority suppressed only in a private
counterfactual, replaying identical random draws and reporting whether the
selected player set changes. Ordinary production selection always enforces
starvation protection.

The old `mixedVariety.ts` target/debt engine is removed. Shared-court repetition,
partner/opponent coverage and recent repeats no longer influence Balanced.
Exact rematches remain a late literal-layout tie-break. Social's existing late
repeat ties and opportunity semantics remain unchanged.

Player-group seat compositions and crossover schedule ranks remain stronger
structural rules. Balanced no longer uses personal crossover debt or elapsed
wait vectors to narrow equally fair selections; the mode-aware entropy layers,
immediate zero-rest count and soft cadence decide those ties. Level Match
retains its separate group-selection policy.

Rest bounds remain subject to stronger count fairness and legality. Mixed
parity, player groups, interclub restrictions and asynchronous availability can
still make longer waits unavoidable even when cadence smoothing is enabled; the
benchmark reports those cases separately from waits avoidable by another
equally fair legal batch.
