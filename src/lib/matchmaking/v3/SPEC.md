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
- After fairness, arrival, structural schedule rank and starvation tie, minimize
  selected players with zero completed-match rest turns; then lexicographically
  maximize the ascending rest-turn vector before entropy.
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

Order Social by fairness/arrival, group schedule, starvation, enabled cadence,
entropy, actual balance, late partner/opponent repeats, exact rematch and seeded
pairing ties. Cadence is the whole-batch zero-rest count followed by the
ascending rest-turn vector. Preserve the existing entropy comparison and search
limits; `respectPlayerRest: false` disables cadence while starvation remains.

## Balanced policy

1. Fairness and arrival priority.
2. Applicable player-group schedule rules.
3. Shared starvation protection.
4. Balance admissibility within that stronger class.
5. Enabled cadence smoothing inside the envelope.
6. Shared entropy variety.
7. Actual worst-court gap, total gap, then Points point-difference gap.
8. Exact-rematch avoidance and seeded/deterministic ties.

The baseline pass minimizes worst-court balance and then total balance within
one optimal stronger class. Entropy search uses a fixed inclusive envelope:
Points `best worst gap + 1.5`; Rating `min(50, best worst gap + 30)`. If Rating's
best achievable worst gap is above 50, admit only best worst and total gap.
Starvation wins over a prettier baseline that excludes an overdue player.

Balanced never compares candidates using a weighted balance/entropy sum or
pairwise balance tolerance. Effective entropy ties use fixed 1e-12 buckets.
Legacy debt, repeat, coverage and rest heuristics cannot prune legal entropy
candidates. Cadence pruning uses an optimistic vector over all remaining players;
entropy cannot prune a branch that could still improve cadence. Exact rematches
have no influence until all earlier metrics tie.

## Search certification and explanation

At most fourteen available players and at most two courts are exhaustive by
default. Larger global search is bounded. Explicit limits can interrupt either
pass. Returning a Balanced batch requires certified stronger priorities and a
certified balance baseline; incomplete entropy optimization is reported.

Debug/reason output must identify fairness state, schedule rank, starvation
state, best achievable balance, allowed envelope, actual balance, raw entropy
and facet gains, final tie-break and search certifications.

Behavior tests cover independent exhaustive batch comparison, awkward skills,
starvation against balance, full roster opportunities, Mixed imbalance, late
join/resume, cadence disabled, player groups/interclub, assignment history
and long asynchronous sessions. Tests must check actual admissibility and
rotation outcomes rather than asserting retired penalty fields.
