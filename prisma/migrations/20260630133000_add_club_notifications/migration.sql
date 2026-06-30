CREATE TABLE "ClubNotification" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "communityId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "newsItemId" TEXT NOT NULL,
  "newsType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "readAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClubNotification_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClubNotification_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClubNotification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClubNotification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ClubNotification_type_newsItemId_actorUserId_recipientUserId_key" ON "ClubNotification"("type", "newsItemId", "actorUserId", "recipientUserId");
CREATE INDEX "ClubNotification_communityId_recipientUserId_readAt_createdAt_idx" ON "ClubNotification"("communityId", "recipientUserId", "readAt", "createdAt");
CREATE INDEX "ClubNotification_recipientUserId_createdAt_idx" ON "ClubNotification"("recipientUserId", "createdAt");
