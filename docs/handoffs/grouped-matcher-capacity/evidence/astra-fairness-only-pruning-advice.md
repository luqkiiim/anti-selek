# Astra fairness-only pruning review

2026-10-16; bounded read-only feedback on the current gate split in balancedRecurrence.ts and socialBatch.ts. No app edits or tests run. The isolated22-player failure result was reported by the parent, not rerun here.

## Conclusion

The two new uses of baselineGlobalFairnessClass are sound objective-preserving pruning, provided the existing independent globalFairnessBound remains valid. A legal witness need not also reach the global schedule-rank/starvation lower bounds before these particular prunes become justified.

## Proof and actual gates

1. getSocialFairnessVector (scoring.ts:40-50) contains ascending effective-count multiset followed by arrival-priority components. Current considerBaseline sets baselineGlobalFairnessClass only on equality of the FULL vector with globalFairnessBound (balancedRecurrence.ts:2135; socialBatch.ts:1816). Equality attains an independent relaxed lower bound, so no legal completion can have better fairness. Every contender capable of tying/beating the incumbent must have the identical count multiset, regardless of later rank/starvation/balance fields.
2. Therefore a player whose count exceeds globalFairnessBound[required-1], the maximum in the count prefix rather than the arrival tail, cannot occur in a winning completion. Current candidatesInGlobalCountClass remains guarded by balancePolicy and baselineGlobalFairnessClass (recurrence2371-2377; production2006-2012). It caches only a complete filtered result after budget checking. Candidates at or below the cutoff are retained; this is a necessary constraint, not a claim that all such candidates tie fairness.
3. Baseline comparison is lexicographic fairness, schedule rank, starvation, max balance gap, total balance gap (recurrence2123-2134; production1804-1815). Once fairness is globally optimal, a profile with rank greater than the incumbent's rank loses before starvation or balance is considered. Current outer-profile prune uses strict greater-than and baselinePhase plus the new fairness flag (recurrence2386; production2021). Lower and equal ranks remain searchable. It is safe when the incumbent rank is2 and the globally lowest rank0 is infeasible with optimum fairness.
4. Certification remains stronger: baselineGlobalRotationClass also requires starvation lower-bound equality and lowestScheduleRank, and baselineProven additionally requires maxBalanceGap===0 and totalBalanceGap===0. I inspected these retained gates in both engines. Fairness alone must not permit early baseline certification, the existing balance-only dominance prune, or treating rank/starvation as certified after interruption.

## Required focused validation

- Add2/3-court cases whose first globally fair legal witness has nonlowest schedule rank, including a later lower-rank witness and an equal-rank better-starvation/balance witness. Compare the full optimum tuple against the frozen exhaustive reference.
- Include nonempty arrival priorities and locked players so the full-vector gate and maximum-count-prefix index stay correct.
- Earlier eligibility filtering can alter the shortest-compatible-court heuristic at recurrence2640-2652 and its production counterpart. Removing objective losers is safe, but does not by itself prove identical first tied witness, candidate traversal, or seeded final draw. Compare complete selection/layout and random-call behavior under deterministic unbounded/exhaustive conditions where exact output preservation is required; certificates alone are insufficient evidence.
- Interrupted search must still produce no balance certificate unless the unchanged full baselineProven condition holds. Preserve complete-cache publication checks.

No concrete correctness defect found in the inspected gate split. This is not overall patch or release approval, and the isolated1.515s result is not a capacity-matrix pass.
