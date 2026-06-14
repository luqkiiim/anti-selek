ALTER TABLE "Session" ADD COLUMN "scoringType" TEXT NOT NULL DEFAULT 'POINTS';
ALTER TABLE "Session" ADD COLUMN "matchmakingStyle" TEXT NOT NULL DEFAULT 'BALANCED';
ALTER TABLE "Session" ADD COLUMN "balanceMetric" TEXT NOT NULL DEFAULT 'SESSION_POINTS';
ALTER TABLE "Session" ADD COLUMN "pairingMode" TEXT NOT NULL DEFAULT 'OPEN';

UPDATE "Session"
SET
  "scoringType" = 'POINTS',
  "matchmakingStyle" = CASE
    WHEN "type" = 'SOCIAL_MIX' THEN 'SOCIAL'
    WHEN "type" = 'RACE' THEN 'LEVEL_MATCH'
    WHEN "type" = 'LADDER' THEN 'LEVEL_MATCH'
    ELSE 'BALANCED'
  END,
  "balanceMetric" = CASE
    WHEN "type" = 'ELO' THEN 'RATING'
    ELSE 'SESSION_POINTS'
  END,
  "pairingMode" = CASE
    WHEN "mode" = 'MIXICANO' THEN 'MIXED'
    ELSE 'OPEN'
  END;
