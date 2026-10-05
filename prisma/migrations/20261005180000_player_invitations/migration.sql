-- CreateTable
CREATE TABLE "PlayerInvitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clubId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "clubMemberId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" DATETIME NOT NULL,
    "redeemedByUserId" TEXT,
    "redeemedAt" DATETIME,
    "revokedByUserId" TEXT,
    "revokedAt" DATETIME,
    "revocationReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayerInvitation_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Community" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerInvitation_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerInvitation_clubMemberId_fkey" FOREIGN KEY ("clubMemberId") REFERENCES "CommunityMember" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerInvitation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerInvitation_redeemedByUserId_fkey" FOREIGN KEY ("redeemedByUserId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerInvitation_revokedByUserId_fkey" FOREIGN KEY ("revokedByUserId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerInvitationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invitationId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerInvitationEvent_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "PlayerInvitation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlayerInvitationEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlayerInvitationContinuation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invitationId" TEXT NOT NULL,
    "handleHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlayerInvitationContinuation_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "PlayerInvitation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerInvitation_tokenHash_key" ON "PlayerInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "PlayerInvitation_clubId_playerId_status_idx" ON "PlayerInvitation"("clubId", "playerId", "status");

-- CreateIndex
CREATE INDEX "PlayerInvitation_expiresAt_idx" ON "PlayerInvitation"("expiresAt");

-- CreateIndex
CREATE INDEX "PlayerInvitationEvent_invitationId_createdAt_idx" ON "PlayerInvitationEvent"("invitationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerInvitationContinuation_handleHash_key" ON "PlayerInvitationContinuation"("handleHash");

-- CreateIndex
CREATE INDEX "PlayerInvitationContinuation_invitationId_expiresAt_idx" ON "PlayerInvitationContinuation"("invitationId", "expiresAt");

-- Prisma cannot express SQLite partial indexes or these lifecycle guarantees.
CREATE UNIQUE INDEX "PlayerInvitation_active_club_player" ON "PlayerInvitation"("clubId", "playerId") WHERE "status" = 'ACTIVE';
CREATE TRIGGER "PlayerInvitation_target_guard" BEFORE INSERT ON "PlayerInvitation"
WHEN NEW."status" != 'ACTIVE' OR NOT EXISTS (
  SELECT 1 FROM "CommunityMember" m JOIN "User" p ON p."id"=m."userId" JOIN "Community" c ON c."id"=m."communityId"
  WHERE m."id"=NEW."clubMemberId" AND m."communityId"=NEW."clubId" AND m."userId"=NEW."playerId"
    AND m."archivedAt" IS NULL AND p."isActive"=1 AND p."ownerUserId" IS NULL AND c."isTutorial"=0
) BEGIN SELECT RAISE(ABORT, 'INVITATION_TARGET_INVALID'); END;
CREATE TRIGGER "PlayerInvitation_binding_immutable" BEFORE UPDATE OF "clubId", "playerId", "clubMemberId", "createdByUserId", "tokenHash", "expiresAt", "createdAt" ON "PlayerInvitation"
BEGIN SELECT RAISE(ABORT, 'INVITATION_BINDING_IMMUTABLE'); END;
CREATE TRIGGER "PlayerInvitation_terminal_immutable" BEFORE UPDATE ON "PlayerInvitation" WHEN OLD."status" != 'ACTIVE'
BEGIN SELECT RAISE(ABORT, 'INVITATION_TERMINAL_IMMUTABLE'); END;
CREATE TRIGGER "PlayerInvitation_state_guard" BEFORE UPDATE ON "PlayerInvitation"
WHEN NEW."status" NOT IN ('ACTIVE','EXPIRED','REVOKED','REDEEMED')
 OR (NEW."status"='REDEEMED' AND (NEW."redeemedByUserId" IS NULL OR NEW."redeemedAt" IS NULL))
BEGIN SELECT RAISE(ABORT, 'INVITATION_STATE_INVALID'); END;

-- The winning invitation is consumed before the ownership CAS. All other links die
-- permanently, including claims made through the existing admission workflow.
CREATE TRIGGER "PlayerInvitation_player_unavailable" AFTER UPDATE OF "ownerUserId", "isActive" ON "User"
WHEN NEW."ownerUserId" IS NOT NULL OR NEW."isActive"=0
BEGIN UPDATE "PlayerInvitation" SET "status"='REVOKED', "revokedAt"=CURRENT_TIMESTAMP, "revocationReason"='PLAYER_UNAVAILABLE', "updatedAt"=CURRENT_TIMESTAMP WHERE "playerId"=NEW."id" AND "status"='ACTIVE'; END;
CREATE TRIGGER "PlayerInvitation_roster_archived" AFTER UPDATE OF "archivedAt" ON "CommunityMember" WHEN NEW."archivedAt" IS NOT NULL
BEGIN UPDATE "PlayerInvitation" SET "status"='REVOKED', "revokedAt"=CURRENT_TIMESTAMP, "revocationReason"='ROSTER_ARCHIVED', "updatedAt"=CURRENT_TIMESTAMP WHERE "clubMemberId"=NEW."id" AND "status"='ACTIVE'; END;

-- Audit includes no token/hash/continuation. Triggers also audit direct invalidation.
CREATE TRIGGER "PlayerInvitation_created_event" AFTER INSERT ON "PlayerInvitation"
BEGIN INSERT INTO "PlayerInvitationEvent" ("id","invitationId","actorUserId","action") VALUES (lower(hex(randomblob(16))),NEW."id",NEW."createdByUserId",'CREATED'); END;
CREATE TRIGGER "PlayerInvitation_status_event" AFTER UPDATE OF "status" ON "PlayerInvitation" WHEN NEW."status" != OLD."status"
BEGIN INSERT INTO "PlayerInvitationEvent" ("id","invitationId","actorUserId","action","reason") VALUES (lower(hex(randomblob(16))),NEW."id",CASE WHEN NEW."status"='REDEEMED' THEN NEW."redeemedByUserId" ELSE NEW."revokedByUserId" END,NEW."status",NEW."revocationReason"); END;
CREATE TRIGGER "PlayerInvitationEvent_no_update" BEFORE UPDATE ON "PlayerInvitationEvent" BEGIN SELECT RAISE(ABORT, 'INVITATION_EVENT_IMMUTABLE'); END;
CREATE TRIGGER "PlayerInvitationEvent_no_delete" BEFORE DELETE ON "PlayerInvitationEvent" BEGIN SELECT RAISE(ABORT, 'INVITATION_EVENT_IMMUTABLE'); END;
