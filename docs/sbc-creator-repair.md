# SBC creator repair

Status: user explicitly approved the online production repair and deployment on 17 October 2026. Execution evidence is retained under protected `private/sbc-creator-repair-zeWmQD/`.

Club creation granted owner access without creating a sporting profile. The affected live club is SBC (`cmvbwqrqw000gr3krwbaad7pl`), created on 17 October 2026 by Luqman. Read-only inspection found 11 active roster entries, no creator-owned or matching-name profile, and no prior ownership claims.

## Reviewed change

`scripts/repair-sbc-creator.ts` exports a narrowly targeted writer with an injected database connection. It checks the exact club, active creator, owner/admin access, existing ownership, matching names, previous claims and pending identity work. Within the existing ownership transaction, it creates one local Player and ClubMember and calls the existing audited claim procedure. Owner access remains unchanged. A repeated invocation rejects without adding another player.

The application fix separately makes future club creation atomic with its creator profile and ownership audit. Neither change requires a schema migration.

## Rehearsal evidence

A fresh production snapshot was obtained using the dedicated read-only rehearsal credential and copied under protected ignored `private/sbc-creator-repair-zeWmQD/`. The writer was run against the local copy using the libSQL adapter. Comparison of all tables confirmed every pre-existing row was preserved exactly. Only one row each was added to `User` (the physical Player table), `CommunityMember` and `ClubPlayerOwnershipEvent`. Repetition was rejected. The receipt is in `rehearsal-result.json` in that directory.

## Approved execution path

After explicit approval, take a fresh consistent production backup under protected `private/`. Verify the production endpoint matches the read-only inspected target and use a separately obtained production writer credential, never the rehearsal token or development runtime configuration. Invoke the reviewed `repairSbcCreator` function with a Prisma libSQL connection to that verified target and retain its returned IDs as the repair receipt. Its preconditions are checked again under the writer reservation.

Use the online path: there is no schema change or maintenance window. The short transaction uses the existing write reservation and retry behavior. Existing app versions can read the added player immediately.

Verify the creator's linked player appears in SBC, owner access is unchanged, and the existing roster and sporting history remain intact. Confirm the audit event from the receipt. Deploy the club-creation fix through the existing deployment process, check the relevant live flow and inspect fresh Vercel runtime logs for errors.

If the transaction fails, it rolls back all its changes. If the outcome is uncertain, inspect the receipt/creator membership before retrying. Do not restore the whole backup over newer user activity or delete a successfully created player after it has acquired participation/history; review any necessary correction separately.
