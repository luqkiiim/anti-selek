import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ access: vi.fn(), submit: vi.fn(), admin: vi.fn(), discovery: vi.fn(), auth: vi.fn(), clubAdmin: vi.fn() }));
vi.mock("@/lib/clubJoinRequests", () => ({ joinRequestAccess: mocks.access }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/clubAdminPermissions", () => ({ getClubAdminAccess: mocks.clubAdmin }));
vi.mock("@/lib/clubAdmissions", () => ({
  admissionInclude: {}, admissionTransaction: async (_db: unknown, callback: (tx: object) => unknown) => callback({}),
  submitClubAdmission: mocks.submit, reviewClubAdmission: vi.fn(),
  ClubAdmissionError: class extends Error { constructor(message: string, public statusCode = 400) { super(message); } },
}));
import { POST } from "./route";
function claim(body: unknown) {
  return POST(new Request("http://localhost/api/communities/club/claim-requests", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: "club" }) });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.access.mockResolvedValue({ userId: "new-account", isGlobalAdmin: false });
  mocks.submit.mockResolvedValue({ id: "request", status: "PENDING", requestedPlayerId: "historical-player" });
});
describe("legacy claim route queues the same admission service", () => {
  it("accepts a historical Player ID before the account owns any Player", async () => {
    const response = await claim({ targetPlayerId: "historical-player", note: "I played here last year" });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "PENDING" });
    expect(mocks.submit).toHaveBeenCalledWith({}, { clubId: "club", kind: "EXISTING_PLAYER", requestedPlayerId: "historical-player", note: "I played here last year", requesterUserId: "new-account" });
  });
  it("maps the old targetUserId property to a Player ID", async () => {
    expect((await claim({ targetUserId: "historical-player" })).status).toBe(200);
    expect(mocks.submit).toHaveBeenCalledWith({}, expect.objectContaining({ requestedPlayerId: "historical-player", requesterUserId: "new-account" }));
  });
  it("rejects missing selection without starting an admission", async () => {
    expect((await claim({ note: "No target" })).status).toBe(400);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("returns the authentication/quick access guard response", async () => {
    mocks.access.mockResolvedValue({ response: Response.json({ error: "Account required" }, { status: 403 }) });
    expect((await claim({ targetPlayerId: "historical-player" })).status).toBe(403);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
});
