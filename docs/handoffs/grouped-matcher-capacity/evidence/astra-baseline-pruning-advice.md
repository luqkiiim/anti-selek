# Astra balance-baseline pruning advice

Read-only bounded inspection of current grouped-capacity worktree. No application edits or tests. Context: parent reports saved24-player second-batch reproduction exhausts200,000 branches in balance baseline in both engines. Actual waiting roster is4 upper/8 lower; the earlier parity hypothesis was discarded. Fresh entry usage had63% five-hour/94% weekly remaining.

## Recommended first change

In balancedRecurrence.ts around2917-2932, and the corresponding socialBatch final-court loop, add baseline-only exact per-leaf pruning before charging/expanding a final-court branch. The current parent bound proves only that some completion could improve; it still sends every disjoint compatible final quartet through considerBaseline.

For each final candidate, preserve source iteration order and poll the shared/phase deadline. Form the complete union mask. Reject missing locks. Compare its exact fairness vector against the current baseline; then profile rank; then exact starvation. A lexicographically worse rotation prefix cannot update baseline. If all these tie, compare exact full-assignment maximum balance gap then canonicalSum of all physical-assignment gaps. Prune a balance tuple greater than or equal to the incumbent. Equality is safe here because considerBaseline explicitly rejects the complete objective comparison >=0 and has no RNG/tie-frontier side effect. If the rotation prefix is better, allow the branch regardless of balance cost.

Use the CURRENT incumbent on each iteration because an earlier surviving candidate may improve it. Count discarded leaves as pruned, keep the200k ceiling and time limits, and only count admitted expansions as explored. This is a precise objective bound, not a candidate shortlist or merely raising the branch budget. It may reduce branch exhaustion more than elapsed time because rotation metrics still need evaluation; diagnostics should make this visible.

## Guardrails

- Apply only to balance-baseline phase initially. Do not discard equal-prefix candidates in recurrence/coverage/late ranking, where they may improve another objective or the salted layout tie-break.
- Use the existing getFairness/getStarvation caches and exact comparison functions. Do not substitute restTurns ordering or approximate summed fairness.
- Compute canonicalSum over the full selected gap vector; do not replace it with a differently associated prefix sum. Keep locks and physical assignment mapping intact.
- Preserve candidate order, first witness on ties, random draws, and existing lower-bound certificate conditions. This optimization does not establish a new global zero-gap certificate.
- Do not use the discarded balanced-side assumption. Any later group/side-aware bound must be derived from actual eligible waiting sides and the full allowed Mixed/own-side court semantics.

## Evidence requested after change

Compare unlimited/sufficient-budget old and pruned baseline witness, rank, fairness, starvation, max gap, total gap, and subsequent RNG state on small exact fixtures (include ties, fractional gaps, locks, heterogeneous court profiles). For saved failing reproduction report explored/pruned counts, completed phase certificate, resulting policy/fallback, and elapsed time under the unchanged200k/2s caps. Keep complete affected-flow verification with parent.

Advice relayed to parent and matcher owner. No approval of an unseen patch or release is implied. Reviewer is idle pending a concrete patch review.
