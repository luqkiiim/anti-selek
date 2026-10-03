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
  certifies the lowest immediate-replay count across the whole batch and allows
  at most one additional selected player with `restTurns === 0`. Balanced first
  freezes its existing balance guardrail, then certifies that same global
  replay minimum only inside the fixed envelope; the one-player allowance does
  not expand it.
- Within the certified replay allowance, compare the existing combined
  normalized entropy across courtmates, partners, opponents and, in MIXICANO,
  match type. Match type is one facet of the combined score, not a separate
  priority tier. In MEXICANO that facet is inactive.
- Only when combined entropy ties does the ascending sorted completed-match
  rest-turn vector act as a soft cadence tie-break. Social compares combined
  entropy exactly; Balanced applies its fixed `1e-12` bucket to the combined
  score.
- `respectPlayerRest: false` disables the replay allowance and soft cadence
  layer while leaving starvation protection active.
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

Order Social by fairness/arrival, group schedule and starvation. When ordinary
rest preferences are enabled, find the global minimum zero-rest count in that
stronger class and admit candidates up to minimum plus one. Rank those batches
by combined four-facet entropy, then the soft ascending rest vector. Continue
with actual balance, late partner/opponent repeats, exact rematch and seeded
pairing ties. Entropy is exact. `respectPlayerRest: false` skips the replay
allowance and soft vector while starvation remains.

## Balanced policy

1. Fairness and arrival priority.
2. Applicable player-group schedule rules.
3. Shared starvation protection.
4. Freeze balance admissibility within that stronger class.
5. If rest preferences are enabled, certify the minimum global zero-rest count
   inside the fixed envelope and allow at most one additional replay.
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
combined entropy score; Social retains exact ordering. Legacy debt, repeat,
coverage and rest heuristics cannot prune legal candidates. Search first
certifies the replay minimum after stronger priorities and, for Balanced,
inside its fixed guardrail. The final global search admits only batches within
minimum plus one, then may prune by an optimistic combined-entropy upper bound
and, only when that score ties, by the soft-rest bound. Whole-batch replay and
entropy bounds include every court in the refill. Exact rematches have no
influence until all earlier metrics tie.

## Search certification and explanation

At most fourteen available players and at most two courts are exhaustive by
default. Larger global search is bounded. Explicit limits can interrupt the
balance-baseline, replay-certification or final-optimization phase. Rest-
sensitive selection requires a certified replay minimum and allowance; an
incomplete replay-certification phase returns no selection. Returning a
Balanced batch also requires certified stronger priorities and a certified
balance baseline; incomplete final entropy optimization is reported.

Shared debug must identify fairness state, schedule rank, starvation state,
certified best/allowed/chosen replay counts and envelope status, best
achievable balance, allowed envelope, actual balance, raw entropy and facet
gains, final tie-break and search certifications. Persisted reasons explain
the policy and selection metrics without storing a per-court replay baseline.

Behavior tests cover independent exhaustive batch comparison, global
best-plus-one replay envelopes, combined-entropy and soft-cadence ordering,
awkward skills,
starvation against balance, full roster opportunities, Mixed imbalance, late
join/resume, cadence disabled, player groups/interclub, assignment history and
long asynchronous sessions. Tests must check actual admissibility and rotation
outcomes rather than asserting retired penalty fields.
