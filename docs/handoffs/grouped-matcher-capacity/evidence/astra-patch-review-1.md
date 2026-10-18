# Astra focused patch review 1

Status: in progress; read-only review of uncommitted grouped-capacity patch in C:\Users\pc\.codex\worktrees\grouped-matcher-capacity\tournament-app. No application edits. Review interrupted by quota once; resumed on renewed parent authorization.

## Findings established before interruption

- P1: New session GET queue recovery does not pass a SessionMutationActor. route.ts calls tryRebuildQueuedMatchForSessionId(sessionData.id); that helper reloads via loadSessionRecordById, which never attaches mutationActor. createQueuedMatchForSession passes undefined into sessionMatchMutationTransaction, whose fresh authorization check runs only if actor is present (src/lib/sessionProfileIdentity.ts:132). An operator revoked after the GET membership check can still create a queue after slow computation. Pass the authenticated user/global-admin actor through the recovery helper into the transaction and test revocation before writer acquisition. Existing automatic rebuild callers also omit actors; the new GET mutation must not extend this bypass.
- P1: selectRotationPlayerGroupBatch called getRotationSelectionOptions without searchBudget, and that helper built constrained social variety context without it. Its heavy quartet preprocessing ignored cooperative cancellation and cache. Parent reports API owner is fixing; verification pending.
- P2: Postcommit queue admitted with root remaining >=250ms still enters wrapper cutoffs at original elapsed3s/4.5s. At elapsed4.6s the root has400ms but both child budgets have expired. Parent reports explicit late deferral fix underway; verification pending.

## Reviewed safeguards so far

- GET explicitly excludes globalView and quick-access reads and requires administrator/operator membership before recovery; spectator read does not directly write.
- Postcommit helper catches queue errors and attempts to return existing persisted queue, preserving committed batch response.
- Structural cache stores frozen complete opportunity data and clones sets for consumers; history is recomputed. Cache publication follows deadline checks, and candidate-array cache writes are suppressed after interruption.
- Acceptance performs pre/post budget checks and rejects interrupted validation; per-phase deadlines cap against root children.

These observations are not final approval. Engine review is continuing; known verification matrix gaps are tracked by parent.

## Engine review completion

### P2: frontier and bound preparation still contains uncancellable full candidate scans

Locations: src/lib/matchmaking/v3/balancedRecurrence.ts:892-944 (retainPerMaskMetricFrontier), :1162-1176 (getOptimisticCoverageGainUnits), :1186-1209 (getCompatibleCandidates); recurrence frontier caller at :2352-2366. The new budget-aware sort runs only after the full per-mask frontier has been grouped, scored, and filtered. These helpers scan complete candidate lists without checking the phase/request deadline. A three-court 24-player run can enter them immediately before expiry and continue processing all remaining candidates; a check at the next DFS/sort boundary cannot interrupt that work. This is a cooperative-cancellation gap, not evidence of a false certificate or a measured >100ms overshoot.

Correction: insert bounded-frequency checks into candidate/group scans, propagate interruption without retaining partial frontier/bound/cache results, and stop the caller immediately. In particular, never use a partial maximum as an admissible bound. Add a deterministic expiry test during frontier preparation, not merely during candidate enumeration or final sort. Apply the same discipline to corresponding socialBatch helper scans used by fallback. The exact overshoot target still needs elapsed-time evidence.

### Engine observations without an additional correctness finding

- New singleMatchGains optimization matches the old single-partition window delta for valid distinct-player partitions: it uses the same baseline window, feasible-type count, denominator and court-type classification. Final multi-court evidence scoring remains separate. No arithmetic mismatch identified by this static review.
- Cache contents are opportunity unions only, not salted candidates or history scores. Complete publication and fresh Set copies prevent interrupted-cache publication and consumer poisoning. Roster values and callback identities distinguish current intended inputs. Stateful callback closures are not snapshotted; current grouped constraint builders are pure for fixed compositions, so this was not elevated to a production finding.
- Primary/fallback acceptance rejects expiration before/after verification and threads budget into expensive context construction. Safe-no-selection paths preserve searchLimitReached rather than asserting infeasibility after an interrupted check.
- Primary and fallback still record/replay random draws; new per-partition recurrence lookup consumes no RNG. No new RNG consumption issue identified in engine diff. This does not replace the parent's serial regression rerun.
- The new budget sort deliberately stops expensive comparisons after interruption and runSearch rejects interrupted lists. Candidate caches are no longer published from interrupted enumeration. Existing completed core certificates may still support production fallback under its pre-existing acceptance contract.

## Handoff

Focused review is complete as a bounded static review. No tests were run by this reviewer and no application files were edited. First three findings above were established on the preceding patch snapshot; parent reports preprocessing and late-queue repairs are underway, so owners must verify resolution rather than treat this document as describing their final revisions. The actor finding was relayed separately. Review did not approve release.
