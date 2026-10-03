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
- After fairness, arrival, structural schedule rank and starvation tie, Mixed
  sessions compare match-type entropy first, then minimize the whole batch's
  number of selected players with `restTurns === 0`, then compare relationship
  entropy across courtmates, partners and opponents.
- In MEXICANO, where match type is inactive, compare zero-rest count before
  relationship entropy. In either mode, only when the active entropy layers
  tie does the ascending sorted completed-match rest-turn vector act as a soft
  cadence tie-break.
- Social compares entropy layers exactly; Balanced applies its fixed `1e-12`
  bucket independently to match-type and relationship scores.
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

Order Social by fairness/arrival, group schedule and starvation. For
MIXICANO, compare match-type entropy, enabled zero-rest count, relationship
entropy, then the enabled soft rest vector. For MEXICANO, omit match-type
entropy and start with zero-rest count. Continue with actual balance, late
partner/opponent repeats, exact rematch and seeded pairing ties. Entropy is
exact. `respectPlayerRest: false` disables both cadence layers while starvation
remains.

## Balanced policy

1. Fairness and arrival priority.
2. Applicable player-group schedule rules.
3. Shared starvation protection.
4. Balance admissibility within that stronger class.
5. In MIXICANO, match-type entropy inside the fixed envelope.
6. Enabled zero-rest count.
7. Relationship entropy (courtmates, partners and opponents).
8. Soft ascending rest vector for entropy ties.
9. Actual worst-court gap, total gap, then Points point-difference gap.
10. Exact-rematch avoidance and seeded/deterministic ties.

The baseline pass minimizes worst-court balance and then total balance within
one optimal stronger class. Entropy search uses a fixed inclusive envelope:
Points `best worst gap + 1.5`; Rating `min(50, best worst gap + 30)`. If Rating's
best achievable worst gap is above 50, admit only best worst and total gap.
Starvation wins over a prettier baseline that excludes an overdue player.

Balanced never compares candidates using a weighted balance/entropy sum or
pairwise balance tolerance. Effective ties use fixed `1e-12` buckets
independently for match-type and relationship entropy; Social retains exact
ordering. Legacy debt, repeat, coverage and rest heuristics cannot prune legal
candidates. For Mixed batches, search may prune by an optimistic type-entropy
upper bound first, then by the zero-rest lower bound only when type gain ties,
then by the relationship-entropy upper bound only when zero-rest count ties,
and finally by the soft-rest bound only when relationship gain ties. MEXICANO
skips the type layer. Exact rematches have no influence until all earlier
metrics tie.

## Search certification and explanation

At most fourteen available players and at most two courts are exhaustive by
default. Larger global search is bounded. Explicit limits can interrupt either
pass. Returning a Balanced batch requires certified stronger priorities and a
certified balance baseline; incomplete entropy optimization is reported.

Debug/reason output must identify fairness state, schedule rank, starvation
state, best achievable balance, allowed envelope, actual balance, raw entropy
and facet gains, final tie-break and search certifications.

Behavior tests cover independent exhaustive batch comparison, type-entropy,
zero-rest, relationship-entropy and soft-cadence ordering, awkward skills,
starvation against balance, full roster opportunities, Mixed imbalance, late
join/resume, cadence disabled, player groups/interclub, assignment history and
long asynchronous sessions. Tests must check actual admissibility and rotation
outcomes rather than asserting retired penalty fields.
