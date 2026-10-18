# Astra patch review 5: capacity fixture fidelity and queue recovery

Date: 2026-10-16. Read-only inspection in C:/Users/pc/.codex/worktrees/grouped-matcher-capacity/tournament-app. No application edits or tests run. This is bounded static review, not release approval. Implementation owners may repair findings after this snapshot; those repairs need separate verification.

## Findings sent to parent

### P2: capacity fixture forces a different policy for individual refills and regression sizes

At inspection, groupedCapacityBenchmark.test.ts:127 always creates and passes a five-second search budget. Production generate-match/route.ts:329 uses queueBudget.ts:4, whose current predicate is grouped POINTS/MIXICANO, three requested courts, and 12 through 24 unpaused players. One-court refills and 8-player/one-court or 16-player/two-court regressions therefore run budgeted policy in the fixture but unbudgeted policy in production. The injected budget changes search limits and candidate/fallback timing, so this cannot serve as their production-regression evidence.

Correction: use the same predicate in the fixture. Record requested court count, unpaused count, budget eligibility/applied, whole computation elapsed, and budget elapsed/remaining separately per step. Require budgetApplied === expected predicate; require targeted steps to remain within 5100ms. Keep an overall latency measurement for unbudgeted steps, and preserve the acceptance latency requirement separately rather than silently relaxing it. Require real full-court selections and all rule checks for every step. The matrix's rootBudgetApplied fixture-wide Boolean/every-step root timing check must become truthful per-step validation. Forced-budget stress is useful only as separately labeled evidence.

### P2: simulated refill timestamps precede the completions that free their courts

At groupedCapacityBenchmark.test.ts:244, completion time is now + (sequence+1)*10min, after schedule increments sequence. The next schedule creates matches at now + sequence*10min (217): ten minutes before the preceding completedAt/availableSince. For example, opening at t0 completes at t20, then its refill is created at t10. This is not a realizable match history and can distort temporal rest/history behavior.

Correction: use a monotonically advancing simulated event clock; complete active matches, update availableSince at that event, and create refills at or after the completion. Assert creation is not before each selected player's prior completion, each match completes after its creation, and busy courts remain unavailable. Keep actual wall-clock search measurement independent of simulated dates.

### P2: local state patch still discards a recovery GET's 429 retry intent

useSessionData.ts:99-106 returns before examining response status when localRevisionRef differs from the request snapshot. A score/player/local match patch during an unresolved recovery request increments that revision (patchSessionData around180). If the response is 429, the code never records Retry-After or returns retry; scheduleDeferredQueueRecovery consumes the pending intent. Ordinary GETs are deliberately read-only, so they cannot restore the deferred queue.

Correction: preserve active/code/generation guards, then process 429 cooldown and retry outcome independently of local snapshot revision. Apply the local-revision check before applying response data, not before preserving transport retry intent. The recovery-generation token already prevents Clear-cancelled intent from retrying. Add a test that patches local session state during an unresolved recovery GET, resolves it with 429, observes a flagged retry after Retry-After, and confirms Clear cancels that retry.

## Positive static evidence / limits

- Root clock is now created before buildMatchmakingState and getRankedCandidates. The same object reaches selectBatchMatches, grouped preparation/options, engine verification/fallback and grouped plan retries. State construction itself has no cooperative budget parameter; its elapsed time is counted and selectBatchMatches checks expiry on entry. No clock reset was found in this harness path.
- Fixture type is real POINTS with MIXICANO and groups. buildMatchmakingState maps sessionPoints into balance input (selection.ts:734-736). Trajectory winners receive +3 and all four participants increment matchesPlayed; availableSince and partner history update. These match the relevant production completion counters (matchCompletion.ts:774-795). Synthetic historical fixtures remain distinct from actual trajectories.
- Busy player exclusion derives from IN_PROGRESS matches; free requested courts derive from currentMatchId; duplicates/group snapshots/side equality and a same-pool/side/preference count-substitution check are asserted. queuedMatch remains null throughout; the ledger correctly leaves queue/pause/late-arrival/skip and API/browser evidence pending. This is not an end-to-end API benchmark. The local partition-balance bound and single-substitution count check are useful necessary conditions, not a complete multicourt fairness/balance oracle.
- Matrix marks a fresh invocation passed only with child exit zero, matching source fingerprint, completedCount 100, no failure state, all requested courts selected and finite timing under the stated threshold. Reusing old artifacts must also obey the new per-step budget policy/version once fixed. The 5100ms maximum is a computation overshoot guard, not evidence of p95 end-to-end <=5000ms; the ledger keeps that pending.
- queue-match/shared.ts:230-245 now rechecks autoQueueEnabled and absence of a free court inside sessionMatchMutationTransaction for implicit automatic rebuilds. The transaction already rechecks active session and mutation actor (sessionProfileIdentity.ts:127-132). The opt-in flag preserves explicit operator queue creation. No defect found in this new settings/open-court check.
- shared.ts:782 passes the opt-in writer guard. Its budgeted time-limit GenerateMatchError is converted to MatchmakingSearchBudgetExceededError and not swallowed as ordinary infeasibility. postCommitQueue.ts distinguishes a thrown budget error and consumed queue window from fast infeasible null and preserves committed-match success/read-back behavior. Matching the internal time-limit error by text is brittle to future wording changes but currently consistent; no actionable mismatch found.
- Existing tests inspected by name/source: shared.playerGroups.test.ts includes disabled toggle, freed court, unchanged eligibility, explicit operator behavior, and time-limit propagation; postCommitQueue.test.ts includes late admitted null, explicit timeout, fast infeasible null and existing queue. Parent reports 19/19 passed; I did not rerun. useSessionCourtMatchCreation.test.tsx covers ordinary429 and prior-cooldown retry, but did not yet cover local revision during429.
- Same-client Clear waits for dispatched recovery settlement and cancels retry generations. This does not establish global cancellation of another authorized client's explicit recovery action, or server completion after a network rejection. Those previously documented semantics remain unchanged.

## Remaining evidence

Reverify the three findings after repair; then let owners run corrected source-fingerprinted capacity evidence and focused API/UI regression tests. Full capacity matrix, preview end-to-end latency and final release checks remain outside this review.

## Addendum: API 429/local-revision repair verified (2026-10-16)

The review-5 API finding is resolved in the inspected source. useSessionData.ts:95-101 retains active-session/code/generation guards. Its non-success response path now handles 429, records Retry-After and returns retry before the successful-payload localRevision guard at approximately127. Stale successful response data still returns before setSessionData. Non-silent stale errors remain suppressed. Clear cancellation continues to use deferredRecoveryGenerationRef, independent of the local revision.

Actual new tests inspected in useSessionCourtMatchCreation.test.tsx:250 and281: both hold the first flagged recovery unresolved, invoke the Harness local-patch button (which calls patchSessionData and increments revision), then resolve that request with 429 and Retry-After=2. The first asserts flagged recovery count advances from1 to2 after cooldown. The second invokes the real clearQueuedMatch hook during cooldown, advances beyond retry time, asserts recovery count remains1 and verifies DELETE was dispatched. Thus the tests exercise the precise reported race and cancellation path. They do not separately assert stale successful payload contents, but the retained source guard preserves that behavior.

Parent reports this hook file8/8 and full TypeScript check passed; reviewer did not rerun tests. No new issue found in this narrow repair. The two capacity-harness findings remain separately pending owner repairs/evidence. This addendum is not full patch, capacity, or release approval. Fresh allowance before inspection:44% five-hour,46% weekly remaining.

## Addendum: bounded harness repair verification and quota stop (2026-10-16)

Inspected latest fixture version4 only for the requested repairs. Single-court requests now call selectSingleCourtMatchRespectingSkips with ranked candidates, production-built players/history/session and reshuffleSource:null, matching the normal one-open-court branch at generate-match/route.ts:355-364. Undefined searchBudget for that predicate is equivalent to the route omitting it. The deterministic Math.random spy wraps only the synchronous selector invocation and restores in finally on success or throw; no await occurs while the spy is installed.

Review5 chronology defect is repaired statically: eventTimeMs advances before completion, refill creation uses that current event time, and assertions require completedAt after creation, nondecreasing completion times, and each player's availableSince no later than next creation. Review5 budget mismatch is repaired statically: the production predicate is used before state construction, only eligible three-court12–24 requests receive the root, and metadata records nullable root timings per step. Runner complete() validates case identity, source fingerprint, fixture version, independently derives expected budget from requested courts/unpaused count, and requires applied===expected. Rule/full-court checks remain. Unbudgeted timings remain measurements rather than proof of the separate end-to-end latency criterion.

No new concrete error identified in this narrow inspection. Prior successful22/24 joint trajectories used an older source fingerprint and do not establish passes for these latest changes; new-fingerprint reruns remain required. No tests run by reviewer and no capacity/release approval.

Fresh usage reached7% five-hour/40% weekly after the short inspection; stopped feature work immediately and saved this checkpoint only. Parent notified to own scheduled continuation.
