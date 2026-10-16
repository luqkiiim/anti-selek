# Astra patch review4: explicit recovery and replay completion filter

Bounded read-only review of current grouped-capacity worktree on16October2026. No application edits or heavy tests. API owner is editing concurrently; findings describe the inspected snapshot and were relayed to parent immediately. No release approval.

## P2: admitted queue exhaustion loses recovery intent

src/app/api/sessions/[code]/generate-match/route.ts:44-75 (rebuildQueueAfterCommitDetailed), batch response around505-514; queue-match/shared.ts tryRebuildQueuedMatch catch path.

The deferred flag is computed only before queue work from !canAttemptQueueWithinSearchBudget. If the attempt is admitted and then consumes its remaining shared deadline, a thrown budget error reaches the catch but deferred remains false. A search-limit GenerateMatchError can instead be swallowed by tryRebuildQueuedMatch and returned as null, also with deferred:false. The successful batch response therefore omits deferredQueueRecovery even though queue computation was budget-limited. Ordinary GET is now read-only, so it no longer repairs this absent queue automatically.

Fix: preserve an explicit budget-exhausted queue outcome through the helper; emit recovery intent for absent, auto-enabled queues whose admitted work ran out of budget as well as preflight deferral. Distinguish exhaustion from genuinely infeasible/disabled/suppressed queues to avoid endless recovery. Test entry with sufficient time, expiry during selection/acceptance, successful persisted batch response with marker, then explicit recovery with a fresh request.

## P2: recovery intent is lost to polling cooldown/429

src/app/session/[code]/useSessionData.ts:66-70,105-114,211-232.

scheduleDeferredQueueRecovery waits for an existing request, then calls fetchSession once. fetchSession silently returns when Date.now()<nextRequestAllowedAtRef, and also resolves after a429 response. The one-shot recovery promise is then cleared. A prior in-flight poll returning429, or the recovery request itself returning429, thus consumes the only recovery intent without executing queue work. Ordinary future polls lack the flag.

Fix: have fetchSession expose dispatch/outcome or retain pending recovery state until it is actually attempted successfully or deliberately cancelled. Respect Retry-After with a cancellable scheduled retry; do not bypass rate limiting. Clear must invalidate this waiting intent. Test both prior-poll429 and recovery429, plus Clear during cooldown. Network errors likewise should not be described as confirmed server completion.

## Clear protocol and cross-client semantics

The original ordinary-GET Clear regression is repaired in the inspected protocol: GET mutation now requires recoverDeferredQueue=1, while ordinary refresh/poll is read-only. Deferred generation response alone schedules the local flag. Clear cancels the timer/generation and awaits the local dispatched recovery promise before DELETE. This addresses successful-response ordering in the same mounted client. API owner is adding real DELETE->GET and in-flight tests; these were not rerun here.

A stale flagged request from another authorized operator remains an explicit queue-creation action and can recreate an absent queue after Clear. This is not an authorization bypass: GET still checks ordinary mutable view, operator/admin status, active/auto-enabled state and actor authorization at the writer. Without durable cancellation/generation state, a Boolean flag cannot identify whether that request is a fresh intent or an old continuation. I would not add a security blocker solely for the ability of an authorized operator to invoke it; treat Clear as clearing the current queue, not globally revoking every other client's authorized queue action. Do not claim global cancellation or exactly-once recovery.

If product semantics require Clear to invalidate every earlier continuation across devices, client cancellation is insufficient; a durable intent/version mechanism is required. No-schema local alternative is the present explicit-action semantics plus per-client sequencing and fresh writer checks. A process-local suppression map or silently disabling future autoqueue would not preserve existing behavior. Do not repurpose unrelated Session JSON fields as hidden cancellation storage. Recheck autoqueue-enabled/court-state conditions transactionally for slow recovery versus settings races.

Same-client network uncertainty remains: removing the client timeout avoids intentional abort, but a rejected fetch does not prove the server writer stopped. cancelDeferredQueueRecovery currently awaits a promise that resolves even when fetchSession catches a network error. This limits the claimed ordering guarantee to completed responses; test/report that limit and avoid asserting server completion merely from client promise settlement.

## Replay completion filter: admissible in inspected placement

balancedRecurrence.ts around2677-2697 and socialBatch.ts2233-2253 filter each remaining compatible list to getImmediateReplayCountForMask(used|candidate.mask)<incumbentReplay. This runs only in replayBaselinePhase after equality of fairness lower bound, schedule rank and starvation lower bound. Therefore no completion can improve the stronger prefix; a winning completion must strictly lower replay count. Disjoint extra courts add a nonnegative number of zero-rest appearances. A used-plus-quartet count already >= incumbent cannot become a strict improvement after more courts. The filter is a necessary condition, not a shortlist, and does not claim sufficiency.

The physical court choice is made before filtering, then only retained candidates are traversed in their previous order. This preserves the ordering of potentially updating subtrees and first equal replay witness. Filtering uses bounded filterCandidates; an interrupted scan unwinds before compatibleByCourt assignment, and these local improving arrays are not published as complete persistent candidate caches. No RNG is consumed by the predicate. Coverage remains on strict >Rmin pruning, so equal-replay layouts can still compete for coverage/recurrence/later ranking. No additional incorrect-pruning finding in this narrow inspection.

Retain differential tests for stronger-prefix-improvable branches (filter must not activate), an incumbent improvement during iteration, equal replay with different coverage, and identical/heterogeneous physical courts. Compare Rmin, first witness, certificates, final layout and subsequent RNG state. Saved30-match reproduction success alone is not complete proof.

## Handoff

Two recovery gaps were sent to parent for API owner. Replay filter has no identified flaw within inspected guards. Later file changes, new tests and full acceptance evidence require final review; this report is not a test-pass or release claim.
