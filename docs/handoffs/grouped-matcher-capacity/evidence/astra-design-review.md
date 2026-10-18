# Astra design review: grouped matcher capacity

Reviewed 15 October 2026. Review only; no application edits or tests run. Verified against worktree C:\Users\pc\.codex\worktrees\grouped-matcher-capacity\tournament-app at c6f49043 (origin/main baseline). Latest quota snapshot: 23% five-hour and 73% weekly remaining. Implementation remains held for the user's ordinary-planner substitution decision.

The newer baseline preserves the main findings. It additionally exposes a global read-only session view and mutationActor plumbing: preserve these when introducing queue refresh or editing persistence calls.

## Required implementation details

1. **GET queue refresh is new behavior.** Session GET only serializes the saved queue (src/app/api/sessions/[code]/route.ts, around 380-450). The existing rebuild call at line 796 belongs to PATCH. Add deferred autoqueue creation deliberately, after authorization and only for appropriate mutable session views; the newer globalView/readOnly path must remain read-only. Preserve autoqueue disabling, active-session/court availability checks, 8-player/1-court suppression, existing manual queues, and concurrent unique-queue behavior. Do not treat the existing GET as already providing recovery.

2. **Timeout protection already exists.** selectRotationPlayerGroupBatch rejects result.debug.searchLimitReached at selection.ts:1871 before trying a smaller court count. An earlier preliminary suggestion that all no-selections degrade was corrected. Preserve this protection and propagate preprocessing/verification/skip-retry cancellation as exhaustion, not exhaustive infeasibility. An interrupted proof cannot authorize a smaller batch or changed scheduling priority.

3. **Use one monotonic request deadline throughout.** Primary plus acceptance ends by 3 seconds; fallback plus acceptance by 4.5 seconds; queue receives only the remainder of the 5-second computation budget. Preserve per-phase 2-second and 200,000-branch limits with the shared ceiling; retries and phases cannot reset the overall deadline. Current preprocessing occurs before the phase timer (balancedRecurrence.ts:704-761); acceptance rebuilds structural and coverage contexts (balancedCandidateAcceptance.ts:273,680-700); socialVariety.ts:339 enumerates quartets. Instrument those paths, sorting, pruning, and post-operation checks. Interrupted acceptance must never emit a certified result. Preserve unrelated callers through optional internal budget context.

4. **Cache only complete RNG-independent structural data.** This agreed scope is appropriate. The current candidate cache at balancedRecurrence.ts:1595-1697 is unsuitable for sharing: arrays sort in place, candidates hold mutable phase scores, and partial enumeration reaches a cache write. Do not share these salted mutable candidate arrays. Publish shared cache entries only after complete construction; interrupted partial results are unusable. Distinguish exact eligible rosters, history, modes, opportunity constraints, normalization, and exclusions. Constraint callbacks cannot be safely equated by JSON serialization. Keep verification independent of candidate-produced certificate claims.

5. **Preserve random draws and ordering.** balancedCandidateAcceptance.ts:1389-1440 records primary draws and replays them for fallback. Caching cannot eliminate draws, reuse differently salted candidates, or change stable tie order. Verify cached versus uncached results and subsequent RNG state with the same deterministic input. Do not silently reinterpret draw preservation as only similar output distributions.

6. **Committed batches must survive optional queue failure.** The batch path still awaits queue rebuild after createMatchesForAssignments commits (generate-match/route.ts:459), so an unexpected queue error can return failure for already persisted courts. The newer rest-player branch has a special catch, but the batch path does not. Handle queue exhaustion/failure separately, report actual persisted matches and queue/null, and record queue diagnostics. Never race uncancellable writes against a timeout. Preserve mutationActor and existing atomic court/skip updates.

7. **Render committed courts urgently.** useSessionCourtMatchCreation.ts:70-84 patches state then schedules refresh, but useSessionData.ts:179 defaults to startTransition. Use the existing { urgent: true } patch option for committed creation results. Test that all created courts become visible while the refresh promise is deliberately pending, rather than merely checking function call order.

8. **Measure end-to-end latency separately.** A 4.5-second fallback ceiling leaves 500 ms for persistence, optional queue work, serialization, and transport/rendering. Queue may start only with at least 250 ms remaining and must inherit the deadline. The requested preview p95 end-to-end <=5 seconds cannot be inferred from a passing computation clock; measure it separately, along with <=100 ms computation overshoot.

## Focused evidence to retain

- Proposed 22/24-player three-court group, side, strength, crossover, history, and seeded fixture matrix; independently assert rules and full court count for known feasible cases.
- Small independent oracle; existing 8-player/1-court and 16-player/2-court regressions.
- Fake-clock expiration inside preprocessing, acceptance, and retries; no partial cache reuse; no false certificates or reduced court counts after exhaustion.
- Cache/draw equivalence and unchanged no-budget caller behavior.
- Atomic batch failure and skip consumption; concurrent GET queue creation; post-commit queue failure preserving successful response; global read-only view never writes.
- Browser shows persisted courts before refresh completes; preview latency evidence at the final tested revision.

No implementation or release approval is implied by this design review. Await the planner decision and implementation before a code review.
