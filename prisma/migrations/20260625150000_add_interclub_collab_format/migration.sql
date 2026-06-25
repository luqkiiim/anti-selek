ALTER TABLE "Session" ADD COLUMN "collabFormat" TEXT NOT NULL DEFAULT 'FREE_PLAY';
ALTER TABLE "SessionPlayer" ADD COLUMN "representingClubId" TEXT;
ALTER TABLE "Match" ADD COLUMN "team1ClubId" TEXT;
ALTER TABLE "Match" ADD COLUMN "team2ClubId" TEXT;
ALTER TABLE "QueuedMatch" ADD COLUMN "team1ClubId" TEXT;
ALTER TABLE "QueuedMatch" ADD COLUMN "team2ClubId" TEXT;

CREATE INDEX "SessionPlayer_sessionId_representingClubId_idx" ON "SessionPlayer"("sessionId", "representingClubId");
CREATE INDEX "Match_sessionId_team1ClubId_idx" ON "Match"("sessionId", "team1ClubId");
CREATE INDEX "Match_sessionId_team2ClubId_idx" ON "Match"("sessionId", "team2ClubId");
