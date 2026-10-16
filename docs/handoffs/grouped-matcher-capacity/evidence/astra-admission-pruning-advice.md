# Astra: replay admission and coverage leaf pruning

Reviewed 2026-10-16, read-only, in C:/Users/pc/.codex/worktrees/grouped-matcher-capacity/tournament-app. This is bounded static algorithm feedback, not complete patch or release approval. No tests run and no production files changed.

## Conclusion

No correctness defect identified in the new hard replay-admission and coverage-only tie pruning inspected. Preserve the current phase and policy guards. These prune branches whose eventual leaves the existing admission/objective code already rejects.

## Exact evidence and reasoning

- balancedRecurrence.ts:2982-2993 and socialBatch.ts:2339-2350 guard the replay ceiling by balancePolicy, gateRespectRest, an existing replayBaseline, and exclusion of baseline/replay-baseline phases. The partial selected replay count is the sum of cached counts for used and candidate masks. Compatible candidates are disjoint and the count is nonnegative, so additional courts cannot reduce it.
- In the coverage phase, the ceiling is Rmin. considerCoverageBaseline requires replay count exactly Rmin (balancedRecurrence.ts:2211-2214; socialBatch.ts:1892-1895). The recurrence engine also uses Rmin for the mature-recurrence frontier; its admission requires the same fairness, rank, starvation, replay count and balance class (balancedRecurrence.ts:2217-2240). Therefore partial replay > Rmin safely eliminates every completion. Equality must remain searchable.
- In later ranking phases the ceiling is allowedImmediateReplayCount, set to certified Rmin+1 (balancedRecurrence.ts:3140-3144; socialBatch.ts:2489-2493). Final recurrence admission at 2261-2275 allows exactly Rmin or an eligible Rmin+1 coverage/recurrence exception. Production admission at socialBatch.ts:1917-1926 likewise permits only Rmin or eligible Rmin+1. Strict greater-than is required: changing this guard to >= would incorrectly remove valid exceptions.
- The coverage-only final leaf guard (balancedRecurrence.ts:3021-3025; socialBatch.ts:2377-2381) rejects gain <= incumbent coverage gain, exactly matching considerCoverageBaseline. A rejected leaf cannot update either the objective or the retained first witness. This remains safe even before its fairness/balance/lock checks because those only reject additional leaves. Coverage summation is deterministic BigInt addition over physical assignments (974-975 and 679-680), not a random draw.
- The new guards run after court selection and inside the existing candidate loop; they do not reorder surviving candidates or replace the earliest admissible witness. They do not add RNG calls. The coverage-only tie rule must not be generalized to final variety/ranking, where equal coverage can improve later objectives or participate in draw semantics.
- Budget checks are retained on the new reject paths, and the coverage leaf is checked before computing its small batch gain as well as after rejection. Pruned leaves no longer consume explored-branch increments; that is appropriate for exact infeasibility/objective pruning. It can allow a bounded search to reach later phases, so equality of timed-out old/new outputs is not itself an acceptance criterion.

## Focused evidence still needed from implementation owner

1. Differential exhaustive completion with Rmin > 0 and candidates at Rmin, Rmin+1, and Rmin+2; verify C/T frontiers and selected layouts/draw sequence, not only returned replay count.
2. A recurrence-rescue case where Rmin+1 passes through T while not improving C, plus a coverage exception. This catches an overly broad ceiling or equality prune.
3. Rest disabled and social-priority policy cases, which must bypass this new Balanced/rest ceiling; preserve existing rank, fairness, starvation, and balance gates.
4. Equal-coverage witnesses with different later variety/layout outcomes, showing the coverage phase keeps its original first witness while final ranking still examines admissible ties.
5. Fake-clock interruption along repeated rejected candidates: no completed certificate from an interrupted phase and no partial cached completion lists.

The reported timing improvement and full-capacity matrix are separate verification evidence; neither was independently rerun in this review.
