-- Keep court IDs and all match/lineup history when availability changes.
ALTER TABLE "Court" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
