-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SessionPlayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionPoints" INTEGER NOT NULL DEFAULT 0,
    "lastPartnerId" TEXT,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "SessionPlayer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SessionPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SessionPlayer" ("id", "lastPartnerId", "sessionId", "sessionPoints", "userId") SELECT "id", "lastPartnerId", "sessionId", "sessionPoints", "userId" FROM "SessionPlayer";
DROP TABLE "SessionPlayer";
ALTER TABLE "new_SessionPlayer" RENAME TO "SessionPlayer";
CREATE UNIQUE INDEX "SessionPlayer_sessionId_userId_key" ON "SessionPlayer"("sessionId", "userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
