-- AlterTable
ALTER TABLE "SessionCommunity" ADD COLUMN "resetConfirmedRevision" INTEGER;
ALTER TABLE "SessionCommunity" ADD COLUMN "rulesConfirmedRevision" INTEGER;

-- CreateTable
CREATE TABLE "SessionLineupRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "team1Player1Id" TEXT,
    "team1Player2Id" TEXT,
    "team2Player1Id" TEXT,
    "team2Player2Id" TEXT,
    "hostConfirmedRevision" INTEGER,
    "partnerConfirmedRevision" INTEGER,
    "courtPreferenceId" TEXT,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "matchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SessionLineupRow_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessionLineupRow_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SessionLineupRow_courtPreferenceId_fkey" FOREIGN KEY ("courtPreferenceId") REFERENCES "Court" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SessionLineupRow_team1Player1Id_fkey" FOREIGN KEY ("team1Player1Id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SessionLineupRow_team1Player2Id_fkey" FOREIGN KEY ("team1Player2Id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SessionLineupRow_team2Player1Id_fkey" FOREIGN KEY ("team2Player1Id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SessionLineupRow_team2Player2Id_fkey" FOREIGN KEY ("team2Player2Id") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SessionCollaborationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detailsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SessionCollaborationEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Additive changes preserve existing rows, indexes, and triggers.
ALTER TABLE "Session" ADD COLUMN "collaborationVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Session" ADD COLUMN "schedulingMode" TEXT NOT NULL DEFAULT 'FREE_PLAY';
ALTER TABLE "Session" ADD COLUMN "scoringFormat" TEXT NOT NULL DEFAULT 'SINGLE_GAME';
ALTER TABLE "Session" ADD COLUMN "ratingMode" TEXT NOT NULL DEFAULT 'RATED';
ALTER TABLE "Session" ADD COLUMN "rulesRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Session" ADD COLUMN "resultsRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Match" ADD COLUMN "scoringFormat" TEXT NOT NULL DEFAULT 'SINGLE_GAME';
ALTER TABLE "Match" ADD COLUMN "gameScoresJson" TEXT;
ALTER TABLE "Match" ADD COLUMN "scoreRevision" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "SessionLineupRow_matchId_key" ON "SessionLineupRow"("matchId");

-- CreateIndex
CREATE INDEX "SessionLineupRow_sessionId_position_idx" ON "SessionLineupRow"("sessionId", "position");

-- CreateIndex
CREATE INDEX "SessionCollaborationEvent_sessionId_createdAt_idx" ON "SessionCollaborationEvent"("sessionId", "createdAt");


ALTER TABLE "SessionPlayer" ADD COLUMN "hasStartedMatch" BOOLEAN NOT NULL DEFAULT false;
