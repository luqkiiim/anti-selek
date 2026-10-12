import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), member: vi.fn(), access: vi.fn(), update: vi.fn(), sync: vi.fn(), upload: vi.fn(), cleanup: vi.fn(), rollback: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { clubMember: { findFirst: mocks.member }, clubAccess: { findUnique: mocks.access }, player: { update: mocks.update } } }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: async () => null, checkInvalidTargetRateLimit: async () => null, invalidTargetResponse: async () => Response.json({ error: "Unavailable" }, { status: 404 }) }));
vi.mock("@/lib/clubAdmissions", () => ({ admissionTransaction: async (db: object, fn: (tx: object) => unknown) => fn(db) }));
vi.mock("@/lib/accountProfileSync", async original => ({ ...await original<typeof import("@/lib/accountProfileSync")>(), syncAccountProfile: mocks.sync }));
vi.mock("@/lib/avatarStorage", () => ({ uploadAvatarObject: mocks.upload, cleanupSupersededAvatar: mocks.cleanup, rollbackUploadedAvatar: mocks.rollback }));
import { POST, DELETE } from "./route";
const member = { ownerUserId: "owner", ownershipRevision: 1, player: { avatarKey: "old", clubMemberships: [{ ownerUserId: "owner", retiredByAdmissionEventId: null }] } };
function request(method = "DELETE", club = true) {
  const body = new FormData(); body.append("avatar", new File([new Uint8Array([137,80,78,71,13,10,26,10])], "photo.png", { type: "image/png" }));
  return new Request(`http://localhost/api/users/player/avatar${club ? "?clubId=club" : ""}`, { method, ...(method === "POST" ? { body } : {}) });
}
const params = { params: Promise.resolve({ id: "player" }) };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("BLOB_READ_WRITE_TOKEN", "local-token");
  mocks.auth.mockResolvedValue({ user: { id: "owner" } }); mocks.member.mockResolvedValue(member);
  mocks.sync.mockResolvedValue({ previousAvatarKeys: ["old"] }); mocks.upload.mockResolvedValue("https://blob.vercel-storage.com/avatars/new.png");
});
afterEach(() => vi.unstubAllEnvs());
describe("club-context avatar authorization", () => {
  it("synchronizes owner photos via canonical Account service", async () => {
    expect((await DELETE(request(), params)).status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith(expect.anything(), { userId: "owner", changes: { avatarKey: null } }); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("prevents both global and club administrators from changing connected photos", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "admin", isAdmin: true } });
    expect((await POST(request("POST"), params)).status).toBe(404); expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("allows a club administrator to edit an unclaimed placeholder", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "admin" } }); mocks.member.mockResolvedValue({ ...member, ownerUserId: null, player: { avatarKey: "old", clubMemberships: [{ ownerUserId: null, retiredByAdmissionEventId: null }] } });
    mocks.access.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
    expect((await DELETE(request(), params)).status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "player" }, data: { avatarKey: null } }); expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("rejects missing club context and revoked claim races", async () => {
    expect((await DELETE(request("DELETE", false), params)).status).toBe(400);
    mocks.member.mockResolvedValueOnce(member).mockResolvedValueOnce({ ...member, ownerUserId: null, ownershipRevision: 2, player: { avatarKey: "old", clubMemberships: [] } });
    mocks.access.mockResolvedValue({ role: "ADMIN", status: "ACTIVE" });
    expect((await POST(request("POST"), params)).status).toBe(409); expect(mocks.sync).not.toHaveBeenCalled(); expect(mocks.rollback).toHaveBeenCalled();
  });
});
