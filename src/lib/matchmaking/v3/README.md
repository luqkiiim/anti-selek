# Matchmaking v3

Social uses `courtmate-beneficial-rescue` through the hardened API acceptance
boundary. The Interclub structural-context repair and changed-default validation
are recorded in the [default-switch report](../../../../docs/social-default-switch-results.md).
Balanced Points and Elo default to hardened Arm 3 through
`balancedCandidateAcceptance.ts`, inside their existing explicit balance
envelopes. The recurrence engine is `balancedRecurrence.ts`; `socialBatch.ts`
remains the production fallback and rollback matcher. The API adapters cover
single courts, global batches, player groups, Interclub, reshuffles and player
replacement. Level Match uses the separate ladder matcher.

## Shared stronger priorities

Legality, busy/paused availability, mandatory retained players and hard format
constraints are enforced before ranking. Shared priorities are effective match
counts, arrival priority, applicable structural schedule rank, then starvation.

## Production Social default

The effective session format selects the production policy explicitly. Social
generation, immediate asynchronous refill, batches, reshuffles, retained-player
replacement, grouped selection, Interclub and automatic queue creation/rebuild
use the same hardened beneficial-rescue boundary. Points and Elo do not inherit
this policy, even if an internal caller supplies a Social policy argument. The
low-level matcher's omitted-policy behavior stays available for Balanced,
historical benchmarks and the explicit Social production fallback.

Inside the strongest fairness/arrival, schedule and starvation class, Social
certifies maximum new courtmate gain `Gmax` and the best signed rolling
match-type gain `TmaxAtGmax` at that maximum. Full-Gmax layouts remain admitted.
A layout with `Gmax - 1` is admitted only when its signed gain satisfies
`chosenDeltaT > TmaxAtGmax`; a larger deficit is never admitted. Admitted layouts
rank by signed T, higher raw courtmate gain, courtmate equity, replay/rest,
partner breadth, opponent breadth, entropy/repeat quality and the existing late
tie-breakers. The objective, weights and T definition are unchanged by default
wiring. There is no debt, match-type quota, MIXED percentage target or elapsed-time
rest objective. Conditional joint refill remains experimental and disabled.

The acceptance boundary requires policy echo, fairness, schedule, starvation,
Gmax/Tmax, full-priority and variety certificates, a valid selected schedule,
legal eligible disjoint quartets and recomputed selected G/T. Search limits,
failures, invalid deficit arithmetic and non-beneficial concessions reject the
candidate. A rejected candidate is discarded; the existing production Social
matcher is rerun with replayed initial random draws and must prove its hard
fairness/schedule/starvation contract and applicable replay/coverage gates.
Fallback metadata and server telemetry identify `production-fallback`, never
`candidate-exact`. If neither attempt proves the required hard contract, no
selection is returned.

The primary G/T inputs use the full structural roster, completed history,
saved match-type snapshots and the caller's explicit legal-opportunity rules.
Search and acceptance recomputation share this definition. Busy/paused players
stay ineligible while their structural vocabulary remains available.
A structural schedule's format/group
constraints remain stronger than variety. See the
[default-switch report](../../../../docs/social-default-switch-results.md) and
[hardening report](../../../../docs/social-production-hardening-results.md) for
certificate checks and the measured larger-roster fallback boundaries.

## Balanced default

With `BALANCED_RECURRENCE_CANDIDATE_ENABLED` absent, Points and Elo request
`strict-replay-rescue`. Setting it to `0` explicitly restores the old Balanced
behavior for rollback/testing; `1` also selects Arm 3. Other explicit values
retain the previous disabled-flag behavior. This flag does not affect Social or
Level Match. An internal explicit strict request takes precedence over the flag.

The Arm 3 objective is frozen. Fairness/arrival, schedule, starvation and the
balance envelope remain stronger than recurrence. The existing replay minimum
and first-exposure exception remain in place. Once a player has experienced
every structurally feasible type, signed recent match-type gain can influence
ranking using the latest six completed appearances, capped naturally without
an appearance-count threshold. One additional replay may be admitted for
strictly better T than the best T at the certified replay minimum. Coverage
and recurrence exceptions do not stack; two additional replays are never
admitted. There is no target MIXED ratio, quota or debt.

The default gate requires a complete exact candidate and independently checks
its selected layout, stronger-priority/balance/replay certificates, exact C/T
values, admission and full legal structural vocabulary before returning it to
automatic writers. An incomplete candidate is discarded and current production
Balanced is rerun and checked for its core contract. A fallback is explicitly
labelled and never recurrence-certified; an incomplete production late ranking
may certify only the core contract. If neither attempt certifies, no selection
is returned. Rest-disabled requests can use this certified fallback.

This boundary certifies fresh automatic selections before match or queue writes.
Consuming an existing queue preserves its stored lineup and decision rather than
rerunning matchmaking. Fully manual lineups keep the existing legality checks
and do not claim automatic Balanced certification. The switch does not reselect
manual or pre-existing queued lineups.

Recurrence uses completed-only history and full structural opportunities,
including paused/busy/queued players while keeping them ineligible. The legacy
coverage gate retains its existing context. The frozen exhaustive reference is retained under test fixtures for parity
checks; experiment runners and generated traces remain local. See the
[default-switch validation report](../../../../docs/balanced-recurrence-default-switch-results.md).

## Balanced production fallback and legacy Social fallback

This section describes the unchanged production Balanced fallback/rollback
policy and the explicitly labelled legacy Social fallback. After the stronger
priorities tie, the fallback
certifies the smallest immediate-replay
count available in that rotation class. Balanced first establishes its fixed
balance envelope inside the same stronger class, then certifies the minimum
replay count only among candidates inside that envelope. Across the entire
refill batch, all candidates at that minimum remain admissible. A batch with
one additional `restTurns === 0` player is admitted only when its immediate
first-exposure coverage is strictly greater than the maximum coverage among
the exact-minimum batches. Two or more additional replays are never admitted.
The envelope is frozen globally; Balanced's coverage gate cannot expand its
balance envelope.

This first-exposure coverage gate is an admission rule, not another score to
maximize. Within the admitted set, the matcher maximizes the existing combined
normalized entropy across courtmates, partners, opponents and, in Mixed
sessions, match type. The completed-match rest vector is a soft tie-break after
entropy. `restTurns === 0` counts as an immediate replay. The soft vector
maximizes the ascending sorted rest turns lexicographically: maximize the
lowest rest, then the next-lowest, and so on. Total rest is not an objective.
The legacy Social fallback compares combined entropy exactly; Balanced uses its fixed 1e-12 bucket
on the combined score. `respectPlayerRest: false` disables replay and
first-exposure gates and soft cadence preference, while starvation protection
remains enabled. Structural opportunity coverage continues to report feasible
relationships regardless of the choices admitted by the balance envelope.

The score averages each eligible player's mean first-exposure fraction across
feasible facets. Each facet uses the shared structural opportunity vocabulary
and is normalized by its feasible opportunity count. A feasible singleton is
meaningful; a facet with no opportunities is omitted. In Mixed sessions,
match type is one facet normalized by feasible MIXED/OWN_SIDE types; in other
modes it is inactive. The denominator does not shrink when a Balanced
guardrail blocks a relationship. Existing completed and committed exposure
history supplies the baseline. Thus a best+1 batch can reopen an OWN_SIDE/MIXED
first exposure, but only while it adds coverage beyond every exact-best-replay
batch. Once no new exposure is available, the extra replay closes again.

The resulting fallback order is legality and availability, match-count fairness,
arrival, structural schedule rank, starvation, certified global replay
minimum, first-exposure coverage admission, combined entropy, soft cadence,
actual worst/total balance gaps and applicable point-difference gaps, Social's
late partner/opponent-repeat ties, exact rematch and seeded randomness.
Balanced uses the same stronger rotation order, then its fixed balance
guardrail, certified replay minimum, first-exposure coverage admission,
combined entropy, soft cadence, actual worst/total balance, Points
worst/total point-difference gaps where applicable, exact rematch and its
seeded/deterministic final tie.

## Shared variety and starvation

`socialVariety.ts` defines shared entropy gains. It measures changes in
normalized lifetime Shannon entropy for courtmates, partners, opponents and,
with Mixed pairing, MIXED versus OWN_SIDE experiences. Feasible facets have
equal scale; a facet with fewer than two opportunities contributes zero.
Negative gains are valid. Production Social's earlier G/T and equity layers are
defined by `socialCourtmatePriority.ts` and `socialRollingVariety.ts`; entropy
remains a later quality layer. There are no Mixed percentages, debt or obligations.

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

The primary Social KPI is completed-only coverage after 21 matches, about six
appearances per player: `C`, `O`, and `P` divide distinct feasible courtmates,
opponents, and partners by `min(feasible count, 13/12/6)` respectively, cap
each ratio at one, and score each player as `(3C + 2O + P) / 6` before averaging
across players. Empty structural facets are omitted with weight renormalization.
`socialHorizonCoverageScoring.ts` computes this score using the full structural
roster; busy/paused availability, rest, and Balanced envelopes do not reduce
its denominators. Rest quality remains measured in completed-match events.

The commands in this section reproduce historical low-level replay/coverage
policies, including the unchanged Balanced and Social fallback behavior. They
do not implicitly exercise the new API Social default. This KPI does not replace
the legacy equal-facet coverage admission rule. The low-level coverage metric
defaults to `legacy-four-facet`; `social-horizon-321` remains an explicit
benchmark-only opt-in. Verify that legacy policy against the KPI with:

```sh
node scripts/run-social-horizon-benchmark.mjs --only-policy current --target-matches 21 --coverage-gain-metric legacy-equal --out-dir <path>
```

Run the full deterministic asynchronous benchmark manually with:

```sh
npm run benchmark:matchmaking
```

The default run uses five narrow-profile seeds (`1, 4729, 104729, 130363,
2097593`) for Social, Balanced Points and Balanced Rating/Elo, plus three
wide-profile sensitivity seeds (`30011, 65537, 999983`) for the two Balanced
formats. It uses the same 14-player 7/7 roster and seeded court-completion
schedule across formats. Each policy run records checkpoints after exactly 21
and 400 completed matches; unfinished active assignments do not count toward
coverage. The 21-match report includes each player's completed-match count,
minimum, maximum and spread. All point differences are zero because these runs
measure matchmaking, not match outcomes. By default, the current-policy report
and comparison write under ignored `benchmarks/generated/social-coverage-21/`.
Historical `.json` inputs resolve to their frozen `.json.gz` fixtures. See
`benchmarks/README.md` for checksums, publication, and rerendering instructions.

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

To compare against saved reports, pass `--baseline-json <path>`,
`--strict-json <path>`, `--type-first-json <path>`, and
`--replay-envelope-json <path>`. A five-policy comparison using the saved
21/400 runs is:

```sh
npm run benchmark:matchmaking -- --baseline-json benchmarks/social-coverage-21/social-coverage-full21-entropy-first.json --strict-json benchmarks/social-coverage-21/social-coverage-full21-strict-cadence.json --type-first-json benchmarks/social-coverage-21/type-first-final/social-coverage-full21-type-entropy-first.json --replay-envelope-json benchmarks/social-coverage-21/replay-envelope/social-coverage-full21-replay-envelope.json --out-dir benchmarks/generated/social-coverage-21
```

`--only-policy baseline|strict|type-first|replay-envelope` runs a pinned
historical worktree and requires its matching `--baseline-worktree`,
`--strict-worktree`, `--type-first-worktree`, or
`--replay-envelope-worktree` path plus an explicit `--out-dir`. Use
`--only-policy current --out-dir <path>` to run only the current checkout.
Historical worktrees must resolve to the pinned engine revisions listed in
`benchmarks/README.md`. `--out-dir <path>` selects an isolated output directory.
The long benchmark is skipped in normal Vitest/CI and enabled by this script.

The current replay-coverage gate runs after the strongest fairness/arrival/
schedule/starvation class and, for Balanced, inside the frozen balance envelope.
It admits the minimum immediate-replay count and permits one additional
immediate replay only when its normalized first-exposure coverage gain is
strictly greater than the best gain available at the minimum. The gate includes
feasible match-type first exposures in Mixed; the secondary equal-weight
relationship VCS measures only partner, opponent, and courtmate coverage. Combined
normalized entropy and then soft rest cadence rank the admitted batches.
Checkpoint counters are assignment/refill cohorts after completions 1 through
N−1; the completed-match coverage history itself is sampled exactly at N.
Root-level `social-coverage-full-*.{json,md}` reports are preserved older
20/400-checkpoint artifacts and are not the current 21/400 benchmark.
Long-run simulations retain late-window match-type counts as diagnostics.
Recurring OWN_SIDE at 400 matches is not a mandatory product requirement;
legality, fairness, starvation, balance, and relationship checks stay active.
The 400-match benchmark is secondary to the 21-match coverage/rest experience.
Coverage at 100% means every feasible people relationship has occurred once;
it does not guarantee even repetition entropy or ongoing match-type variety.
The gate also tracks Mixed match-type first exposure. Once all four gate facets
are covered, all immediate gains are zero, so no +1 replay can pass the strict
improvement rule. If the minimum-replay class then offers only MIXED, OWN_SIDE
can stop recurring. Gate diagnostics report +1 availability, eligibility,
selection, and rejection separately; decision and candidate counts differ and
decision cohorts may overlap.

## Balance admissibility

`balanceGuardrail.ts` contains the format policy. Balanced search first finds
the strongest feasible fairness/arrival/schedule/starvation class and its
lexicographic minimum `(maxBalanceGap, totalBalanceGap)`. It then freezes the
envelope before searching whole batches. Replay certification finds the
minimum zero-rest count inside that fixed envelope. Coverage certification
freezes the greatest first-exposure gain among batches at that minimum. A
batch with one additional zero-rest player joins only when its coverage is
strictly above that frozen frontier; batches with more replays are excluded.
Combined normalized entropy ranks the admitted batches next, followed by soft
completed-match cadence when entropy ties. Neither gate widens the balance
envelope.

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
anchor locks and legacy repeat/debt pruning. The certified first-exposure gate
uses the shared structural vocabulary and filters only the one-replay allowance;
it is not a candidate-compression heuristic. Small one/two-court
decisions with at most fourteen available players are exhaustive by default.
Larger decisions use bounded global search and admissible pruning, with a
50,000-branch / two-second budget for each baseline, replay-certification,
coverage-certification and final-selection phase.
The balance pass defers replay, first-exposure coverage, entropy and soft
cadence, collapsing only worse-balanced partitions of an identical quartet.
The replay pass then
certifies the minimum zero-rest count inside the strongest rotation class and,
for Balanced, inside the frozen guardrail. Its optimistic replay lower bound
is relaxed across all remaining players. The coverage pass then certifies the
maximum first-exposure gain among exact-best-replay batches; its optimistic
upper bound spans every remaining court. The final pass admits the exact
minimum and only those best+1 batches whose first-exposure gain is strictly
greater than that frozen frontier. Its optimistic combined-entropy bound is
checked before the soft-rest bound; soft cadence prunes only when the entropy
score ties. A rest-sensitive selection requires certified replay and coverage
gates; incomplete certification returns no selection. A Balanced timeout may
return an incumbent only when fairness, schedule, starvation, balance
baseline, replay allowance and coverage gate are certified; otherwise it
reports a search limit. It never grants an unproven gate or falls back to
greedy courts. Diagnostics distinguish incomplete entropy or soft-rest
optimization.

Balanced entropy uses one fixed 1e-12 bucket on the combined score for
transitive effective ties; Social retains exact score ordering. No pairwise
epsilon is used. Raw total/facet gains remain available. Shared debug reports
the certified best replay count and allowance, maximum first-exposure gain at
the minimum, chosen coverage gain and replay eligibility, and both certificate
statuses, together with fairness, starvation, balance baseline, allowed gap,
chosen gap, completed-match rest vector, entropy facets and final tie-break.
Persisted reasons explain the rotation policy and selection metrics.
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
wait vectors to narrow equally fair selections; the certified replay allowance,
combined entropy and soft cadence decide those ties. Level Match
retains its separate group-selection policy.

Rest bounds remain subject to stronger count fairness and legality. Mixed
parity, player groups, interclub restrictions and asynchronous availability can
still make longer waits unavoidable even when cadence smoothing is enabled; the
benchmark reports those cases separately from waits avoidable by another
equally fair legal batch.
