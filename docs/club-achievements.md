# Club achievements

The prototype frontend uses `/api/clubs/[id]/achievements` for the signed-in member. This is independent of the older profile achievement rules.

Rules and thresholds live in `src/lib/clubAchievements.ts`. Only recorded games in completed, non-test sessions are supplied to the replay engine. Session completion order determines unlock dates, and match completion order determines comebacks. Each family exposes its exact requirement and evidence session in the UI. Weekly boundaries are Monday–Sunday UTC; weekly consistency is optional and excluded from milestone recommendations.

Mix It Up uses unique nonguest partners divided by eligible clubmates (excluding self). Eligibility requires recorded nonguest participation. Session end captures current membership in `Session.achievementEligibilityJson` inside the completion transaction, without requiring anyone to open the app. Replaying a session uses its snapshot, so future joins/departures cannot erase earned tiers. Corrected/deleted results can invalidate unlocks. Current progress uses current membership. Historical sessions without snapshots are backfilled with known current members who joined by the session date; departed historical membership cannot be reconstructed.

Rating improvement sums recorded match deltas after ten rated games, never changes to the member's current rating. The per-player club adjustment ledger is preferred, with legacy team deltas only for the session's owning club. Manual rating adjustments never contribute. Hosting credits the recorded creator on the accepted HOST SessionClub link; unknown creators get no inferred credit.

Member `achievementPreferencesJson` stores selected showcase IDs and acknowledged earned tiers. Only the authenticated member can write their preferences, only earned badges may be selected, and at most three unique badges may be showcased. Revoked badges are filtered from the showcase. First use defaults to three earned badges; an explicitly empty selection is respected.

The UI uses existing tween-based sheets, reduced-motion-aware reveals, 11 distinct badge symbols, a three-slot profile showcase, and a single overview milestone. Simultaneous tier unlocks are grouped by family in the reveal while all earned tiers remain visible in details.

Validation: rule tests in `src/lib/clubAchievements.test.ts`, session end route regression test, and local isolated-club browser/API flow covering completion, snapshots, authentication, showcase selection, reveal acknowledgement, correction/revocation, and 320px layouts.
