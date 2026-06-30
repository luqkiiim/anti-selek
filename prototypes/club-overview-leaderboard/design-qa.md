**Source Visual Truth**
- Option 2 top reference: `C:\Users\pc\.codex\generated_images\019f02be-8a59-7611-9274-624deba61d1e\ig_014852500d41246b016a427aa9e11c8199a67f8cdc59f55078.png`
- Option 2 lower reference: `C:\Users\pc\.codex\generated_images\019f02be-8a59-7611-9274-624deba61d1e\ig_014852500d41246b016a427aedbef08199bf74d5651a463be7.png`
- Intentional user-requested deviations: remove the overview leaderboard preview entirely; replace `Games / Active / Finished / Members` stat strip with `Members / Matches / Sessions / Last played`; promote conditional `Session news` above `In form`; use `In form` instead of `Hot players`; expand `Top rivalry` and `Partner chemistry` previews to three rows; remove subject-ambiguous recent-match W/L badges.

**Implementation**
- URL: `http://127.0.0.1:5175/`
- Viewport: `390x844`
- State: mobile club overview, default Overview tab
- Revised top screenshot: `C:\dev\tournament-app\prototypes\club-overview-leaderboard\qa\revised-final-top-390x844.png`
- Revised lower screenshot: `C:\dev\tournament-app\prototypes\club-overview-leaderboard\qa\revised-final-lower-390x844.png`
- No-leaderboard top screenshot: `C:\dev\tournament-app\prototypes\club-overview-leaderboard\qa\no-leaderboard-top-final-390x844.png`
- Top-3 rivalry/partner screenshot: `C:\dev\tournament-app\prototypes\club-overview-leaderboard\qa\rivalry-partners-top3-final-390x844.png`
- Latest annotation cleanup screenshot: `C:\dev\tournament-app\prototypes\club-overview-leaderboard\qa\annotation-cleanups-390x844.png`
- Revised top comparison: `C:\dev\tournament-app\prototypes\club-overview-leaderboard\qa\comparison-revised-top.png`
- Revised lower comparison: `C:\dev\tournament-app\prototypes\club-overview-leaderboard\qa\comparison-revised-lower.png`

**Findings**
- No P0/P1/P2 findings after revision.

**Checks**
- Typography: revised from overly heavy profile-style weights to lighter Option 2-style hierarchy.
- Layout: club identity, compact live session row, stat strip, then stacked list sections.
- Sections: `Session news`, `In form`, `Rating movers`, `Latest session`, `Top rivalry`, `Partner chemistry`, and `Recent matches`.
- Copy/content: `Power rankings`, `Games`, `Active`, and `Finished` are not visible. Meaningful replacements are present.
- Responsiveness: no horizontal overflow at `390x844`; bottom nav labels fit after revision.
- Assets: real local avatars load, including the central Aiman portrait.
- Annotation checks: overview leaderboard preview is removed; `Top rivalry` renders 3 rows; `Partner chemistry` renders 3 rows.
- Latest annotation checks: partner names use uniform weight; rivalry rows omit total match counts; recent matches show neutral scores without W/L result badges.
- Follow-up annotation checks: `In form`, `Rating movers`, `Partner chemistry`, and `Recent matches` names use the lighter row weight; recent matches omit the redundant `vs` label.
- Session news checks: news rows are stat-backed highlights from the latest session; unavailable categories are filtered out instead of shown as filler.
- News reaction checks: each session news row has a compact like control with count and selected/unselected state; liked hearts render red; the preview stays free of comments and liked-by lists.

**Patches Made During QA**
- Rebuilt the prototype around the actual Option 2 third/fourth generated screenshots.
- Removed the oversized hero-style layout from the first pass.
- Reduced font weights across headings, rows, values, buttons, and nav.
- Reordered and restyled sections to match the selected mock.
- Removed the overview leaderboard preview.
- Expanded rivalry and partner previews to top 3.
- Made partner pair names uniform.
- Removed rivalry match-count text.
- Removed recent-match W/L badges and winner/loser score coloring.
- Softened name weights across ranking, mover, partner, and match rows.
- Removed the `vs` label from recent match rows.
- Added `Session news` with conditional highlights and a full-list popover.
- Promoted `Session news` above `In form`.
- Added interactive like controls to `Session news` preview and popover rows.
- Updated liked heart color from teal to red.

**final result: passed**
