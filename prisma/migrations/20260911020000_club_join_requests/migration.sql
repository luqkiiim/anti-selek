ALTER TABLE "Community" ADD COLUMN "allowJoinRequests" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "ClubJoinRequest" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "clubId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" DATETIME,
  "reviewedById" TEXT,
  CONSTRAINT "ClubJoinRequest_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Community" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClubJoinRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ClubJoinRequest_clubId_userId_key" ON "ClubJoinRequest"("clubId", "userId");
CREATE INDEX "ClubJoinRequest_clubId_status_idx" ON "ClubJoinRequest"("clubId", "status");
