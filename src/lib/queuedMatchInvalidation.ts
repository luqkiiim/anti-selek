import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

/** Keep the slot reserved until a repair based on this invalidation commits. */
export async function markTypedQueuesForRefresh(
  tx: Prisma.TransactionClient,
  where: Prisma.QueuedMatchWhereInput,
) {
  return tx.queuedMatch.updateMany({
    where: { ...where, requestedMatchType: { not: null } },
    data: { refreshToken: randomUUID() },
  });
}
