ALTER TABLE "Session" ADD COLUMN "poolAssignmentsInitialized" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Session"
SET "poolAssignmentsInitialized" = true
WHERE "poolsEnabled" = true;
