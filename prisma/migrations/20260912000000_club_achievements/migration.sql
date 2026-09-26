ALTER TABLE "CommunityMember" ADD COLUMN "achievementPreferencesJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Session" ADD COLUMN "achievementEligibilityJson" TEXT NOT NULL DEFAULT '{}';
