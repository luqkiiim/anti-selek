import type { Prisma } from "@prisma/client";
export class ClubPlayerMergeError extends Error {
  readonly statusCode = 409;
}
export async function getMergeAffectedSessionIds(_tx: Prisma.TransactionClient, _clubId: string): Promise<string[]> {
  throw new ClubPlayerMergeError("Player merging is deferred. No historical data has been changed.");
}
export async function mergeDuplicateUnclaimedClubPlayer(_tx: Prisma.TransactionClient, _input: { clubId: string; sourceUserId: string; targetUserId: string; reviewerUserId: string }): Promise<never> {
  throw new ClubPlayerMergeError("Player merging is deferred. Ask an administrator to review conflicting identities.");
}
