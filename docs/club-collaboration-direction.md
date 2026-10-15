# Club collaboration direction

Status: proposal for later implementation, October 15, 2026.

## Goal

Let two clubs organize and play one shared session, with each club controlling its own roster and both clubs seeing the same schedule, scores, and recap. Players keep their existing identities and club memberships; collaboration must not create duplicate players or silently enroll them in another club.

## Recommended flow

1. In the normal session setup, open **Club collaboration**, choose another club, and select **Play together** or **Club vs club**. Preserve all entered session details. Avoid a separate duplicate setup screen.
2. Prepare the session and send an invitation. The receiving club's admins see the host, session details, format, scoring rules, and proposed rating treatment before accepting or declining. A pending invitation does not grant roster-editing access.
3. After acceptance, each club selects its own participants and guests. A person who belongs to both clubs appears once and represents one club for this session. Each club marks its roster ready.
4. Show a shared review of courts, rules, rosters, and any unresolved requirements. Start only after both clubs are ready. Changes to format, scoring, or representation require renewed confirmation.
5. The host runs courts and queues. Explicitly authorized scorers from either club submit scores. Both clubs see live results and the same completed recap in their own session history.

Invitation acceptance and readiness are distinct: accepting collaboration does not approve a roster or rules that can still change.

## Formats

- **Play together:** one combined player pool with the existing matchmaking choices. Club identity is informational; there is no club winner.
- **Club vs club:** partners represent the same club and opponents represent the other club. Use a fixed, agreed match schedule or match count so the result has a clear endpoint and fair participation. Recommend one club point per match won; decide draw and tie rules before implementation.

Start with two clubs. Multi-club competitions, brackets, leagues, and season rankings are outside the first release.

## Ownership and integrity

- The host owns session operations; partner admins manage their own roster and delegated scorer access. Joining does not give either club administrative rights over the other.
- Before play, either club can withdraw; the host can cancel or explicitly switch back to a single-club session. Do not silently start without an accepted partner.
- Once play begins, record roster changes and score corrections. A reset that clears shared results should require confirmation from both clubs; preserve an audit trail.
- Separate session standings and club match totals from persistent player ratings. Recommend leaving cross-club results out of persistent ratings for the first release until we define how independently calibrated club ratings compare and which club profile receives each adjustment. This is a proposal, not a change to current rating behavior.

## Completion criteria

Both clubs can complete invitation, roster selection, play, scoring, and recap without duplicate session entry. Repeated requests cannot duplicate invitations or results. Permissions are enforced on the server, pending or withdrawn clubs cannot start play, and dual-club players cannot occupy two roster slots. Results and corrections remain consistent in both clubs.

## Current cleanup

The session setup entry is now named **Club collaboration**. It still opens the existing hosting screen; the integrated flow above is future work.

Ordinary clubs no longer have a test-session creation option, and the session creation API rejects explicit requests for test sessions. Existing test records and their rating exclusions/reset tools remain supported as legacy behavior. Guided practice retains isolated tutorial sessions, classified by the server from the tutorial club rather than a user-controlled test toggle. No schema migration or conversion of historical sessions is required.
