import { afterEach, expect, it, vi } from "vitest";
import { fetchClubAdminSnapshot } from "./clubAdminApi";

afterEach(() => vi.unstubAllGlobals());
it("loads local profile claim requests without loading legacy identity links or recovery controls", async () => {
  const fetchMock = vi.fn(async (url: string) => {
    const body = url.endsWith("/claim-requests") ? { requests: [
      { id: "claim", kind: "EXISTING_PLAYER", requesterUserId: "account", requesterName: "Ari", requesterEmail: "ari@example.invalid", requestedPlayerId: "original", targetName: "Ari Player", status: "PENDING", createdAt: "2026-10-08", revision: 3 },
      { id: "new", kind: "NEW_PLAYER" },
    ] } : url.endsWith("/members") ? [] : { club: { id: "club", role: "ADMIN", isTutorial: false } };
    return new Response(JSON.stringify(body));
  });
  vi.stubGlobal("fetch", fetchMock);
  const snapshot = await fetchClubAdminSnapshot("club");
  expect(snapshot.claimRequests).toEqual([expect.objectContaining({ id: "claim", targetUserId: "original", targetEmail: null, revision: 3 })]);
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    "/api/clubs/club",
    "/api/clubs/club/members",
    "/api/clubs/club/claim-requests",
  ]);
});
