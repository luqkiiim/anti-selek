# Legacy Community Contract Sunset

Date reviewed: 2026-06-24

## Telemetry Review

Command used:

```bash
npx vercel logs --project anti-selek --environment production --since 14d --query "[telemetry]" --json --limit 1000 --no-branch
node scripts/legacy-community-telemetry-report.mjs <captured-log-file>
```

Report summary:

```text
Legacy community telemetry report
Total events: 0
Latest timestamp: none
Malformed telemetry lines: 0
By event: none
By route: none
By legacy key: none
By surface: none
By method: none
By response status: none
By user-agent family: none
```

Decision: legacy `community` usage is low enough to announce sunset. No external legacy route or alias usage was visible in the available production telemetry window.

## Sunset Configuration

Production env var configured in Vercel:

```text
LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE=2026-08-01
```

A production redeploy was triggered so the runtime picked up the new env var:

```text
https://anti-selek-m1smfc5jo-luqkiiims-projects.vercel.app
```

Verification commands:

```bash
LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE=2026-08-01 npm run smoke:production:preflight
LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE=2026-08-01 npm run smoke:production
```

Both commands passed. Legacy `/community/**` and `/api/communities/**` responses now include `Deprecation`, successor `Link`, guidance, and `Sunset` headers. Canonical `/club/**` and `/api/clubs/**` responses remain free of legacy deprecation headers.

## Removal Criteria

Do not remove compatibility before 2026-08-01. After that date:

1. Run another telemetry report over recent production logs.
2. Confirm there are no critical external legacy callers.
3. Remove legacy route wrappers and `community*` JSON aliases in a breaking-change commit.
4. Keep Prisma physical table/column renames as a separate migration phase.
