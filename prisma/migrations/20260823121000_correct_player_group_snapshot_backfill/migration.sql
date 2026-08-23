UPDATE "Match"
SET "poolBSeatCount" = (
  SELECT COUNT(*)
  FROM "SessionPlayer" AS sp
  WHERE sp."sessionId" = "Match"."sessionId"
    AND sp."pool" = 'B'
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
    AND "poolBSeatCount" = 2
    AND (
      SELECT sp."pool" FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "Match"."sessionId"
        AND sp."userId" = "Match"."team1User1Id"
    ) <> (
      SELECT sp."pool" FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "Match"."sessionId"
        AND sp."userId" = "Match"."team1User2Id"
    )
    AND (
      SELECT sp."pool" FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "Match"."sessionId"
        AND sp."userId" = "Match"."team2User1Id"
    ) <> (
      SELECT sp."pool" FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "Match"."sessionId"
        AND sp."userId" = "Match"."team2User2Id"
    ) THEN 'CROSSOVER'
  ELSE 'OPEN_OVERFLOW'
END
WHERE "sessionId" IN (
  SELECT "id" FROM "Session" WHERE "poolsEnabled" = true
);

UPDATE "QueuedMatch"
SET "poolBSeatCount" = (
  SELECT COUNT(*)
  FROM "SessionPlayer" AS sp
  WHERE sp."sessionId" = "QueuedMatch"."sessionId"
    AND sp."pool" = 'B'
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
    AND "poolBSeatCount" = 2
    AND (
      SELECT sp."pool" FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "QueuedMatch"."sessionId"
        AND sp."userId" = "QueuedMatch"."team1User1Id"
    ) <> (
      SELECT sp."pool" FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "QueuedMatch"."sessionId"
        AND sp."userId" = "QueuedMatch"."team1User2Id"
    )
    AND (
      SELECT sp."pool" FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "QueuedMatch"."sessionId"
        AND sp."userId" = "QueuedMatch"."team2User1Id"
    ) <> (
      SELECT sp."pool" FROM "SessionPlayer" AS sp
      WHERE sp."sessionId" = "QueuedMatch"."sessionId"
        AND sp."userId" = "QueuedMatch"."team2User2Id"
    ) THEN 'CROSSOVER'
  ELSE 'OPEN_OVERFLOW'
END
WHERE "sessionId" IN (
  SELECT "id" FROM "Session" WHERE "poolsEnabled" = true
);
