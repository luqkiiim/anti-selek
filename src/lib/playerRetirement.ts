import type { Prisma, PrismaClient } from "@prisma/client";

const explanations: Record<string, string> = {
  CLUB_RELATIONSHIPS: "The duplicate has other club relationships or no single club roster record.",
  ROSTER_NOT_ARCHIVED: "The duplicate must already be removed from the club and must not already be retired.",
  RATING_DATA: "The duplicate has rating changes or a non-default rating.",
  ACHIEVEMENT_PREFERENCES: "The duplicate has achievement preferences or ambiguous achievement data.",
  SESSION_PARTICIPATION: "The duplicate appears in session participation or partner history.",
  MATCH_HISTORY: "The duplicate appears in match or score-submitter records.",
  QUEUED_MATCH: "The duplicate appears in a queued match.",
  HOSTING_CREDIT: "The duplicate has session hosting credit.",
  OFFLINE_IDENTITY: "The duplicate has offline identity relationships.",
  NOTIFICATIONS: "The duplicate has notifications that must be preserved.",
  UNRESOLVED_REQUEST: "The duplicate has unresolved profile requests or invitations.",
  ACHIEVEMENT_ELIGIBILITY: "The duplicate appears in achievement eligibility, or that metadata cannot be verified.",
  MATCH_METADATA: "The duplicate appears in sporting match metadata, or that metadata cannot be verified.",
  QUEUE_METADATA: "The duplicate appears in queue metadata, or that metadata cannot be verified.",
  UNSNAPSHOTTED_ACHIEVEMENTS: "Historical achievement eligibility has not been captured and cannot be ruled out safely.",
};

/** Same inventory as the database retirement guard; never invokes lazy achievement writes. */
export async function playerRetirementBlockerDetails(db: Prisma.TransactionClient | PrismaClient, playerId: string) {
  const rows = await db.$queryRaw<Array<{ reason: string }>>`SELECT DISTINCT "reason" FROM "PlayerRetirementBlocker" WHERE "playerId"=${playerId}`;
  return rows.map(row => ({ code: row.reason, message: explanations[row.reason] ?? "The duplicate has an unresolved historical reference." }));
}

export async function playerRetirementBlockers(db: Prisma.TransactionClient | PrismaClient, playerId: string) {
  return (await playerRetirementBlockerDetails(db, playerId)).map(row => row.message);
}
