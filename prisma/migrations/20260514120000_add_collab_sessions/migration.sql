-- CreateTable
CREATE TABLE "SessionCommunity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PARTNER',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SessionCommunity_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessionCommunity_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessionCommunity_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SessionCommunity_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchEloAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "beforeElo" INTEGER NOT NULL,
    "afterElo" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchEloAdjustment_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchEloAdjustment_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchEloAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backfill host links for existing community sessions.
INSERT INTO "SessionCommunity" (
    "id",
    "sessionId",
    "communityId",
    "role",
    "status",
    "createdAt",
    "updatedAt"
)
SELECT
    lower(hex(randomblob(16))),
    "id",
    "communityId",
    'HOST',
    'ACCEPTED',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Session"
WHERE "communityId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "SessionCommunity_sessionId_communityId_key" ON "SessionCommunity"("sessionId", "communityId");

-- CreateIndex
CREATE INDEX "SessionCommunity_communityId_status_idx" ON "SessionCommunity"("communityId", "status");

-- CreateIndex
CREATE INDEX "SessionCommunity_sessionId_role_idx" ON "SessionCommunity"("sessionId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "MatchEloAdjustment_matchId_communityId_userId_key" ON "MatchEloAdjustment"("matchId", "communityId", "userId");

-- CreateIndex
CREATE INDEX "MatchEloAdjustment_communityId_userId_idx" ON "MatchEloAdjustment"("communityId", "userId");

-- CreateIndex
CREATE INDEX "MatchEloAdjustment_userId_idx" ON "MatchEloAdjustment"("userId");
