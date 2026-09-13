# Manage club

Players are grouped into Core then Occasional, with a case-insensitive alphabetical sort within each group. Search keeps that grouping. New players require a Male/Female selection, sent to the existing members endpoint. Requests are unchanged.

Settings contains club photo cropping/upload/removal, name, optional plain-text rules (3000 characters), invite link, and Allow join requests. Rules appear collapsed at the bottom of the club overview. Saved name/photo changes refresh the club chooser too. Delete club is separated at the bottom and requires typing DELETE before calling the existing endpoint.

Migration `20260914090000_add_club_rules` adds `Community.rules` with an empty default. Applied to local SQLite and production Turso; runtime error check was clear. Verified with route tests and a mobile browser flow at 390px/320px using a temporary local club: sorting, gender validation/persistence, name/rules/photo saving, invite controls and confirmation-gated deletion.
