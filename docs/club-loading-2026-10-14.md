# Club loading fix — 14 October 2026

Club selection now starts one shared snapshot request and hands it to the canonical club screen. The selected name and avatar remain visible while loading. Recent content is reused for 60 seconds, with one background validation request on return.

| Check | Before | After |
| --- | --- | --- |
| Snapshot requests for one selection | 2 | 1 |
| Header sequence | Diagnostic club → Club → Diagnostic club | Diagnostic club |
| Returning to a recently viewed club | Content fetched again before display | Cached content appears immediately; editing waits for current permissions |
| Overview and own-profile statistics | Independent component reads | One shared request |

The cache is scoped by account, quick-access identity, club, and normal/global URL. Session storage contains only club ID, name, and avatar URL. Private content remains in memory and is cleared on account changes, sign-out, or access denial. Saves coalesce refreshes and invalidate affected statistics. Deleted clubs are evicted. Superseded reads are cancelled, reads time out after 10 seconds, and retries respect `Retry-After`.

Open account and administration editors retain their drafts while validation disables controls. Unknown direct links use a header skeleton until the club name arrives. Hover, focus, and pointer-down prefetch route assets without fetching club history.

## Verification

- 107 affected unit tests passed across 11 files, including cache expiry, late responses, concurrent consumers, Strict Mode remounts, save refreshes, cancellation, account isolation, access denial, deletion, timeouts, and rate limits.
- 23 Playwright checks passed against an isolated SQLite database: loading, direct links, refresh, Back/Forward, swipes, profile overlays, scroll restoration, authentication callbacks, staff/player/view-only/global access, joining, score approval, results, correction, and interclub sessions. The four loading checks passed again after final UI changes.
- Lint: no errors; 60 existing warnings. TypeScript and the migration-free production build passed.
- The production-build trace used mocked APIs with 600ms API latency and 150ms route latency. It recorded one snapshot request, a stable header, and no page errors. These are controlled measurements, not production server latency measurements. [Trace](club-loading-2026-10-14/trace.json).
- Loading and loaded layouts were inspected at 320, 390, 768, and 1280px, with no horizontal overflow.

No backend API, schema, migration, or production database writes are included.

## Screenshots

[Loading, 390px](club-loading-2026-10-14/loading-390.png) · [Loaded, 320px](club-loading-2026-10-14/loaded-320.png) · [390px](club-loading-2026-10-14/loaded-390.png) · [768px](club-loading-2026-10-14/loaded-768.png) · [1280px](club-loading-2026-10-14/loaded-1280.png)
