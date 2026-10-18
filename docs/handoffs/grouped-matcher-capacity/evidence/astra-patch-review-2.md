# Astra patch review 2: exact baseline optimizations

Read-only inspection of current worktree balancedRecurrence.ts and socialBatch.ts. No application edits or tests run. Scope limited to new final-leaf baseline pruning, global-count eligibility filtering/cache, and compatible-list minimum bounds. Parent reports serial42/42 checks and saved24-player reproduction now complete; this reviewer did not independently rerun them. Review stopped at fresh9% five-hour allowance (86% weekly); no further inspections performed.

## Result

No confirmed incorrect prune found in the inspected optimization. This is narrow static feedback, not release approval or verification of the earlier four repairs.

- Final leaf predicate (recurrence around2139-2153 and2949-2958; production equivalent) compares the same complete fairness/rank/starvation/max-gap/canonical-total tuple as considerBaseline, rejects missing locks, and prunes ties only in baseline. considerBaseline already rejects >=0, so this preserves objective updates and avoids unnecessary leaf expansion. It does not consume RNG.
- Global count cutoff (recurrence1663-1666; production1354-1357) reads globalFairnessBound[required-1]. scoring.ts confirms the first required entries are ascending effective counts; this is the maximum count in the attained optimum multiset. Filtering activates only with balancePolicy and baselineGlobalRotationClass, which requires equality to global fairness, lowest schedule rank and global starvation. A player above that maximum cannot belong to any completion matching the attained globally minimal fairness vector. The gate is essential; keep it.
- The filtered candidate cache is function-local and keyed by the phase candidate-list object. It publishes only after filterCandidates finishes and a deadline check. Filtering preserves source-list order and retains all candidates at or below the cutoff; it does not itself certify a new result or remove equal-count alternatives.
- Reusing compatibleByCourt for minimum gap bounds remains optimistic: each retained list is the set eligible for that state (including disjointness and applicable canonical ordinal), and independently minimizing each court still relaxes overlap among remaining courts. The existing roundoff cushion on the total bound is retained.

## Focused evidence still needed for this optimization

The new8-player oracle in groupedCapacityBenchmark.test.ts:306 uses courtCount1. It checks count fairness and an allowed balance envelope, but does not exercise the new multi-court compatibility filter or baseline final-leaf walk. It cannot establish this patch's multi-court exactness by itself.

Add/retain a small2/3court differential against the frozen exhaustive implementation using unequal counts with at least one eligible player above the attained cutoff, locks (including a higher-count locked player), arrival priorities, heterogeneous court constraints, equal baseline tuples, and fractional gaps. Compare baseline fairness/rank/starvation/max and total gaps, final selected layout and subsequent RNG state. A case where no legal witness reaches the global bound must prove the count filter stays inactive.

One ordering nuance to cover: filtering can change which remaining physical court has the shortest list, and therefore DFS visitation order. Relative order within each list is preserved and no draws were added, but this alone is not a proof of identical first witnesses on complete ties or identical final layouts. Existing exactness tests may cover some cases; do not infer full tie-order preservation solely from the count-cutoff proof.

No further investigation of cache mutation across unrelated caller patterns or earlier API/cancellation repairs was performed in this bounded pass. Parent should verify the exact final source revision and retain the reported serial evidence. No release approval is implied.
