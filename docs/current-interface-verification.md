# Current interface verification

The original interface consolidation was verified locally on 6 November 2026 in the isolated `codex/current-ui-only` checkout, based on main `b12715d7c0270f08b04f1af49edd3d4a772bfa15`. The original workspace's unrelated authentication and access-repair changes were left untouched.

Practice was later removed from the interface. The checks below document the original consolidation.

## Baseline

The missing linked-player pairing control was reproduced through the current application's Manage club route before editing. The production deployment observed separately was `dpl_445jgyHjk9VkSQCkShztbB7q7DYz` (`anti-selek-6jrxz1avy-luqkiiims-projects.vercel.app`, READY). Its source SHA was not exposed by that lookup; the local source revision above is not a claim about the deployed revision.

## Checks

- Current product and route unit coverage, targeted lint, and TypeScript passed. Stale presentation selectors were updated to current controls.
- The normal `npm run build` passed against the explicit local SQLite target, including compilation, TypeScript and static generation. The initial invocation's incorrect `VERCEL=0` marker was removed after the existing database target guard rejected it; no application change was needed.
- Pairing permission tests cover linked/unlinked players, global admins, account-holder self-service, staff denial and revoked access. Transaction integration checks on SQLite and file-backed libSQL preserve other clubs, personal identity, rating and existing session snapshots.
- Mutation recovery checks cover uncertain saves, creation, rating conflicts, guest promotion and recovery controls. Existing API authorization remains in force.
- Real-route browser journeys passed for linked-player pairing, optional guided practice and persisted/dismissed progress, practice reset, playground reset, eligible test-to-real conversion, guest/archived/unscoped profiles, and emergency recovery controls.
- The first-session journey passed: saved player and guest creation, preparation/start, score entry, pause/resume, explicit finish/discard, podium, guest promotion, and finding that player in a subsequent setup.
- Old bookmarks, canonical tabs, refresh, Back/Forward, sign-in callbacks, profile overlays, read-only links and malformed read-only context were checked. A regression test covers the normalization race where an outgoing screen could otherwise replace the sign-in callback URL.
- Mobile layouts at 320px and 390px and desktop at 1280px were checked, including long names and keyboard interaction. Screenshots are indexed in [Current interface](current-interface.md#screenshots).
- The import graph from application entry points was checked before removing unused presentation code. Shared controllers, API aliases and profile/administration helpers remain in use.

The complete historical E2E suite was not rerun; focused replacement journeys and relevant existing checks were used for this cleanup. Unrelated retired functionality was not extended.

## Release boundary

No schema changes or database migrations are introduced. Local verification uses isolated SQLite fixtures. Nothing has been pushed or deployed, and no production data was changed. Review and merge authorization, deployment, a brief live-flow check and fresh runtime-log review remain release steps. Any independently pending database migration still follows the separate database release policy; a build does not apply it.

See [Current interface](current-interface.md) for the canonical route map, capability checklist, screenshots and short user test script.
