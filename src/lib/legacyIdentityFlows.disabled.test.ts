import type { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { confirmAuthorizedInvitation, createAuthorizedInvitation, identityOptions } from "./playerInvitationAuthorization";
import { reviewInvitationRecovery, submitInvitationRecovery } from "./playerInvitationRecovery";

// These retired capabilities must fail before reading account eligibility or
// opening an identity writer, even when invoked through an old URL or client.
const noDatabase = new Proxy({}, {
  get() { throw new Error("Legacy flow touched the database"); },
}) as Prisma.TransactionClient;

describe("closed legacy identity flows", () => {
  for (const purpose of ["CORRECTION", "ACCESS_RESTORE"] as const) {
    it(`closes ${purpose} account eligibility lists without any database read`, async () => {
      await expect(identityOptions(noDatabase, { clubId: "club-b", targetPlayerId: "original", issuerAccountId: "admin", purpose }))
        .rejects.toMatchObject({ statusCode: 410, code: "LEGACY_IDENTITY_FLOW_DISABLED" });
    });

    it(`closes ${purpose} creation before any database operation`, async () => {
      const input = { clubId: "club-b", targetPlayerId: "original", issuerAccountId: "admin", recipientAccountId: "account", reason: "old client", restoreArchivedRoster: false as const, sourcePlayerId: "duplicate", sourceMemberId: "member", retireSourcePlayerId: "duplicate" };
      await expect(createAuthorizedInvitation(noDatabase, purpose, input))
        .rejects.toMatchObject({ statusCode: 410, code: "LEGACY_IDENTITY_FLOW_DISABLED" });
    });

    it(`closes ${purpose} confirmation before ownership or access writes`, async () => {
      await expect(confirmAuthorizedInvitation(noDatabase, purpose, { invitationId: "old-invite", userId: "account" }))
        .rejects.toMatchObject({ statusCode: 410, code: "LEGACY_IDENTITY_FLOW_DISABLED" });
    });
  }

  it("closes recovery submission before opening a request", async () => {
    await expect(submitInvitationRecovery(noDatabase, { invitationId: "old-invite", userId: "account", idempotencyKey: "retry" }))
      .rejects.toMatchObject({ statusCode: 410, code: "LEGACY_IDENTITY_FLOW_DISABLED" });
  });

  it("closes recovery approval before grants or retirement", async () => {
    await expect(reviewInvitationRecovery(noDatabase, { clubId: "club-b", requestId: "old-request", reviewerUserId: "admin", action: "APPROVE" }))
      .rejects.toMatchObject({ statusCode: 410, code: "LEGACY_IDENTITY_FLOW_DISABLED" });
  });
});
