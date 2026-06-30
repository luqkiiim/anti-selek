**Design QA**

source visual truth path: `C:\dev\tournament-app\prototypes\player-profile-courtside\qa\reference-courtside-stat-sheet.png`

implementation screenshot path: `C:\dev\tournament-app\prototypes\player-profile-courtside\qa\prototype-390x844.png`

viewport: `390 x 844` browser viewport, captured as `374 x 844` by the in-app browser screenshot surface

state: Player profile, Overview tab, `30D` rating range, top of page

full-view comparison evidence: `C:\dev\tournament-app\prototypes\player-profile-courtside\qa\comparison-reference-vs-prototype.png`

focused region comparison evidence: The full-view comparison keeps header, summary strip, tabs, performance grid, rating trend, and achievement shelf readable at the target viewport. Separate crops were not needed for this prototype pass.

additional focused evidence: `C:\dev\tournament-app\prototypes\player-profile-courtside\qa\stats-session-form.png` shows the Stats tab replacement for the removed Playstyle section.

additional focused evidence: `C:\dev\tournament-app\prototypes\player-profile-courtside\qa\matches-centered-results.png` shows the corrected result chip column in the Matches tab.

additional focused evidence: `C:\dev\tournament-app\prototypes\player-profile-courtside\qa\chart-hover-tooltip.png` shows the corrected rating chart with plotted points starting to the right of the y-axis and the hover tooltip active.

additional focused evidence: `C:\dev\tournament-app\prototypes\player-profile-courtside\qa\chart-endpoint-labels.png` shows the chart with only the oldest and latest visible x-axis dates while the hover tooltip supplies the specific intermediate date.

additional focused evidence: `C:\dev\tournament-app\prototypes\player-profile-courtside\qa\chart-label-alignment.png` shows the endpoint labels and active tooltip sharing the same x-coordinate as their plotted points.

additional focused evidence: `C:\dev\tournament-app\prototypes\player-profile-courtside\qa\achievements-view-all.png` shows the Achievements tab capped at six visible badges with a `View all` action for the larger set.

additional focused evidence: `C:\dev\tournament-app\prototypes\player-profile-courtside\qa\matches-session-only.png` shows match rows using session-only metadata without court numbers.

additional focused evidence: `C:\dev\tournament-app\prototypes\player-profile-courtside\qa\achievement-badge-popover.png` shows a selected badge opening a small criteria popover without extra heading copy.

additional focused evidence: `C:\dev\tournament-app\prototypes\player-profile-courtside\qa\avatar-change-photo-menu.png` shows profile photo actions living behind the avatar tap target.

additional focused evidence: `C:\dev\tournament-app\prototypes\player-profile-courtside\qa\header-no-rating-star.png` shows the header rating metric without the unexplained star icon.

additional focused evidence: `C:\dev\tournament-app\prototypes\player-profile-courtside\qa\partners-opponents-section.png` shows the added Best partners and Toughest opponents section on the Overview tab.

additional focused evidence: `C:\dev\tournament-app\prototypes\player-profile-courtside\qa\partners-opponents-avatars-top3.png` shows the improved Partners & opponents section with rank numbers, avatars, top-three default rows, single-person toughest opponents, `0W/0L` records, and win-rate values.

additional focused evidence: `C:\dev\tournament-app\prototypes\player-profile-courtside\qa\partners-opponents-ranks.png` shows the visible `#1`, `#2`, and `#3` rank numbers in the default partner and opponent previews.

additional focused evidence: `C:\dev\tournament-app\prototypes\player-profile-courtside\qa\partners-opponents-popup.png` shows a group-specific `View all` action opening a scrollable list popup.

**Findings**
- [P3] Prototype uses slightly roomier touch spacing than the generated mock
  Location: Header, Performance panel, Achievements panel.
  Evidence: The reference compresses all of Performance, Achievements, and Recent matches into one generated frame. The prototype reaches the Achievements panel in the first viewport but keeps larger tap targets and clearer labels.
  Impact: This is a minor fidelity difference, but it improves playability on a real mobile viewport.
  Fix: If strict pixel density is desired later, reduce the header avatar, stat strip, and chart heights another 8-12%.
- [P3] Performance labels intentionally differ from the generated mock
  Location: Performance panel.
  Evidence: The reference mock includes shot-level labels such as smash/defensive/net/error metrics. The prototype replaces them with app-derived stats: matches played, points scored, points conceded, point diff, and recent form.
  Impact: This is a deliberate product correction so the prototype does not imply data the app cannot measure.
  Fix: No action unless the app later starts tracking shot-level events.
- [P3] Match rows intentionally differ from the generated mock
  Location: Recent matches and Matches tab rows.
  Evidence: The reference mock includes knockout-style metadata and multi-set match scores. The prototype uses one score per match and session metadata because Anti-Selek does not model knockout rounds or best-of-three matches.
  Impact: This is a deliberate product correction so the prototype matches the app's tournament model.
  Fix: No action unless the app later supports knockout brackets or multi-set match scoring.
- [P3] Stats tab removes abstract Playstyle scoring
  Location: Stats tab.
  Evidence: The prototype previously showed Consistency, Momentum, Pressure, Endurance, and Chemistry bars without a clear data source. It now shows Session form rows using recent session record, point differential, and rating change.
  Impact: This keeps the profile grounded in data the app can compute.
  Fix: No action unless the app later adds explicit player-style tagging or event-level analytics.

**Required Fidelity Surfaces**
- Fonts and typography: The prototype uses system sans typography with the same plain, dense sports-control character as the mock. Weights, hierarchy, and compact labels are close; the prototype is slightly bolder for readability.
- Spacing and layout rhythm: The structure matches the mock: player header, four-stat strip, tabs, performance grid, rating chart, achievements. Vertical rhythm is intentionally a little more touch-friendly.
- Colors and visual tokens: Light base, white grouped surfaces, deep ink, teal accent, muted dividers, green/red result semantics, and amber achievement tone match the selected direction.
- Image quality and asset fidelity: A generated badminton portrait asset is used as a real image, cropped into the avatar. Icons come from `lucide-react`, matching the thin outline control style.
- Copy and content: Visible text stays compact: labels, values, chips, short tab names, achievement names, and match rows. No explanatory prose was added. Speculative shot-level stats, knockout round labels, multi-set match scores, and abstract playstyle labels were removed after annotation feedback.

**Patches Made Since Previous QA Pass**
- Removed the fixed bottom nav that obscured the rating chart.
- Kept the player name on one line.
- Corrected achievement progress bar percentages.
- Added match detail feedback to the Matches tab.
- Compressed profile density to better match the generated 390 x 844 reference.
- Removed untracked performance metrics: smash win rate, defensive win rate, net win rate, and errors per match.
- Renamed the net-themed achievement to use match/session-derived achievement language.
- Replaced knockout-style match metadata with session-only metadata.
- Replaced multi-set sample scores with one-set match scores.
- Replaced the abstract Playstyle section with a session-derived Session form section.
- Centered the W/L result chips in a single dedicated match-row result column.
- Moved rating chart points to start after the y-axis.
- Added hover/touch rating tooltip for chart dates.
- Reduced the rating chart x-axis labels to oldest and latest dates only.
- Aligned chart endpoint labels and tooltip to the plotted point coordinates.
- Added more sample badges and capped the Achievements tab preview at six with a `View all` expansion.
- Removed court numbers from match metadata; rows now show session names only.
- Made badges tappable; selecting one opens a small criteria popover that closes on outside tap.
- Moved profile photo actions behind the avatar; tapping the photo reveals change/remove actions, and the empty state reveals add photo.
- Removed the unexplained star icon from the header rating metric.
- Added a compact Partners & opponents section with best partners and toughest opponents.
- Added avatars, single-person opponent rows, `0W/0L` records, win-rate values, and group-specific scrollable popups to Partners & opponents.
- Added visible rank numbers to partner and opponent rows.

**Implementation Checklist**
- Build passes with `npm run build`.
- Browser console had no warnings or errors.
- Tabs, rating range, share toast, achievement expansion, and match row selection were tested in the browser.

**Follow-Up Polish**
- Tune the final production version after porting against real app data, especially long names, empty states, and real match row overflow.

final result: passed
