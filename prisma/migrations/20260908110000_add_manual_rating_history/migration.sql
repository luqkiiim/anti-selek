CREATE TABLE "ClubRatingAdjustment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "memberId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT NOT NULL,
  "beforeElo" INTEGER NOT NULL,
  "afterElo" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClubRatingAdjustment_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "CommunityMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ClubRatingAdjustment_memberId_createdAt_idx" ON "ClubRatingAdjustment"("memberId", "createdAt");
