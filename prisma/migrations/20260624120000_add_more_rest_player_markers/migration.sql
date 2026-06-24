ALTER TABLE "CommunityMember" ADD COLUMN "needsMoreRest" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SessionPlayer" ADD COLUMN "needsMoreRest" BOOLEAN NOT NULL DEFAULT false;
