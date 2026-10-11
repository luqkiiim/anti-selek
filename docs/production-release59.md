# Production release 59

This separate procedure targets only endpoint SHA-256
`af6c24a4939dcfccb80220dffc4f164896015ca83380547609a3e29d178f6a6d`.
It does not change Dev, Preview, the older four-migration cutover, or builds.
Human approval covers this release; live writes still wait for independent writer
review, recoverability evidence, a coordinated freeze and sufficient fresh quota.

The bounded read-only Production inspection on 11 October 2026 observed an exact
54-name ledger prefix, 27 application tables, 24 permanent triggers, no views,
integrity `ok` and zero FK violations. The ledger has no checksums: this tool never
invents historical checksums or resets/rebaselines the ledger. It pins the observed
112 explicit schema object hashes (28 tables, 60 indexes and 24 triggers) before
freeze and the exact committed SQL source
at `e30f483461fcde37627419debd96d05628912042`. The reviewed release checkout must
be clean, contain the committed writer, descend from that source and contain the
same 59 migration blobs. Supply its complete SHA with `--release-commit`.

Pending committed-byte hashes:

| Migration | SHA-256 |
| --- | --- |
| 20261008120000_placeholder_claim_recovery | a406e881c8fd89c74795c68761c3658bd3fdc5e5a2194c8f844e7a6453025b36 |
| 20261008140000_authorized_identity_transitions | d7612a0a886fa0b721f06633182869628c7fefc36153dccfd72a87ff40a7ca14 |
| 20261008150000_correction_global_identity_guards | 20f0ebb899ed3c32398d3067b2a26848cd7b4a6da153f84c1ed6edeac83d243a |
| 20261008160000_ordinary_claim_identity_authority | 9443d1370aff7512c7330fa45768ded0baa467d3507e841d166b17d8d193c893 |
| 20261011000000_balance_identity_guard_expressions | 1e65771993ed6f0db01d7493621c878fd892f5085750bd495b3cf7e7ce54b7a8 |

The last two hashes differ from Preview's working-file CRLF hashes. SQL comes
from committed Git blobs; applied history is preserved byte for byte.

The Windows KnownFolder Profile contains a dedicated
`AntiSelekProductionRelease59` directory. Root must prepare it with a protected
DACL owned by the current user and only trusted current-user/SYSTEM/Administrators
ACEs, with inheritance disabled. Every path component is checked for unsafe
reparse points and ACLs. No environment-variable fallback exists. Separate
`reader.env` and `writer.env` contain exactly these two unquoted entries:

```text
PRODUCTION_RELEASE59_URL=<exact pinned secure endpoint>
PRODUCTION_RELEASE59_TOKEN=<dedicated role token>
```

The reader must be read-only. The writer must have an unexpired `rw` JWT. Never
reuse the rehearsal token for writes or expose tokens in output. Artifacts and
evidence below remain inside the same protected directory, outside the repository.
Before retrying a failed artifact creation, inspect the previous result and retain
it as evidence; the CLI refuses to overwrite files.

Run `node scripts/run-production-release59.mjs MODE --release-commit SHA
--confirm-endpoint-sha256 ENDPOINT_HASH` from the clean release checkout. Use
the literal complete values above, never placeholders in a live command.

Before the first release backup, root must activate and verify an external
**all-request Vercel freeze**, stop direct database clients and scheduled jobs,
and drain in-flight requests/writes. Include GET and authentication traffic:
those routes can write `RateLimit` even without an identity or sporting action.
Keep `RateLimit` in the full preservation comparison. Record actual active
control and drain evidence; no database freeze DDL is needed for this prerequisite.
Retain the external denial throughout the backup, offline and hosted restore
drills, database freeze, migrations, matching deployment and database thaw.
Release it only after postverify and the separately proved permanent denial of
unsafe old-generation hosts. If any client writes after capture, do not reuse
the old backup or proofs: preserve the artifacts, establish a new drain, and
create a fresh protected backup and both rehearsal receipts. Never overwrite
an existing release artifact or relabel an older proof as current.

1. `--inspect`: read-only consistent schema, complete application-table hashes
   and original ledger inspection; writes protected `inspection.json`.
2. `--backup`: read-only consistent logical SQLite snapshot, including every
   underscore application table and ledger. Schema is recreated, rows inserted
   with FK checks temporarily disabled on the local artifact, then indexes,
   views and immutable triggers restored. Production is never written. Writes
   `source.db` and prints only its hash. The pinned schema has no AUTOINCREMENT
   tables requiring a `sqlite_sequence` reconstruction.
3. `--rehearse`: credential-free restore to separate `restored.db`, then forward
   all five DDL migrations inside one local transaction, FK/integrity checks,
   all-row comparison projected to original columns, exact schema checkpoint
   and 83 permanent guards. Writes protected `rehearsal.json`. Do not freeze if
   this fails. New default columns are checked through the checkpoint schema.
4. Root performs a separate **actual hosted nonproduction Turso import/restore**
   using `scripts/run-production-release59-recovery.mjs` from the same clean,
   reviewed release checkout. The helper pins only
   `anti-selek-production-restore-20261011`, endpoint SHA-256
   `4c1215cc60989ff0670a2a178ec82d19eeb8ce56966558d07a7d947b31a27afb`,
   a separate recovery group created within the existing free plan. Protected
   `recovery.env` contains exactly `PRODUCTION_RELEASE59_RECOVERY_URL` and
   `PRODUCTION_RELEASE59_RECOVERY_TOKEN`; neither Production token is reused.
   Run `--restore --release-commit SHA --confirm-recovery-name
   anti-selek-production-restore-20261011 --confirm-recovery-endpoint-sha256
   4c1215cc60989ff0670a2a178ec82d19eeb8ce56966558d07a7d947b31a27afb`.
   Both exact confirmations and committed helper provenance are mandatory.
   It rejects a populated target unless it already equals this exact backup.
   In one write transaction, create all tables, defer FKs in that same session,
   install referenced unique indexes, insert every original row in bounded
   128-statement batches, then install views and immutable triggers. Verify
   integrity/FKs and full schema/rows/ledger before commit. A fresh read of the
   committed target performs the complete comparison again and writes protected
   `restore-evidence.json`: `version:1`,
   `type:'hosted-nonproduction-turso-restore-verified'`, the actual `planSha256`,
   `backupSha256`, `sourceEndpointSha256`, distinct `nonProductionEndpointSha256`,
   the exact pinned recovery `databaseName`,
   `integrity:'ok'`, `foreignKeyViolations:0`, and `restoredSnapshot` exactly equal
   to the rehearsal report's `before`. This must be actual comparison evidence,
   never copied/assumed success. Both freeze and apply require this receipt.
   `--verify-only` uses only read transactions; a lost restore commit is reconciled
   by fresh reads without repeating INSERTs. No restore credential is loaded by
   any Production command, and no generic Dev migration command is involved.
5. Coordinate write freeze with the release owner. `--freeze
   --approved-production-release` rechecks the entire current baseline against
   the backup, atomically creates the release control and BEFORE INSERT/UPDATE/
   DELETE denial triggers on **every application table**. Expected Production
   coverage is 81 triggers across 27 tables; only the explicit migration ledger
   and new release controls are excluded. Existing clients receive an abort.
   No existing application rows are altered. If data changed since backup, stop
   and obtain a fresh backup and both restore rehearsals.
6. `--apply --approved-production-release` verifies the freeze, then executes
   the 110 parsed statements as one batch, five new ledger entries and release receipt in
   **one write transaction**. All five files are top-level DDL; DML inside
   permanent trigger bodies is dormant during release. No legacy managed
   executeMultiple transaction is used. Verify original rows, original ledger
   timestamps, exact rehearsed schema, integrity and FKs before committing.
   After an uncertain commit, only a fresh read reconciles the exact receipt;
   never blindly resend migrations. Any unresolved outcome keeps writes frozen.
7. `--verify`: read-only receipt/schema/data/history verification while frozen.
   Merge/deploy the matching approved commit, confirm Production READY, perform
   the complete Phase 1 read-only smoke and inspect fresh runtime logs for 500s
   and missing-table errors. No identity/sporting test writes or Phase 2 work.
8. Before thaw, permanently deny all unsafe old-generation hosts or revoke
   their credentials. Freeze triggers block DML, not privileged DDL, and alone
   do not make old deployments safe after thaw. Root records actual authenticated
   Vercel evidence in protected `deployment-evidence.json`: `version:1`,
   `type:'verified-production-release-and-old-host-denial'`, `source:
   'authenticated-vercel-api'`, actual `planSha256`, `endpointSha256`, matching
   `commit`, `projectId`, `deploymentId`, `target:'production'`, `state:'READY'`,
   fresh ISO `observedAt` (under 15 minutes), and `oldHostDenial` containing the
   actual `configId`, `active:true`, `inventoryComplete:true`, and `checkedUrls`
   entries `{url,status}` proving 403/503 for every unsafe host. Root must verify
   the inventory and active control using real provider evidence; never fabricate
   this file from the desired result.
   When the API proves the matching READY deployment/SHA but firewall activation
   is observed through the authenticated Vercel UI, use top-level
   `source:'authenticated-vercel-api-and-ui'`. The `oldHostDenial` then requires
   `source:'authenticated-vercel-ui'`, the same `projectId` as the deployment,
   the actual nonempty `ruleId`, and its own fresh ISO `observedAt` (under 15
   minutes and not in the future), in addition to `active:true`, complete
   inventory and every verified 403/503 result. Record the observed rule ID as
   `ruleId`; do not invent an API `configId` or configuration version from a UI
   rule observation. The API-only path continues to require the actual `configId`.
9. `--thaw --approved-production-release
   --old-generations-denied-and-deployment-verified` requires that protected
   concrete evidence plus complete database postverify, then drops only the
   exact temporary freeze triggers in one transaction. Permanent identity
   protections, original application rows, baseline ledger and receipt remain.

The 81 freeze triggers also use one batch. Snapshots batch schema/ledger/FK/
integrity queries, column inventory and all table projections. Batched operations
remain inside the same existing SDK transaction, preserving atomicity while
avoiding hundreds of remote round trips. No SDK upgrade is required.

If a freeze response is lost, do not retry it blindly: inspect the control and
every denial trigger under a read transaction, using the protected backup and
rehearsal as the baseline. If a thaw response is lost, inspect the temporary
trigger inventory before taking any further action. No automatic destructive
rollback exists. For a verified failure requiring restoration, keep all writes
frozen; root must use the separately proved hosted import procedure and matching
prior deployment pair, retaining the backup and receipts for reconciliation.

Local focused checks: `node --test scripts/production-release59.test.mjs` covers
populated SQLite restore, file-backed libSQL forward release, underscore rows,
all-client write denial, atomic rollback, immutable history, lost-commit read
reconciliation, exact SQL pins and strict argument/credential parsing.
It also verifies actual file-backed libSQL import and batch-error rollback,
recovery empty-target refusal, restore commit reconciliation, and positive and
negative concrete receipt gates. These local fixtures do not constitute the
required actual hosted recovery evidence.
