ALTER TABLE "CommunityMember" ADD COLUMN "preferredPool" TEXT NOT NULL DEFAULT 'B';

ALTER TABLE "SessionPlayer" ADD COLUMN "pendingPool" TEXT;

ALTER TABLE "Match" ADD COLUMN "courtGroupType" TEXT;
ALTER TABLE "Match" ADD COLUMN "poolASeatCount" INTEGER;
ALTER TABLE "Match" ADD COLUMN "poolBSeatCount" INTEGER;

ALTER TABLE "QueuedMatch" ADD COLUMN "courtGroupType" TEXT;
ALTER TABLE "QueuedMatch" ADD COLUMN "poolASeatCount" INTEGER;
ALTER TABLE "QueuedMatch" ADD COLUMN "poolBSeatCount" INTEGER;
ALTER TABLE "QueuedMatch" ADD COLUMN "isAutomatic" BOOLEAN NOT NULL DEFAULT false;

UPDATE "QueuedMatch"
SET "isAutomatic" = true
WHERE "matchmakingReasonJson" IS NOT NULL;

UPDATE "Session"
SET "poolAName" = 'Competitive',
    "poolBName" = 'Social'
WHERE "poolsEnabled" = true;

UPDATE "Match"
SET "poolASeatCount" = (
      SELECT COUNT(*)
      FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "Match"."sessionId"
        AND sp."pool" = 'A'
        AND sp."userId" IN (
          "Match"."team1User1Id",
          "Match"."team1User2Id",
          "Match"."team2User1Id",
          "Match"."team2User2Id"
        )
    ),
    "poolBSeatCount" = 4 - (
      SELECT COUNT(*)
      FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "Match"."sessionId"
        AND sp."pool" = 'A'
        AND sp."userId" IN (
          "Match"."team1User1Id",
          "Match"."team1User2Id",
          "Match"."team2User1Id",
          "Match"."team2User2Id"
        )
    )
WHERE "sessionId" IN (
  SELECT "id" FROM "Session" WHERE "poolsEnabled" = true
);

UPDATE "Match"
SET "courtGroupType" = CASE
  WHEN "poolASeatCount" = 4 THEN 'COMPETITIVE'
  WHEN "poolBSeatCount" = 4 THEN 'SOCIAL'
  WHEN "poolASeatCount" = 2
    AND (
      SELECT sp."pool"
      FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "Match"."sessionId"
        AND sp."userId" = "Match"."team1User1Id"
    ) <> (
      SELECT sp."pool"
      FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "Match"."sessionId"
        AND sp."userId" = "Match"."team1User2Id"
    )
    AND (
      SELECT sp."pool"
      FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "Match"."sessionId"
        AND sp."userId" = "Match"."team2User1Id"
    ) <> (
      SELECT sp."pool"
      FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "Match"."sessionId"
        AND sp."userId" = "Match"."team2User2Id"
    ) THEN 'CROSSOVER'
  ELSE 'OPEN_OVERFLOW'
END
WHERE "sessionId" IN (
  SELECT "id" FROM "Session" WHERE "poolsEnabled" = true
);

UPDATE "QueuedMatch"
SET "poolASeatCount" = (
      SELECT COUNT(*)
      FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "QueuedMatch"."sessionId"
        AND sp."pool" = 'A'
        AND sp."userId" IN (
          "QueuedMatch"."team1User1Id",
          "QueuedMatch"."team1User2Id",
          "QueuedMatch"."team2User1Id",
          "QueuedMatch"."team2User2Id"
        )
    ),
    "poolBSeatCount" = 4 - (
      SELECT COUNT(*)
      FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "QueuedMatch"."sessionId"
        AND sp."pool" = 'A'
        AND sp."userId" IN (
          "QueuedMatch"."team1User1Id",
          "QueuedMatch"."team1User2Id",
          "QueuedMatch"."team2User1Id",
          "QueuedMatch"."team2User2Id"
        )
    )
WHERE "sessionId" IN (
  SELECT "id" FROM "Session" WHERE "poolsEnabled" = true
);

UPDATE "QueuedMatch"
SET "courtGroupType" = CASE
  WHEN "poolASeatCount" = 4 THEN 'COMPETITIVE'
  WHEN "poolBSeatCount" = 4 THEN 'SOCIAL'
  WHEN "poolASeatCount" = 2
    AND (
      SELECT sp."pool"
      FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "QueuedMatch"."sessionId"
        AND sp."userId" = "QueuedMatch"."team1User1Id"
    ) <> (
      SELECT sp."pool"
      FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "QueuedMatch"."sessionId"
        AND sp."userId" = "QueuedMatch"."team1User2Id"
    )
    AND (
      SELECT sp."pool"
      FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "QueuedMatch"."sessionId"
        AND sp."userId" = "QueuedMatch"."team2User1Id"
    ) <> (
      SELECT sp."pool"
      FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "QueuedMatch"."sessionId"
        AND sp."userId" = "QueuedMatch"."team2User2Id"
    ) THEN 'CROSSOVER'
  ELSE 'OPEN_OVERFLOW'
END
WHERE "sessionId" IN (
  SELECT "id" FROM "Session" WHERE "poolsEnabled" = true
);
