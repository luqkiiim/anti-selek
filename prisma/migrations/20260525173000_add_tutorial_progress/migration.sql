CREATE TABLE "TutorialProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tutorialKey" TEXT NOT NULL,
    "completedStepIdsJson" TEXT NOT NULL DEFAULT '[]',
    "dismissedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TutorialProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TutorialProgress_userId_tutorialKey_key" ON "TutorialProgress"("userId", "tutorialKey");
CREATE INDEX "TutorialProgress_tutorialKey_idx" ON "TutorialProgress"("tutorialKey");
