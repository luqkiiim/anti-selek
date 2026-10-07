# Interclub Social structural-context repair

This repair addresses the scoring-input blocker from the held Social-default
regression. It preserves the beneficial-rescue objective, signed T definition,
one-pair admission rule, fairness, starvation, weighting, ranking, search bounds
and budgets. Balanced Points/Elo and joint refill are unchanged.

## Structural definition and history

The caller declares `socialStructuralOpportunityConstraints` separately from
temporary `selectionConstraints`, schedules, excluded quartets/partitions and
replacement locks. Interclub passes its existing club rules; grouped Social
passes its existing roster-level rule union. Ordinary unconstrained Social
explicitly declares an empty rule array. Existing group planning rules and
their active-count inputs are retained.

`buildSocialStructuralVarietyContext` rebuilds counts from completed history and
saved role snapshots on the full structural roster with
`includePausedPlayers: true`. It applies the declared legal opportunity rules.
Busy, paused and reserved players remain structurally represented where those
rules permit an experience; the separate available-candidate roster keeps them
ineligible for assignment. The helper does not reuse the committed-history
histograms used by legacy fallback and Balanced.

Candidate search and acceptance recomputation call the same helper with the
same caller-declared rules. This corrects courtmate/partner/opponent opportunity
counts, courtmate-equity denominators and feasible match-type vocabulary without
changing any scoring formula. A missing structural definition fails candidate
acceptance with `STRUCTURAL_OPPORTUNITY_DEFINITION_MISSING`; an empty array is
the explicit unrestricted definition. An inconsistent candidate G/T state is
rejected by independent selected-metric recomputation.

The production adapters retain the definition across single selection, batch,
reshuffle alternatives, retained-player replacement, group selection and
Interclub retries. Queue creation/rebuild continue using these same hardened
default Social selectors. Production fallback remains direct, labelled and
subject to the unchanged hard proof requirements.

## Previously failing assertions

The empty-history Interclub mismatch was a genuine defect: search discarded
the supplied legal opportunities. Its expected legal normalization must remain
unchanged and pass after the repair.

The completed-history batch expectation also included an active game's
relationship counts. Candidate scoring intentionally uses completed history;
the test must independently calculate gains against completed counts and legal
full-roster opportunities, while checking active players remain reserved.

The queue-history spy required every history-builder call to include a pending
queue. Interclub constructs both a committed legacy context and a completed-only
candidate context. Correct coverage distinguishes these contexts and verifies
that the queue remains a reservation. Balanced's queue-inclusive scoring
history remains unchanged.

## Independent regression evidence

The focused core oracle enumerates legal same-club teams and cross-club
opponents directly from club/side membership. It does not call production
legality or scoring helpers to obtain expected values. It computes Shannon
entropy, distinct undirected relationship gains and the signed six-game rolling
type delta independently.

- The symmetric eight-player roster, with two upper/two lower players per club,
  has 18 legal games: 16 MIXED and two OWN_SIDE. Each player has seven feasible
  courtmates, three partners and four opponents. From empty history, a legal
  game has summed entropy gains `C = 4 ln(3)/ln(7)`, `P = 0`, `O = 2`, type `0`.
- An asymmetric eight-player roster, with 1+3 and 3+1 club-side compositions,
  has nine legal MIXED games and no legal OWN_SIDE game, despite both types
  being feasible without Interclub rules. Impossible partners, opponents,
  courtmates and types are excluded per player. Busy and paused players remain
  represented in the structural sets but are absent from eligible candidates.
- Legal completed histories are projected onto the same independently
  enumerated opportunities. Expected entropy, new courtmate/partner/opponent
  counts and exact signed rolling T agree with production calculations.
- A controlled search allows two legal Interclub quartets while retaining the
  larger, full-roster Interclub opportunity definition. The full-G quartet has
  `Gmax = 6`, `TmaxAtGmax = 0`; the other has `G = 5`, `T = 2` and is certified
  as a strict one-pair rescue. Adding completed MIXED history reduces its T to
  zero and the certified result returns to full G. This proves admission in
  that declared candidate space, without shrinking structural denominators to
  the two currently available layouts.

API tests verify missing structural definitions trigger explicit certified
production fallback. A deliberately tampered MIXICANO Interclub search keeps
legal selection constraints but scores against unrestricted opportunities:
its empty-history T is `2`, whereas the caller's legal singleton type vocabulary
implies T `4`. Acceptance rejects it with
`SELECTED_T_RECOMPUTATION_MISMATCH`. Normal constrained candidates pass the same
gate. The initial tamper-test fixture incorrectly inherited MEXICANO (no type
facet); correcting its mode exercised the intended independent contrast.

## Validation

The focused run passes all 83 tests. The complete serial regression passes
655 tests across 52 files, with 13 opt-in tests across six files skipped
(189.91 seconds). Its scope is matchmaking v3, Social session history, all
generation integration/acceptance tests and queue integration tests. It includes
the three previous failures, replacement/reshuffle/refill, automatic queue
creation/rebuild and the unchanged Points/Elo envelope, oracle and simulation
coverage.

The six default asynchronous sessions use seeds `1`, `4729`, `104729` for
16/8+8/2 and 18/9+9/3. All 135 assigned quartets are accepted exact candidates:
zero fallback, 12 strictly beneficial one-pair rescues, zero zero-benefit
concessions and maximum deficit one. Their results match the successful
pre-repair ordinary-Social control. The normal-budget 20-player opening still
uses the explicitly labelled, certified production fallback. Joint refill
remains disabled.

| Final check | Result |
|---|---|
| Broad serial regression | 655 passed, 13 opt-in skips, no failures |
| Focused API/Interclub/queue/Balanced checks | 83 passed |
| API file after test-only assertion typing repair | 20 passed |
| TypeScript | Passed |
| ESLint, all 81 changed/new source and frozen-control files | Passed |
| Local production build, Next 16.2.7 | Passed |
| Historical fixture verifier | All 19 verified |
| `git diff --check` | Passed |

TypeScript exposed two new test spy assertions reading `id` from the narrower
`V3CompletedMatch` type. They now use runtime object assertions and the queue
fixture's independently known empty completed history. Production types were
unchanged; the affected 20-test API file, TypeScript and all-file ESLint passed
again. No production source changed after the broad regression.

No meaningful production blocker remains. The validated default and narrow
context repair meet the user's commit/merge/push condition. Joint refill stays
disabled, Balanced remains isolated, and no migration or deployment command
was run. There are no schema, dependency or deployment workflow changes.

Only five production source files changed from the held default: the two
structural-context builders/adapters, the batch context input and acceptance
recomputation. Of the 17 engine/control sources pinned at the held default,
15 remain byte-identical; only `socialBatch.ts` and `socialVariety.ts` carry the
context plumbing above. The beneficial-rescue scorer, rolling scorer, frontier
bounds, fairness, starvation, Balanced implementation and frozen Balanced test
remain byte-identical. The Balanced section of the existing API integration
test is also byte-identical. All 14 frozen original control sources verify.

The held default's source snapshots/failed logs and the repaired source hashes,
validation logs and manifest are preserved under ignored
`benchmarks/generated/social-interclub-context-repair/` and the prior
`benchmarks/generated/social-default-switch/` directory. No failed expectation
is replaced with the former unrestricted output. New controlled experiments
retain the 100-match cap; inherited regression fixtures keep their authored
horizons.
