import { afterEach, expect, it, vi } from "vitest";
import { fetchClubAdminSnapshot } from "./clubAdminApi";

afterEach(() => vi.unstubAllGlobals());
it("adapts the current admission response for the existing claim panel without losing recovery controls or revision", async () => {
  const recovery = { invitationAvailability: "ACTIVE", needsAccessRestore: true, duplicate: null, blockers: [], canApprove: true };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.endsWith("/claim-requests") ? { requests: [
      { id: "claim", kind: "EXISTING_PLAYER", requesterUserId: "account", requesterName: "Ari", requesterEmail: "ari@example.invalid", requestedPlayerId: "original", targetName: "Ari Player", status: "PENDING", createdAt: "2026-10-08", revision: 3, recovery, recoveryReviewAuthorized: false },
      { id: "new", kind: "NEW_PLAYER" },
    ] } : url.endsWith("/members") || url.endsWith("/offline-identity-links") ? [] : { club: { id: "club", role: "ADMIN", isTutorial: false } };
    return new Response(JSON.stringify(body));
  }));
  const snapshot = await fetchClubAdminSnapshot("club");
  expect(snapshot.claimRequests).toEqual([expect.objectContaining({ id: "claim", targetUserId: "original", targetEmail: null, revision: 3, recovery, recoveryReviewAuthorized: false })]);
});
