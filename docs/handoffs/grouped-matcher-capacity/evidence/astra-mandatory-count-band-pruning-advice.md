# Astra mandatory count-band pruning advice

2026-10-16. Bounded read-only inspection of current balancedRecurrence.ts and socialBatch.ts; no implementation or tests run. Fresh allowance at review entry:41% five-hour,14% weekly remaining.

## Conclusion and proof

No concrete correctness defect found in the new mandatory count-band mask/prune. Once a legal incumbent attains the independent global fairness lower bound, a winning completion must have that exact count multiset. If the entire eligible active roster contains exactly k players at count c and that multiset requires k instances of c, all k players are necessary. This is true independent of schedule rank, starvation, balance, partner/opponent history, and the fairness vector's arrival-priority tail. The arrival tail can add restrictions; it cannot permit omitting a required count-band member.

The current construction in recurrence1666-1686 and production1357-1377 counts only globalFairnessBound.slice(0,required), where required=courtCount*4; it does not misread the arrival tail. Available multiplicity is computed from the whole active roster. For Balanced, active is availablePlayers (recurrence713/production487), not a shortlist. Exact population/multiplicity equality determines the mask. Using a current compatible list or branch-local population here would be unsound because other branches may still select omitted players; the current implementation avoids that error. Locks may force selection of a partial lower band, so the exact equality test is necessary; blindly marking all players below the cutoff mandatory would be wrong.

Current loop guards at recurrence3004 and production2360 require balancePolicy and baselineGlobalFairnessClass, the flag set only by full fairness-vector equality on a legal baseline witness. The missing mask is globalCountRequiredMask & ~(used | candidate.mask), so already selected players are not counted twice. Rejecting only when its popcount exceeds4*(remaining.length-1) is necessary feasibility pruning: there are fewer future seats than missing required players. Equality must remain searchable. The compatible candidate is disjoint from used. The BigInt AND masks the complement back to a finite nonnegative mask, so popcount terminates.

The check runs inside the existing candidate loop after court choice. It neither shrinks compatibility lists for the shortest-court heuristic nor reorders candidates. The mask and integer popcount cache are deterministic and request-local; there are no new RNG calls. A rejected branch cannot tie the incumbent fairness, hence cannot contribute an admissible later phase witness. The complete baselineProven condition remains separate (full fairness/rank/starvation global bounds plus zero balance gaps). This prune does not prove rank, starvation, balance, coverage or variety optimality and must not replace interruption/certification checks.

## Focused evidence to request from implementation owner

- Exact new22-player seed4729 step3 state, with eight count1 players and four required count2 seats: show all eight forced count1 members are retained and all certificates valid under existing deadlines.
- Differential cases with zero, one and multiple saturated count bands; locked high-count players; nonempty arrival priorities; and mandatory players incompatible within one court but feasible across remaining courts. Compare full selected layout/draw behavior and optimum tuple, not just output capacity.
- Equality boundary: missing required players equal remaining seats must survive; one too many must prune. Include a case where global fairness is unattainable so the flag stays false.
- Preserve cooperative budget checking on reject paths. The inspected popcount loop is bounded by roster size and only publishes an exact completed integer. Current checkCandidateScanBudget remains on the reject path.

This is narrow proof feedback, not a full patch review or capacity/release approval. No independent timing or matrix run was performed.
