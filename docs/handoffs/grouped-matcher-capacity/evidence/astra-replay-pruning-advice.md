# Astra replay-minimum pruning advice

Bounded read-only review of current balancedRecurrence.ts/socialBatch.ts, scoped to replay baseline after reported30-match-state branch exhaustion. No application edits or tests. At inspection the worker had already added >= replay pruning and shouldPruneReplayBaselineLeaf. Entry allowance35%five-hour/74%weekly.

## Safe rule and inspected implementation

considerReplayBaseline minimizes the lexicographic tuple fairness, schedule rank, starvation, immediate replay count. Under Balanced it first requires the certified baseline rotation class and full max/total balance-envelope admission. It rejects complete comparisons >=0, retaining the first equal witness.

Therefore optimisticReplayLowerBound >= incumbentReplay is safe ONLY when the stronger prefix cannot improve: fairness lower bound equals incumbent fairness, schedule rank equals incumbent rank, and starvation lower bound equals incumbent starvation. The current >= change is nested under exactly those checks (recurrence around2677-2681; production2233-2237). A lower bound equal to incumbent is sufficient: every completion is equal or worse in the full replay-only tuple. If fairness or starvation lower bound is better, do not use replay equality to prune; a better prefix can legitimately win with more replay.

The current final-court helper (recurrence2154-2173; production equivalent) mirrors locks, exact rotation-prefix checks, full balance-envelope admission, and >= replay tuple. Calling it before charging a leaf expansion discards precisely leaves considerReplayBaseline would reject. Preserve source traversal order and first equal witness. The helper uses mask-derived caches and consumes no RNG.

## Caveats

- Restrict >= to replayBaselinePhase. Keep coverage-phase replay pruning strictly >Rmin: equal replay layouts may improve coverage, signed recurrence, variety, or final salted hash.
- Do not introduce a tighter balance objective into replay phase: balance is fixed-envelope admission there, not minimization after replay. Reuse isBalanceGuardrailAdmissible with full physical-assignment canonicalSum.
- Later coverage starts from replayBaseline.chosen. Preserving the first equal witness makes the seed unchanged. Rejected ties perform no frontier or RNG side effect in considerReplayBaseline; skipping them does not remove a replay metric update or a possible global-lower-bound certificate because those depend on the same rejected tuple.
- Maintain cooperative time checks for pruned leaves and bounds. Count them as pruned, keep existing explored-branch and time caps, and never mark interrupted enumeration exhaustive.
- Do not create a persistent candidate shortlist from these pruning decisions. Later phases must still see all layouts admitted by their own certificates.

## Evidence requested

For the saved30-match state, retain unchanged-cap phase diagnostics and all certificates after the optimization. Differential evidence should compare first replay witness/mask/index, Rmin, replay envelope, downstream final layout and subsequent RNG state against exhaustive/sufficient-budget reference on small nonuniform-rest cases. Include a case where a subtree can improve fairness/starvation while its replay lower bound ties the current incumbent (must not prune), and equal-Rmin layouts with differing coverage (later coverage must still explore them).

No correctness issue found in the inspected guards for this narrow optimization. This is not an approval of the full feature or unseen later edits; complete-flow acceptance remains with parent.
