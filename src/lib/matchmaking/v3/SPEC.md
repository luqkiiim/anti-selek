# Matchmaking v3 specification

The current policy, balance limits, opportunity/history semantics and search
certification requirements are defined in [README.md](./README.md). This
specification records behavioral invariants used by regression tests.

## Shared rotation invariants

- Reject busy/paused players and illegal partitions before scoring.
- Each selected player appears exactly once in a batch.
- Honor explicit mandatory players and hard pairing, club and seat rules.
- Minimize sorted effective match counts (`max(matchesPlayed, baseline)`), then
  arrival priority and structural schedule rank before starvation or entropy.
- Late joiners and resumed players enter at the lowest eligible neutral
  baseline, with fresh rest and arrival state; do not force catch-up.
- Protect available overdue players using the full unpaused roster, even when
  ordinary cadence preference is off.
- After fairness, arrival, structural schedule rank and starvation tie, Social
  certifies the lowest immediate-replay count across the whole batch. Balanced
  first freezes its existing balance guardrail, then certifies that same global
  replay minimum only inside the fixed envelope; neither later gate expands
  that envelope.
- All exact-minimum-replay batches remain admissible. A batch with one
  additional selected player at `restTurns === 0` is admissible only if its
  normalized first-exposure coverage exceeds the maximum coverage among the
  exact-minimum batches. More than one additional replay is excluded. This
  coverage threshold is fixed from the whole-batch best-replay frontier; it is
  not a pairwise tolerance and coverage does not rank candidates afterward.
- First-exposure coverage is the eligible context-roster average of each
  player's equal-weight mean over feasible facets. Each new opportunity
  exposure contributes the reciprocal of that player's structural opportunity
  count. Courtmates, partners, opponents and, in MIXICANO, match type are
  active facets; MEXICANO omits match type. Empty facets are excluded, while a
  feasible singleton is meaningful. Existing completed/committed exposures
  are baseline; Balanced keeps its full structural denominator even when its
  guardrail blocks a relationship.
- Within the admitted set, compare the existing combined normalized entropy
  across courtmates, partners, opponents and, in MIXICANO, match type. Match
  type is one facet of the combined score, not a separate priority tier. In
  MEXICANO that facet is inactive.
- Only when combined entropy ties does the ascending sorted completed-match
  rest-turn vector act as a soft cadence tie-break. Social compares combined
  entropy exactly; Balanced applies its fixed `1e-12` bucket to the combined
  score.
- `respectPlayerRest: false` disables replay, first-exposure coverage and soft
  cadence gates while leaving starvation protection active.
- Optimize whole disjoint batches globally, including asynchronous refills.

## Shared variety invariants

- One entropy implementation serves Social and Balanced, with courtmates,
  partners, opponents and feasible MIXED/OWN_SIDE experience types.
- Lifetime distributions continue valuing neglected experiences late in a
  session. No Mixed rate, gender-composition target or one-time obligation.
- Opportunity sets respect structural constraints and include busy players.
- Pause does not erase history; new feasible peers expand the vocabulary.
- Completed, active, pending approval, queued and manual assignments count
  consistently, with deduplication and immutable assignment-side snapshots.

## Social policy

Order Social by legality/availability, fairness/arrival, group schedule and
starvation. When ordinary rest preferences are enabled, find the global
minimum zero-rest count in that stronger class, then freeze the largest
first-exposure coverage at that exact minimum. Admit the minimum plus one only
when coverage strictly exceeds that frozen frontier. Rank admitted batches by
combined four-facet entropy, then the soft ascending rest vector. Continue
with actual balance, late partner/opponent repeats, exact rematch and seeded
pairing ties. Entropy is exact. `respectPlayerRest: false` skips the replay
and first-exposure gates and soft vector while starvation remains.

## Balanced policy

1. Fairness and arrival priority.
2. Applicable player-group schedule rules.
3. Shared starvation protection.
4. Freeze balance admissibility within that stronger class.
5. If rest preferences are enabled, certify the minimum global zero-rest count
   inside the fixed envelope and freeze the greatest first-exposure coverage
   among batches at that minimum. Allow one additional replay only when its
   coverage strictly exceeds that frozen frontier.
6. Combined normalized entropy (courtmates, partners, opponents and, in
   MIXICANO, match type).
7. Soft ascending rest vector for entropy ties, when enabled.
8. Actual worst-court gap, total gap, then Points point-difference gap.
9. Exact-rematch avoidance and seeded/deterministic ties.

The baseline pass minimizes worst-court balance and then total balance within
one optimal stronger class. Entropy search uses a fixed inclusive envelope:
Points `best worst gap + 1.5`; Rating `min(50, best worst gap + 30)`. If Rating's
best achievable worst gap is above 50, admit only best worst and total gap.
Starvation wins over a prettier baseline that excludes an overdue player.

Balanced never compares candidates using a weighted balance/entropy sum or
pairwise balance tolerance. Effective ties use one fixed `1e-12` bucket on the
combined entropy score; Social retains exact ordering. Legacy debt, repeat and
quota heuristics cannot prune legal candidates. Search certifies the replay
minimum after stronger priorities and, for Balanced, inside its fixed
guardrail. A separate global pass certifies the coverage frontier across exact
best-replay batches. The final global search admits only the minimum or
strictly higher-coverage minimum-plus-one batches, then may prune by an
optimistic combined-entropy upper bound and, only when that score ties, by the
soft-rest bound. Whole-batch replay, coverage and entropy bounds include every
court in the refill. Exact rematches have no influence until all earlier
metrics tie.

## Search certification and explanation

At most fourteen available players and at most two courts are exhaustive by
default. Larger global search is bounded. Explicit limits can interrupt the
balance-baseline, replay-certification, coverage-certification or
final-optimization phase. Rest-sensitive selection requires certified replay
and coverage gates; an incomplete replay or coverage certification returns no
selection. Returning a Balanced batch also requires certified stronger
priorities and a certified balance baseline; incomplete final entropy
optimization is reported.

Shared debug must identify fairness state, schedule rank, starvation state,
certified best/allowed/chosen replay counts and envelope status, best-replay
coverage frontier, chosen coverage gain/eligibility and its certificate,
best achievable balance, allowed envelope, actual balance, raw entropy and
facet gains, final tie-break and search certifications. Persisted reasons
explain the policy and selection metrics without storing a per-court replay
baseline.

Behavior tests cover independent exhaustive batch comparison, global
best-plus-one replay envelopes, combined-entropy and soft-cadence ordering,
awkward skills,
starvation against balance, full roster opportunities, Mixed imbalance, late
join/resume, cadence disabled, player groups/interclub, assignment history and
long asynchronous sessions. Tests must check actual admissibility and rotation
outcomes rather than asserting retired penalty fields.
