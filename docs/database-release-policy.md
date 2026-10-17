# Database release policy

Prefer a zero-downtime rollout whenever evidence shows it can preserve correctness and availability. Choose the release method from the actual schema, application versions, traffic, and recovery requirements. Additive SQL is a strong candidate, but is not sufficient proof on its own. Use a coordinated write freeze only when the change or unproven compatibility requires it, and explain that reason before requesting approval.

## Choosing the path

| Condition | Preferred approach |
| --- | --- |
| Additive schema, old/new code compatible, bounded locking and safe activation demonstrated | Online schema expansion, application rollout, then feature activation |
| Backfill needed but can be batched and resumed without changing old-reader semantics | Expand first, run bounded idempotent backfill, verify, then activate |
| Rename/drop/type or meaning change | Introduce compatible fields first; migrate usage and data; remove obsolete fields in a later reviewed release |
| Old/new readers or writers cannot safely overlap, locking exceeds the tested budget, or recovery cannot be proven | Document the specific blocker and prepare an approved maintenance window |

“Zero downtime” means no planned application outage and no lost or duplicate accepted operations. A successful SQL command or a fast local migration alone does not prove it. Measure latency and failures under representative concurrent load; report any unresolved provider behavior or validation gap.

## Required evidence before an online production writer

- Pin the exact source, endpoint, prior migration chain, schema and intended SQL. Keep production reader and short-lived writer credentials separate and protected. Build and deployment commands never apply migrations.
- Take a consistent read-only backup and rehearse preservation. With live traffic, the database may legitimately change after the backup. An online writer must verify against its transaction's current baseline, not require the whole database to remain equal to a stale snapshot. Preserve the backup as recovery evidence; never restore it over newer legitimate writes as an automatic rollback.
- Prove old code reads and writes the expanded schema correctly, and new code remains safe while old requests finish. Include old browser clients, background jobs, previews, immutable deployment hosts and direct API calls. Compatibility must hold at the server boundary, not merely through hidden UI controls.
- Keep incompatible new behavior disabled server-side until only compatible code can access its records. Pin and verify activation state; missing or unrecognized state fails closed. Disabling creation after activation must still allow existing new-format records to be read and managed safely.
- Test actual application/driver concurrency around DDL, lock contention, stale prepared statements and commit acknowledgement loss. Use bounded retry only where rollback is known or operation identity makes replay safe. Never blindly retry an ambiguously committed mutation.
- Bound the writer's lock duration. Perform expensive rehearsal outside the production write transaction; include the cost of any in-transaction preservation checks when assessing the lock budget. If the budget or availability criteria cannot be met, stop before writing and reassess rather than quietly accepting request failures.
- Validate schema/ledger receipts and application health after expansion, before promotion, after promotion and after activation. Capture fresh runtime errors and real public flows. Verify old-host restrictions without blocking the active public application.
- Review recovery at every stage. Before activation, a compatible predecessor may be usable without undoing schema. After new-format records exist, recovery must retain a compatible reader/writer; switching a feature off does not make an incompatible predecessor safe.

## Approval and execution

Prepare the concrete writer, rollout controls, tests, evidence and recovery procedure before asking for final production approval. Independent review must cover the selected path and exact source. User approval names that path; approval of a maintenance writer does not authorize an online variant, or vice versa.

A project-wide HTTP fence or database write freeze must not be introduced as a routine prerequisite for every release. If needed, document the reason, affected operations and expected window, then obtain approval. A surprise failure during an approved online rollout does not automatically authorize switching to a long maintenance cutover. Stop new activation and follow the specifically reviewed containment/recovery procedure.

Keep live usage capacity sufficient for the whole cutover and verification. Preserve protected evidence. Do not call a release complete until matching migration, application deployment, activation state, fresh runtime logs and public flow checks pass; state any unavailable validation explicitly.
