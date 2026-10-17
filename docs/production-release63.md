# Club collaboration release63 — practical release plan

The user prefers a lightweight process for this hobby app: test difficult logic and meaningful risks, reuse completed verification, and favour zero downtime only when it is straightforward. For this release, use the existing tested maintenance path rather than implement the proposed online migration framework.

## Reuse what is complete

- Feature implementation, build, focused scoring/permissions/migration checks and two-account browser scenarios have passed. Do not rerun broad suites without a relevant source change or failure.
- The dedicated maintenance writer and deployment checks passed 165 tests. Independent reviews covered application/migration and production procedure at commit `2bb992a6ea49babb708317886e0eb0812503542d`.
- The production read-only backup rehearsal preserved all 8,473 original rows, verified legacy defaults and passed integrity/foreign-key checks. The additive SQL remains `20261015123000_upgrade_club_collaboration`, SHA256 `6192f2dcdbae1a23767aceb00e171dfb9cae716a935a7e2760c4ab228d09af5c`.
- Subsequent policy/documentation edits do not justify new application tests. Update the exact release binding and review only relevant differences before execution; do not reuse a receipt that names a different commit.

## Release steps

1. Check current source, production target, credentials and available capacity. Confirm approval covers the concrete maintenance procedure and its temporary outage; do not repeat approvals already given.
2. Execute the [existing maintenance procedure](production-release63-maintenance.md), including its required request drain, fresh backup, preservation verification, migration and matching deployment. Keep its guards intact.
3. Verify the deployed version, a few important collaboration/scoring/permission flows, and fresh runtime logs. Investigate any failure; otherwise reopen and finish.

Production has not been migrated or deployed. The online-writer and activation-gate project is not required for this release. Its staged-online design remains in Git history if a future release makes that investment worthwhile. General guidance is in [database-release-policy.md](database-release-policy.md).
