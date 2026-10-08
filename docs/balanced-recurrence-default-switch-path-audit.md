# Balanced recurrence routing and persistence contract

Fresh automatic Balanced Points and Balanced Elo selections default to the hardened strict replay rescue policy in `balancedRecurrence.ts`. `balancedCandidateAcceptance.ts` verifies the selected candidate before returning it to application writers. A rejected or incomplete candidate is discarded; the unchanged production matcher in `socialBatch.ts` may supply an explicitly certified fallback. If neither attempt proves the required contract, selection fails closed.

`BALANCED_RECURRENCE_CANDIDATE_ENABLED` absent or set to `1` selects Arm 3. Setting it to `0` restores the old Balanced path for rollback. Other explicit values preserve the previous disabled-flag behavior. An internal explicit strict request takes precedence over this flag. Social and Level Match are excluded from the Balanced resolver.

| Application path | Selection and acceptance boundary |
| --- | --- |
| Initial generation and immediate refill | `generate-match/selection.ts`: single-court selector reaches the shared Balanced gate. |
| Multiple courts | `selectBatchMatches` passes the requested batch and schedule to the same gate. |
| Player groups | Group court plans and their structural opportunity constraints are passed together; a proved infeasible larger batch can retry fewer courts, with fresh certification on each attempt. |
| Interclub | `generate-match/interclub.ts` passes club legality, full structural players and the corresponding opportunity constraints for single, batch and replacement selection. |
| Reshuffle | Alternative selection reaches the gate with the prior quartet/partition exclusions. |
| Automatic replacement with retained players | The retained IDs are supplied as locks; the resulting complete quartet must pass acceptance. |
| New automatic queue and automatic rebuild | `queue-match/shared.ts` selects before writing a new lineup and stores the Balanced decision in the existing reason JSON. |
| Automatic queue reshuffle/replacement | Fresh selection reaches the same gate, including exclusions and retained-player locks. |
| Rest disabled | Arm 3 cannot supply its replay proof; the gate records that reason and permits only a certified production fallback or no selection. |

All paths use the full structural roster and explicit legal-opportunity definition. Completed history determines recurrence maturity and rolling windows. Busy, queued and paused players remain in the structural vocabulary where intended while remaining ineligible for selection. Legacy first-exposure coverage retains its existing history and context. Temporary availability must not redefine structurally feasible match types or relationships.

The acceptance boundary verifies the selected legal/disjoint layout, retained locks and exclusions, mirrored stronger-priority certificates, balance baseline/envelope, replay minimum, first-exposure admission, recurrence frontier and strict rescue admission. It recomputes selected coverage/T and structural vocabulary. A candidate requires complete search certification. A production fallback is separately labelled, proves its required core contract and never claims recurrence certification; a limited late production ranking does not invalidate an otherwise certified core contract.

Manual host-selected lineups are approved operator choices. They use the existing legality checks and do not require or claim Arm 3 optimality certification. An automatic replacement retaining only some host-selected players is still a fresh solver choice and is certified with those players locked.

Already-stored queues are consumed as stored, carrying their decision metadata when present. They are not silently re-matched. Queues predating Balanced decision metadata remain consumable. A failed automatic rebuild keeps the prior queue instead of writing an unverified replacement. These are approved persistence semantics, not missing automatic selection gates.

Permanent coverage lives in `balancedCandidateAcceptance.test.ts`, `balancedRecurrencePolicy.test.ts`, `balancedRecurrenceExactness.test.ts`, `balancedRecurrenceIntegration.test.ts`, `playerGroupSelection.integration.test.ts`, and the actual POST-route `balancedDefaultRoute.integration.test.ts`. Tests exercise default routing with the opt-in flag absent, explicit rollback, constrained structural opportunities, eligibility, partial/tampered proof rejection, fallback labels and certification before fresh automatic match/queue writes. Legacy service unit fixtures deliberately set rollback because their mocked outputs model the old selector; actual route tests cover the new default.

Social retains its independent beneficial-rescue gate. Level Match retains the ladder matcher. Joint refill remains disabled. No schema, migration, dependency or secret/configuration change is required.
