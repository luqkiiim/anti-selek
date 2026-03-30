CREATE TABLE "QueuedMatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "team1User1Id" TEXT NOT NULL,
    "team1User2Id" TEXT NOT NULL,
    "team2User1Id" TEXT NOT NULL,
    "team2User2Id" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QueuedMatch_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "QueuedMatch_sessionId_key" ON "QueuedMatch"("sessionId");
