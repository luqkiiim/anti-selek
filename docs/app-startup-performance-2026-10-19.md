# Startup performance — 19 October 2026

Saved-club startup now requests the remembered club and its route assets alongside the club list. The authoritative list still decides whether to select that club. The club response starts the current viewer's statistics request before the destination component finishes loading; both reads are reused when it mounts. Account changes, unavailable clubs, cancellation, and global views retain their existing access boundaries.

Club management, session setup, live-session/history embeds, and account settings load their JavaScript when opened. Deferred management/setup screens signal readiness after their code arrives. The existing launch screen still stays visible until the destination's required content is ready.

## Measurements

| Check | Before | After |
| --- | ---: | ---: |
| Fresh browser cache, production build, real fixture authentication | 2,193 ms | 1,578 ms |
| Initial encoded JavaScript transferred | 546,723 bytes | 321,165 bytes |
| Production build, each core API response delayed by 500 ms | 2,129 ms | 1,571 ms |

The fresh-cache check uses Chromium with a 390 × 844 viewport, 4 Mbps download, 80 ms latency, and 4× CPU slowdown. It uses the disposable local SQLite fixture, not production data or Turso. The separate delayed-response check isolates the request waterfall. These are controlled local measurements; production cold starts, club size, connectivity, and device speed can change the user's result.

Readiness is captured from the browser's DOM transition rather than Playwright polling completion. The slow-response regression asserts overlapping requests, one club read, one statistics read, and a production-build startup budget below two seconds. Development mode checks request ordering without applying that timing budget.

## Validation

- 68 focused unit/component tests passed, including saved-club validation, preload reuse, cancellation, account changes, and global-view isolation.
- Nine production-build browser checks passed, including the existing smooth launch sequence, transient failures, warm navigation, and real authenticated opens of session/history/profile, account settings, club administration, and session setup.
- Normal production build, focused lint, and diff whitespace checks passed.

Run `npm run build`, then `npx playwright test --config=playwright.startup.config.ts`. The configuration reuses the existing isolated E2E database setup and never accesses the production database.
