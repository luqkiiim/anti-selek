CREATE TABLE "ClubNewsLike" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "communityId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "newsItemId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClubNewsLike_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClubNewsLike_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClubNewsLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ClubNewsLike_newsItemId_userId_key" ON "ClubNewsLike"("newsItemId", "userId");
CREATE INDEX "ClubNewsLike_communityId_sessionId_idx" ON "ClubNewsLike"("communityId", "sessionId");
CREATE INDEX "ClubNewsLike_userId_idx" ON "ClubNewsLike"("userId");
