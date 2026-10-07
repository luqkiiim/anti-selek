# Certified Social default switch

The normal API Social policy is `courtmate-beneficial-rescue`, with the
Interclub structural-context repair validated by the complete changed-default
regression. See [the repair report](social-interclub-context-repair-results.md)
for the constrained opportunity oracle and the earlier failure classification.
This is an explicit format-specific API change: the shared low-level matcher's omitted
policy behavior remains unchanged for Balanced Points, Balanced Elo, historical
experiments and the certified Social production fallback. Immediate asynchronous
refill remains in use. Joint refill remains isolated in the experimental harness.

## Production boundaries

`resolveSocialCandidatePolicy` uses the effective session type. Social resolves to
beneficial-rescue with no opt-in argument; Points and Elo resolve to no Social
policy even if an internal caller supplies the Social argument.

The audited production paths are initial generation, ordinary refill, multicourt
generation, reshuffle and its alternative quartet/partition retries,
retained-player replacement, pooled/shared selection, Interclub selection, and
all corresponding skip retries. Automatic queue creation and rebuild, queued
reshuffle, and queued replacement explicitly resolve the effective format and
use the same selectors. `autoAssignQueuedMatch.ts`, route handlers and service
callers funnel through these boundaries. A search of production app callers
found no other direct Social matcher call.

Automatic decisions persist the acceptance/fallback record in
`matchmakingReasonJson.socialPolicyDecision`. Manually specified teams remain
manual assignments; activating an existing queue entry preserves its stored
decision rather than making a fresh matcher claim.

## Acceptance and fallback

The boundary requires outer/debug policy agreement, fairness, schedule,
starvation, Gmax/Tmax, full-priority and variety certificates, explicit absence
of search limits/failures, and a valid schedule index. It validates court count,
eligible disjoint quartets, exclusions, retained players, pairing legality and
schedule/Interclub normalization. It recomputes selected G and signed T using
the full structural roster and completed history with saved role snapshots.

The deficit must equal `Gmax - chosenG` and belong to `{0,1}`. Full-Gmax
selections must have `chosenT === TmaxAtGmax`. Every one-pair rescue must satisfy
`chosenT > TmaxAtGmax`. No objective ordering, T definition, weights, search
budgets, fairness, starvation or balance logic changed during this switch.

An uncertified candidate is discarded. The existing production Social matcher
is called directly with the policy omitted and the initial random draws
replayed. Its hard fairness/schedule/starvation proofs and applicable existing
replay/coverage gates are mandatory. Fallback is labelled `production-fallback`
with reason codes, candidate/fallback proofs and server warning telemetry; it
never receives a beneficial-rescue exact label. If both attempts lack the hard
contract, the boundary returns no selection.

The prior hardening work already documented normal-budget limits for some
drained 18-player batches and 20/24-player openings. These are fallback states,
not permission to accept an uncertified candidate. See
[the hardening report](social-production-hardening-results.md) for the measured
search boundaries and independent frontier evidence.

## Changed-default regression

All new API coverage omits the policy argument so it exercises the real default.
Opening profiles cover 10/5+5/2, 12/6+6/2, 14/7+7/2, unequal 14/8+6/2 and
14/9+5/2, 15/8+7/3, 16/8+8/2, 16/8+8/3 and 18/9+9/3. Six asynchronous
sessions cover 16/2 and 18/3 for the audit seeds `1`, `4729`, `104729`, each
through 21 completed matches. Separate default-path tests cover pooled and
Interclub generation, reshuffle, replacement, automatic queues and skip retry.

| Profile | Seed | Assigned quartets | Exact candidate | Fallback | One-pair rescues | Conditional T benefit sum |
|---|---:|---:|---:|---:|---:|---:|
| 16 / 8+8 / 2 | 1 | 22 | 22 | 0 | 0 | 0 |
| 16 / 8+8 / 2 | 4729 | 22 | 22 | 0 | 0 | 0 |
| 16 / 8+8 / 2 | 104729 | 22 | 22 | 0 | 6 | 3 |
| 18 / 9+9 / 3 | 1 | 23 | 23 | 0 | 2 | 1 |
| 18 / 9+9 / 3 | 4729 | 23 | 23 | 0 | 2 | 1 |
| 18 / 9+9 / 3 | 104729 | 23 | 23 | 0 | 2 | 1 |

All 135 assigned quartets are accepted exact candidates. Every selected batch
has the hard fairness/schedule/starvation and full-ranking proof; active players
never overlap new assignments. There are 12 strictly beneficial one-pair
rescues, zero zero-benefit concessions, and maximum deficit one. Assignment
counts include the initial courts and unfinished active assignments after the
21st completion; the six sessions contain 126 completed matches in total.

Corruption tests reject missing or inconsistent certificates, incomplete
priority proofs, invalid deficits, non-beneficial rescues, ineligible players
and invalid Interclub normalization. Candidate exceptions, explicit search
limits, certified fallback and failure of both hard contracts are covered.
The actual normal-budget 20-player/3-court opening exercises production fallback.

Points and Elo have explicit API isolation checks, including attempted internal
Social-policy arguments. Frozen Points/Mexicano and Elo/Mixicano projections
cover selected teams, balance metrics/envelope, fairness, starvation, normal
rest, completed history, retained players and Social metadata absence. The
shared matcher rejects direct Social-priority requests for Balanced formats.

Before the structural repair, all 17 engine/source files were byte-identical
to the hardened pre-switch source set, SHA-256
`29796f62c251f29fbd471ba9368470456dc8feeed0dbf7603f8e21ded8610dd9`.
The repair changes only structural-context plumbing in `socialBatch.ts` and
`socialVariety.ts`; the other 15 pinned sources remain byte-identical, including
the scorer, bounds, fairness and Balanced implementation.
The broader existing Balanced tests provide additional envelope, oracle and
simulation coverage. New controlled experiments remain capped at 100 matches;
existing regression fixtures retain their authored horizons.

## Reproduction and verification

Historical policies and benchmark runners remain available for reproduction.
Obsolete opt-in wording was removed from the production adapters. Frozen
original frontier control sources are packaged under
`benchmarks/fixtures/social-frontier-control/` with their original checksums,
so benchmark imports and TypeScript do not depend on ignored local output.
Raw generated reports and private data stay ignored. Historical readiness
scripts keep their pinned-source requirements; they are not silently relabelled
as runs of the new API default.

No database schema, migration, dependency or build/deployment workflow change
is part of this task.

## Prior held regression

The initial default-only switch was held at base commit
`973081e7120bfd78f7c3808360aa37344b18e051`: its serial regression had
644 passes, three failures and 13 opt-in skips. Its isolated empty-history
Interclub reproducer also failed. The earlier compiler, lint and build passed.

The failures were:

1. A completed-history Interclub batch reported `0.5781296526357756` instead
   of the old constrained, committed-history expectation `0.8613531161467861`.
2. Empty-history Interclub scoring reported `1.4248287484320887` instead of
   the legally constrained opponent entropy gain `2`.
3. A queue-history spy required every history builder to include an unrelated
   pending queue, without distinguishing candidate scoring from legacy handling.

Search rebuilt its candidate context with completed history and the full roster
but discarded the caller's legal opportunities. Acceptance rebuilt the same
unrestricted vocabulary. Failure 2 established a real defect independently of
history handling. After the narrow structural repair, failure 1's expectation
uses completed-only counts and constrained opportunities; failure 3 now checks
both completed-only candidate history and committed legacy history while
preserving all queue/busy reservations. Balanced assertions are unchanged. The
empty-history expectation remains `2` and passes unchanged.

The original failed logs, source hashes and held decision are retained under
ignored `benchmarks/generated/social-default-switch/final-2026-10-07-v1/`.
They are historical evidence, superseded by the final results below.

## Final changed-default verification

| Check | Result |
|---|---|
| Complete serial matcher, Social history, generation, queue, acceptance and Balanced regression | 655 passed, 13 opt-in benchmark tests skipped; 52 passed files, six skipped files; 189.91 seconds |
| Focused changed-default, Interclub, queue and Balanced isolation tests | 83/83 passed |
| Existing API integration file after test-only type assertion repair | 20/20 passed |
| Independent constrained Interclub core coverage | 6/6 passed |
| Frozen Balanced/isolation checks | 6/6 passed; existing Points/Elo envelope, oracle, API and simulation tests passed |
| Default 16/2 and 18/3 asynchronous sessions, all three audit seeds | 135/135 assigned quartets accepted exact; zero fallback; 12 strictly beneficial one-pair rescues |
| TypeScript `npx tsc --noEmit` | Passed |
| ESLint, all 81 changed/new source and frozen-fixture files | Passed |
| Local production build | Passed, Next 16.2.7 |
| `git diff --check` | Passed |
| Historical fixture verifier | All 19 frozen fixtures, raw contents and compact summaries verified |
| Source preservation | 15/17 engine sources unchanged; two context-plumbing changes; 14/14 original control sources verified; frozen Balanced test and API Balanced assertions unchanged |

Compiler errors in two new spy assertions were fixed with runtime object
assertions and an explicit empty completed-history assertion. Production types
were unchanged; the affected API file passed again. Production source hashes
were stable across the full serial run, compiler, lint and build.

All automatic Social paths, including queue creation and rebuild, use the
hardened gate with an explicit structural opportunity definition. Uncertified
candidates are discarded. Certified legacy fallback remains labelled and
separate from candidate exactness. Interclub search and acceptance now apply
the same legal vocabulary to the same completed-only history and full roster.

The complete changed-default validation has no meaningful remaining blocker.
The Social default and context repair are approved for the requested repository
commit/merge/push. Balanced Points/Elo retain their behavior. Immediate
asynchronous refill remains in use; joint refill remains disabled. No schema,
migration, dependency or deployment workflow changes are included, and no
migration or deployment command was run.

The final source/validation manifest and logs are preserved under ignored
`benchmarks/generated/social-interclub-context-repair/final-2026-10-07-v1/`.
