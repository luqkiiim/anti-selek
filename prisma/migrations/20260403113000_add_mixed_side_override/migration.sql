ALTER TABLE "User" ADD COLUMN "mixedSideOverride" TEXT;

ALTER TABLE "SessionPlayer" ADD COLUMN "mixedSideOverride" TEXT;

UPDATE "User"
SET "mixedSideOverride" = 'UPPER'
WHERE "mixedSideOverride" IS NULL
  AND "gender" = 'FEMALE'
  AND "partnerPreference" = 'OPEN';

UPDATE "SessionPlayer"
SET "mixedSideOverride" = 'UPPER'
WHERE "mixedSideOverride" IS NULL
  AND "gender" = 'FEMALE'
  AND "partnerPreference" = 'OPEN';
