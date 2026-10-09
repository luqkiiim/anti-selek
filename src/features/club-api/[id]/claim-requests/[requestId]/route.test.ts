import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), review: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/clubJoinRequests", () => ({ joinRequestAccess: mocks.access }));
vi.mock("@/lib/clubAdmissions", () => ({ admissionInclude: {}, submitClubAdmission: vi.fn(), reviewClubAdmission: mocks.review, admissionTransaction: async (_db: unknown, fn: (tx: object) => unknown) => fn({}), ClubAdmissionError: class extends Error {} }));
import { PATCH } from "./route";
const context = { params: Promise.resolve({ id: "club", requestId: "claim" }) };
const request = (body: unknown) => new Request("http://localhost/api/clubs/club/claim-requests/claim", { method: "PATCH", body: JSON.stringify(body) });
beforeEach(() => { vi.resetAllMocks(); mocks.access.mockResolvedValue({ userId: "admin-account", isGlobalAdmin: false }); mocks.review.mockResolvedValue({ id: "claim", status: "APPROVED", approvedPlayerId: "historical-player" }); });
describe("legacy claim review routes through ownership admission", () => {
  it("passes the Account actor and selected Player separately without avatar/history cleanup", async () => {
    const response = await PATCH(request({ action: "APPROVE", playerId: "historical-player", revision: 0 }), context);
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ approvedPlayerId: "historical-player" });
    expect(mocks.review).toHaveBeenCalledWith({}, { action: "APPROVE", playerId: "historical-player", revision: 0, clubId: "club", requestId: "claim", reviewerUserId: "admin-account", isGlobalAdmin: false, requestOriginValid: false });
  });
  it("rejects an invalid action before invoking review", async () => {
    expect((await PATCH(request({ action: "MERGE" }), context)).status).toBe(400); expect(mocks.review).not.toHaveBeenCalled();
  });
});
