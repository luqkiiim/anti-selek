import { describe, it, expect } from "vitest";
import type { Prisma } from "@prisma/client";
import { mergeDuplicateUnclaimedClubPlayer, getMergeAffectedSessionIds } from "./clubPlayerMerge";
describe("Phase 1 merge guard", () => {
  it("rejects merging without reading or writing a database", async () => {
    const db = new Proxy({}, { get() { throw new Error("Database access is forbidden"); } }) as Prisma.TransactionClient;
    await expect(mergeDuplicateUnclaimedClubPlayer(db, { clubId: "club", sourceUserId: "old-player", targetUserId: "new-player", reviewerUserId: "account" })).rejects.toMatchObject({ statusCode: 409 });
    await expect(getMergeAffectedSessionIds(db, "club")).rejects.toMatchObject({ statusCode: 409 });
  });
});
