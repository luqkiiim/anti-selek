# Session sharing

Share session opens an editable plain-text message for copying into any chat app.
It is available below the waiting-session court summary and in the session options
menu. The preview includes the current roster, guests and paused players, court
labels, saved logistics and the session link. Preview edits are temporary; Reset
message rebuilds from current data. Shared links use `https://antiselek.com`.
The message shows the date and time without a timezone label and lists players
without a total count. Existing session access rules still apply.

Optional session details are entered during creation, or through Session details
in settings or the share sheet. Only active host-club organisers and global
admins can save them, while the session is waiting or active. Saved booking
timestamps are UTC, interpreted and displayed in the session's chosen timezone
(default Asia/Kuala_Lumpur). End dates explicitly support overnight bookings.
The session time applies to every court.
Inactive courts retain their bookings but are omitted from the message.

## Database release

Migration `20261102000000_session_details` adds seven nullable Session columns and
two nullable Court columns. It changes no existing values, relationships, indexes
or triggers. The details save endpoint writes logistics in one transaction and
does not invoke queue generation, resets, rating changes or gameplay updates.

This branch prepares application code and the additive migration only. Production
migration and deployment remain held pending the separately reviewed writer
procedure and explicit user approval under `database-release-policy.md`. Pushing
the branch is not migration or deployment approval.

Use a fresh consistent backup and the existing release tooling, with only the
necessary reviewed changes for this migration. Prefer the compatible online path:
verify the current migration chain, apply the nullable additions before deploying
the new app, and verify the schema and existing-data preservation. The existing
read-only build guard now checks all new columns on hosted builds; it never
applies migrations. Preview needs its own migrated database as well.

The old app remains compatible after this additive migration. For an application
rollback, retain the added columns and any newly entered details. Do not reverse
DDL or restore an old whole database over newer activity. After an approved
release, check session creation, detail saving, message copying and existing
session reads, then inspect fresh Vercel logs for 500s or missing-column errors.
