-- Guard the two durable steps of an ordinary CLAIM. Existing legacy ownership rows
-- are untouched; only a new owner assignment or CLAIM redemption is checked.
-- A retired identity is not counted, so a correction may retire its exact source
-- before linking the preserved target. Same-Player membership reuse makes no
-- ownerUserId transition and remains valid.
CREATE TRIGGER "PlayerInvitation_claim_identity_guard"
BEFORE UPDATE OF "status" ON "PlayerInvitation"
WHEN OLD."status"='ACTIVE'
 AND NEW."status"='REDEEMED'
 AND NEW."purpose"='CLAIM'
 AND NEW."redeemedByUserId" IS NOT NULL
 AND EXISTS (
   SELECT 1 FROM "User" other
   WHERE other."ownerUserId"=NEW."redeemedByUserId"
    AND other."id" IS NOT NEW."playerId"
    AND NOT EXISTS (
      SELECT 1 FROM "RetiredPlayer" retired WHERE retired."playerId"=other."id"
    )
 )
BEGIN SELECT RAISE(ABORT,'IDENTITY_CONFLICT'); END;

-- Also guard the ownership transition itself. This protects direct writers and
-- owner-first statement order, while leaving existing multi-owned legacy rows
-- and non-identity edits unchanged.
CREATE TRIGGER "Player_owner_claim_identity_guard"
BEFORE UPDATE OF "ownerUserId" ON "User"
WHEN OLD."ownerUserId" IS NULL
 AND NEW."ownerUserId" IS NOT NULL
 AND EXISTS (
   SELECT 1 FROM "User" other
   WHERE other."ownerUserId"=NEW."ownerUserId"
    AND other."id" IS NOT NEW."id"
    AND NOT EXISTS (
      SELECT 1 FROM "RetiredPlayer" retired WHERE retired."playerId"=other."id"
    )
 )
BEGIN SELECT RAISE(ABORT,'IDENTITY_CONFLICT'); END;
