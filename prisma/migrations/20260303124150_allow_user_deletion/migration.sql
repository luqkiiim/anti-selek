-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "courtId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "team1User1Id" TEXT NOT NULL,
    "team1User2Id" TEXT NOT NULL,
    "team1Score" INTEGER,
    "team2User1Id" TEXT NOT NULL,
    "team2User2Id" TEXT NOT NULL,
    "team2Score" INTEGER,
    "winnerTeam" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "Match_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_team1User1Id_fkey" FOREIGN KEY ("team1User1Id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_team1User2Id_fkey" FOREIGN KEY ("team1User2Id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_team2User1Id_fkey" FOREIGN KEY ("team2User1Id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Match_team2User2Id_fkey" FOREIGN KEY ("team2User2Id") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Match" ("completedAt", "courtId", "createdAt", "id", "sessionId", "status", "team1Score", "team1User1Id", "team1User2Id", "team2Score", "team2User1Id", "team2User2Id", "winnerTeam") SELECT "completedAt", "courtId", "createdAt", "id", "sessionId", "status", "team1Score", "team1User1Id", "team1User2Id", "team2Score", "team2User1Id", "team2User2Id", "winnerTeam" FROM "Match";
DROP TABLE "Match";
ALTER TABLE "new_Match" RENAME TO "Match";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
