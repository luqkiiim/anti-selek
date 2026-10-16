# API, queue, and UI checkpoint (15 October 2026)

Worktree: `C:\Users\pc\.codex\worktrees\grouped-matcher-capacity\tournament-app`. No commit or release.

## Changes

- Targeted Points + groups + Mixed rosters with 12–24 active players and three requested courts create one monotonic 5-second budget before matchmaking-state preparation. The budget flows through grouped plans, social opportunity preparation, batch selection, skip retries, and optional queue selection. The targeted search keeps 200,000 branches and two seconds per phase.
- Capacity trigger corrected after review: all eligible grouped Points + Mixed rosters with 12 through 24 active players and three requested courts use the same budget. The former exact 22/24 whitelist excluded 23. An eligible count of 25 remains on the prior no-budget policy and is not rejected by this gate. Other session formats and court counts retain their prior policy. No matching whitelist exists in `selection.ts`; it accepts the budget supplied by the route.
- `getRotationSelectionOptions` now passes the same budget into `buildSocialVarietyContext`, including the grouped structural opportunity enumeration. Expiry propagates as an explicit time-limit failure, without committing a partial batch.
- All created courts commit atomically before optional queue work. The queue starts only when at least 250 ms remain before both the original five-second deadline and the root-relative 4.5-second fallback cutoff. A late queue or unexpected queue failure leaves the successful persisted-match response intact and returns the actual stored queue or null. The deadline is never recreated for queue work.
- The ordinary session GET recovers a deferred automatic queue for an authenticated admin/operator only. Global, quick-access, and participant-only reads cannot trigger it. GET, PATCH, and generate-match queue writers now propagate `SessionMutationActor` so access is rechecked after acquiring the database writer.
- The creation hook applies committed court payloads with `{ urgent: true }` before scheduling refresh.

## Evidence

- `npx vitest run 'src/app/api/sessions/[code]/generate-match/social.integration.test.ts' 'src/app/api/sessions/[code]/generate-match/route.queueBudget.test.ts' 'src/app/api/sessions/[code]/route.get.test.ts' 'src/app/session/[code]/useSessionCourtMatchCreation.test.tsx' --reporter=dot`: 50 tests passed.
- `npx vitest run 'src/app/api/sessions/[code]/generate-match/route.integration.test.ts' -t 'does not create a deferred queue after the operator loses access' --reporter=dot`: passed. This is a real SQLite **two-court** revocation test: access changes after batch commit and before queue writer acquisition, so the queue is denied while two matches remain persisted. It is evidence for actor propagation and committed-response behavior, not a 22/24-player three-court capacity result.
- The real SQLite post-commit unexpected queue failure test passed separately. The urgent UI test shows both committed court cards while the refresh promise remains unresolved. The fake-clock grouped preparation test expires inside `buildSocialVarietyContext`. The late-queue test checks the 4.5-second phase cutoff while 400 ms remain on the five-second root clock.
- `npx tsc --noEmit --pretty false`: passed on the final current worktree after the API test mock typing fix and matcher-owned tuple fix. No broad suite or final build was run here.
- `npx vitest run 'src/app/api/sessions/[code]/generate-match/route.queueBudget.test.ts' --reporter=dot`: 3/3 passed. The budget target is true for every count 12–24 and false at 11/25 and for other formats or court counts.
- `npx vitest run 'src/app/api/sessions/[code]/generate-match/route.integration.test.ts' -t 'creates three grouped Mixed courts from 23 eligible players' --reporter=dot`: passed in 19.83 seconds including fresh SQLite setup. The route persisted three courts using twelve distinct players from a 23-player 12/11 group roster. Queue was deliberately deferred with 479 ms left on the five-second root clock because fewer than 250 ms remained before the root-relative 4.5-second fallback cutoff. This was an integration correctness run, not isolated API latency evidence.
- `npx tsc --noEmit --pretty false`: passed again after the 12–24 trigger change and 23-player route test were added.

## Files owned in this patch

`src/app/api/sessions/[code]/generate-match/{route.ts,selection.ts,route.integration.test.ts,route.queueBudget.test.ts,queueBudget.ts,social.integration.test.ts}`; `src/app/api/sessions/[code]/queue-match/shared.ts`; `src/app/api/sessions/[code]/{route.ts,route.get.test.ts}`; `src/app/session/[code]/{useSessionCourtMatchCreation.ts,useSessionCourtMatchCreation.test.tsx,sessionMatchActionTypes.ts}`.

Pending parent/Astra review, full capacity evidence, and release checks. No schema change or production database migration.
## 2026-10-15 queue Clear regression checkpoint

- `generate-match/route.ts`: post-commit queue helper now reports whether queue work was deferred by the existing search budget. Batch success includes `deferredQueueRecovery: true` only for an actually deferred, auto-enabled, absent queue; persisted courts remain the primary successful result.
- `sessions/[code]/route.ts`: queue reconstruction on GET now requires explicit `recoverDeferredQueue=1`; an ordinary GET, including one after Clear, is read-only. Existing authenticated operator/admin, active session, autoqueue, queue-absent and mutation actor gates remain.
- `useSessionData.ts` and court action hooks: the deferred response schedules a one-shot recovery GET; ordinary polling/refresh never carries the flag. Clear cancels a pending timer, invalidates recovery waiting behind a poll, and awaits any dispatched recovery request before DELETE. Recovery GET omits client abort timeout because an aborted fetch does not establish that its server writer stopped. Created courts still patch urgently.
- Focused tests: `npx vitest run 'src/app/api/sessions/[code]/route.get.test.ts' 'src/app/session/[code]/useSessionCourtMatchCreation.test.tsx' --reporter=dot` passed 29/29 before adding two more UI cases. Then `npx vitest run 'src/app/session/[code]/useSessionCourtMatchCreation.test.tsx' --reporter=dot` passed 3/3, covering marker URL and pending cancellation.
- `npx tsc --noEmit --pretty false` passed after the missing dependency wiring and test harness were patched.
- Still required after quota reset: explicit in-flight recovery versus Clear test, real DELETE→ordinary GET persistence test, no-access recovery flag test, rerun type check and review. No DB/integration tests run because matcher agent owned CPU window. A stale explicit recovery URL from a different client after Clear cannot be distinguished from authorized intent without persisted state; ask Astra to assess the no-schema design limit.

## 2026-10-16 queue recovery continuation

- Client recovery now retains intent through a previous polling cooldown and a recovery GET returning 429, honoring Retry-After via cancellable retry. Clear invalidates pending timers/generation and waits for an already dispatched recovery response before DELETE. The guarantee is response ordering for the same mounted client; a network rejection does not prove the server stopped. A stale flagged request from another authorized operator remains an explicit authorized queue action, as assessed in astra-patch-review-4.md; there is no cross-client global cancellation or exactly-once claim without durable state.
- `postCommitQueue.ts` owns optional queue outcome. Preflight deferral, a thrown search-budget exception, or an admitted attempt that ends past the shared queue cutoff produces recovery intent only for an absent auto-enabled queue in the batch response. Fast infeasible null does not. `queue-match/shared.ts` now preserves the matcher's explicit time-limit error for budgeted implicit rebuilds instead of swallowing it as infeasibility.
- Added writer-time autoqueue enabled / all courts busy recheck for implicit automatic rebuilds. Explicit operator POST queue behavior is preserved by keeping this check opt-in only to the rebuild helper. This final patch has not yet been typechecked or tested; do so next slot.
- Tests passed: `npx vitest run 'src/app/api/sessions/[code]/route.get.test.ts' 'src/app/session/[code]/useSessionCourtMatchCreation.test.tsx' --reporter=dot` (35/35); `npx vitest run 'src/app/api/sessions/[code]/generate-match/postCommitQueue.test.ts' --reporter=dot` (4/4). These cover outsider/global flagged GET no write, ordinary GET after Clear read-only, in-flight recovery response before Clear DELETE, 429 and previous-cooldown retry, and post-commit timeout/infeasible outcomes. `npx tsc --noEmit --pretty false` passed before final writer-time check patch.
- Real DB test passed in isolation: `npx vitest run 'src/app/api/sessions/[code]/generate-match/route.integration.test.ts' -t 'keeps a cleared automatic queue absent through an ordinary session GET' --reporter=dot` (1 pass, 24 skipped; 14.81s). It generates a persisted automatic queue, DELETE clears it, then ordinary GET returns null and leaves storage empty.
- Remaining: typecheck final writer-time check patch; add/execute focused writer-time settings race and budgeted time-limit propagation tests if quota permits; final Astra review. Do not run broad matcher/DB suites concurrently with capacity agent.

## 2026-10-16 final API guard verification

- Added focused mock tests in `queue-match/shared.playerGroups.test.ts` for writer-time automatic eligibility: autoqueue disabled after selection => no write, court freed after selection => no write, unchanged eligible state => queue created. Explicit operator queue creation while the autoqueue toggle is off still succeeds. A budgeted matcher's explicit time-limit `GenerateMatchError` is propagated as `MatchmakingSearchBudgetExceededError` while the unbudgeted helper retains its previous null behavior.
- `npx vitest run 'src/app/api/sessions/[code]/queue-match/shared.playerGroups.test.ts' 'src/app/api/sessions/[code]/generate-match/postCommitQueue.test.ts' --reporter=dot`: 19/19 passed. No DB/matcher suites rerun while capacity timing owns CPU.
- Final `npx tsc --noEmit --pretty false` was run after the queue writer patch. It failed only in concurrently edited `src/lib/matchmaking/groupedCapacityBenchmark.test.ts` due union `result`/`error` access and implicit-any callbacks; no API/UI diagnostics appeared. Benchmark owner was notified by parent to repair. Rerun full tsc after that file is fixed.
- API patch is ready for final Astra review. No further API edits are planned unless review identifies a specific issue.

## 2026-10-16 stale local revision during recovery 429

- Fixed `useSessionData.fetchSession` so active session/generation is checked before handling HTTP errors, while local-revision staleness guards only the error UI and successful data application. A flagged recovery GET returning 429 after a local optimistic patch now still records Retry-After and returns `retry`, retaining the one-shot recovery intent. A stale successful payload still cannot overwrite the local patch.
- Added UI hook tests for an unresolved recovery GET, local patch, then 429: recovery retries after cooldown; Clear during that cooldown cancels the retry and sends DELETE. `npx vitest run 'src/app/session/[code]/useSessionCourtMatchCreation.test.tsx' --reporter=dot` passed 8/8.
- Full `npx tsc --noEmit --pretty false` passed after this change and concurrent benchmark repair. No further API/UI edits are pending.
