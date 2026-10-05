-- Continuations are disposable capabilities, not invitation audit history.
-- Remove records left behind before lifecycle cleanup was enforced.
DELETE FROM "PlayerInvitationContinuation"
WHERE "invitationId" IN (
  SELECT "id" FROM "PlayerInvitation" WHERE "status" != 'ACTIVE'
);

-- This also runs when ownership/deactivation/archive triggers revoke invitations.
CREATE TRIGGER "PlayerInvitation_terminal_continuation_cleanup"
AFTER UPDATE OF "status" ON "PlayerInvitation"
WHEN OLD."status" = 'ACTIVE' AND NEW."status" != 'ACTIVE'
BEGIN
  DELETE FROM "PlayerInvitationContinuation" WHERE "invitationId" = NEW."id";
END;

-- A later insert or retarget cannot recreate a terminal invitation's capabilities.
CREATE TRIGGER "PlayerInvitationContinuation_active_insert"
BEFORE INSERT ON "PlayerInvitationContinuation"
WHEN NOT EXISTS (
  SELECT 1 FROM "PlayerInvitation" WHERE "id" = NEW."invitationId" AND "status" = 'ACTIVE'
)
BEGIN SELECT RAISE(ABORT, 'INVITATION_CONTINUATION_INACTIVE'); END;

CREATE TRIGGER "PlayerInvitationContinuation_active_update"
BEFORE UPDATE OF "invitationId" ON "PlayerInvitationContinuation"
WHEN NOT EXISTS (
  SELECT 1 FROM "PlayerInvitation" WHERE "id" = NEW."invitationId" AND "status" = 'ACTIVE'
)
BEGIN SELECT RAISE(ABORT, 'INVITATION_CONTINUATION_INACTIVE'); END;
