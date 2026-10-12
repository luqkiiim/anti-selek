-- Preserve all historical Player/Account fields and session snapshots.
ALTER TABLE "CommunityMember" ADD COLUMN "mixedSideOverride" TEXT
  CHECK ("mixedSideOverride" IS NULL OR "mixedSideOverride" IN ('UPPER', 'LOWER'));

-- The migration runner holds one transaction. Suspend only this retirement
-- update guard for the new-column backfill, then restore its exact definition.
DROP TRIGGER "ClubMember_retirement_preserve";

-- Match normalizeMixedSideOverrideForGender: a valid explicit override takes
-- precedence over legacy partnerPreference, even when it normalizes to null.
UPDATE "CommunityMember" SET "mixedSideOverride" = (
  SELECT CASE
    WHEN p."mixedSideOverride" IN ('UPPER', 'LOWER') THEN CASE
      WHEN p."gender" = 'FEMALE' AND p."mixedSideOverride" = 'UPPER' THEN 'UPPER'
      WHEN p."gender" = 'MALE' AND p."mixedSideOverride" = 'LOWER' THEN 'LOWER'
      ELSE NULL END
    WHEN p."gender" = 'FEMALE' AND p."partnerPreference" = 'OPEN' THEN 'UPPER'
    WHEN p."gender" = 'MALE' AND p."partnerPreference" = 'FEMALE_FLEX' THEN 'LOWER'
    ELSE NULL END
  FROM "User" p WHERE p."id" = "CommunityMember"."userId"
);

CREATE TRIGGER "ClubMember_retirement_preserve" BEFORE UPDATE ON "CommunityMember"
WHEN OLD."retiredByAdmissionEventId" IS NOT NULL
BEGIN SELECT RAISE(ABORT,'PLAYER_RETIRED'); END;
