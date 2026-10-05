-- Legacy creators had owner authority independently of their sporting roster role.
-- Restore that authority only in active grants copied by the identity migration.
-- Original Player/ClubMember columns and subsequent explicit revocations stay intact.
UPDATE "ClubAccess"
SET "role" = 'OWNER'
WHERE "status" = 'ACTIVE'
  AND "id" LIKE 'legacy-access:%'
  AND "role" <> 'OWNER'
  AND EXISTS (
    SELECT 1 FROM "Community" c
    WHERE c."id" = "ClubAccess"."clubId"
      AND c."createdById" = "ClubAccess"."userId"
  );
