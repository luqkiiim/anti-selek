-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "communityId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'POINTS',
    "mode" TEXT NOT NULL DEFAULT 'MEXICANO',
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "sourceSessionId" TEXT,
    "poolsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "poolAName" TEXT,
    "poolBName" TEXT,
    "poolACourtAssignments" INTEGER NOT NULL DEFAULT 0,
    "poolBCourtAssignments" INTEGER NOT NULL DEFAULT 0,
    "poolAMissedTurns" INTEGER NOT NULL DEFAULT 0,
    "poolBMissedTurns" INTEGER NOT NULL DEFAULT 0,
    "crossoverMissThreshold" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    CONSTRAINT "Session_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("code", "communityId", "createdAt", "crossoverMissThreshold", "endedAt", "id", "mode", "name", "poolACourtAssignments", "poolAMissedTurns", "poolAName", "poolBCourtAssignments", "poolBMissedTurns", "poolBName", "poolsEnabled", "status", "type") SELECT "code", "communityId", "createdAt", "crossoverMissThreshold", "endedAt", "id", "mode", "name", "poolACourtAssignments", "poolAMissedTurns", "poolAName", "poolBCourtAssignments", "poolBMissedTurns", "poolBName", "poolsEnabled", "status", "type" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE UNIQUE INDEX "Session_code_key" ON "Session"("code");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
