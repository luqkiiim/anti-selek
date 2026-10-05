import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), accountFind: vi.fn(), accountUpdate: vi.fn(), playerFind: vi.fn(), players: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: async () => null }));
vi.mock("@/lib/serverAudit", () => ({ logAuditEvent: mocks.audit }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.accountFind, update: mocks.accountUpdate }, player: { findUnique: mocks.playerFind, findMany: mocks.players } } }));
import { GET, PATCH } from "./route";
const account = { id: "account-new", name: "Account Name", email: "account@example.com", avatarKey: "https://blob.vercel-storage.com/account.jpg", gender: "MALE", isActive: true, selfNameChangedAt: null, selfGenderChangedAt: null, createdAt: new Date("2026-01-01") };
const request = () => new Request("http://localhost/api/user/me");
const patch = (body: unknown) => PATCH(new Request("http://localhost/api/user/me", { method: "PATCH", body: JSON.stringify(body) }));
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ user: { id: account.id } }); mocks.accountFind.mockResolvedValue(account);
  mocks.players.mockResolvedValue([{ id: "historical-player", name: "Historical Player", gender: "FEMALE", avatarKey: null, clubMemberships: [] }]);
  mocks.accountUpdate.mockImplementation(async ({ data }) => ({ ...account, ...data }));
});
describe("authenticated account settings are separate from Players", () => {
  it("returns the Account identity plus separately owned historical Players", async () => {
    const response = await GET(request()); const body = await response.json();
    expect(response.status).toBe(200); expect(body.user).toMatchObject({ id: "account-new", name: "Account Name", canRenameName: true, canChangeGender: true });
    expect(body.players).toMatchObject([{ id: "historical-player", name: "Historical Player", gender: "FEMALE" }]);
    expect(body.user).not.toHaveProperty("elo");
    expect(mocks.players).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerUserId: "account-new" } }));
  });
  it("changes an Account name once without editing its owned Player", async () => {
    expect((await patch({ name: "New Account Name" })).status).toBe(200);
    expect(mocks.accountUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "account-new", selfNameChangedAt: null }, data: { name: "New Account Name", selfNameChangedAt: expect.any(Date) } }));
    expect(mocks.players).not.toHaveBeenCalled(); expect(mocks.playerFind).not.toHaveBeenCalled();
  });
  it("keeps gender as an Account default without rewriting sporting Mixed settings", async () => {
    expect((await patch({ gender: "FEMALE" })).status).toBe(200);
    expect(mocks.accountUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: { gender: "FEMALE", selfGenderChangedAt: expect.any(Date) } }));
  });
  it("allows an idempotent unchanged name without consuming the rename", async () => {
    expect((await patch({ name: account.name })).status).toBe(200); expect(mocks.accountUpdate).not.toHaveBeenCalled();
  });
  it("blocks a second rename and a concurrent rename losing its CAS", async () => {
    mocks.accountFind.mockResolvedValue({ ...account, selfNameChangedAt: new Date() });
    expect((await patch({ name: "Again" })).status).toBe(409);
    mocks.accountFind.mockResolvedValue(account); mocks.accountUpdate.mockRejectedValue({ code: "P2025" });
    expect((await patch({ name: "Raced" })).status).toBe(409);
  });
  it.each([{ elo: 900 }, { ownerUserId: "other" }, { partnerPreference: "OPEN" }, { email: "other@example.com" }, { name: "---" }])("rejects invalid or sporting fields %j", async body => {
    expect((await patch(body)).status).toBe(400); expect(mocks.accountUpdate).not.toHaveBeenCalled();
  });
  it("requires authentication for reading accounts", async () => {
    mocks.auth.mockResolvedValue(null); expect((await GET(request())).status).toBe(401);
  });
});
describe("quick access uses a Player namespace", () => {
  beforeEach(() => { mocks.auth.mockResolvedValue({ user: { id: "guest:historical-player", guestPlayerId: "historical-player", isQuickAccess: true, quickAccessClubId: "club" } }); mocks.playerFind.mockResolvedValue({ id: "historical-player", name: "Offline Player", ownerUserId: null, isActive: true, avatarKey: null, gender: "FEMALE" }); });
  it("returns the explicit Player with safe club aliases", async () => {
    const response = await GET(request()); const body = await response.json(); expect(response.status).toBe(200);
    expect(body.user).toMatchObject({ id: "guest:historical-player", playerId: "historical-player", isQuickAccess: true, canRenameName: false, quickAccessClubId: "club", quickAccessCommunityId: "club" });
    expect(mocks.accountFind).not.toHaveBeenCalled();
  });
  it("invalidates a quick identity when the Player is claimed", async () => {
    mocks.playerFind.mockResolvedValue({ id: "historical-player", ownerUserId: "new-account", isActive: true }); expect((await GET(request())).status).toBe(401);
  });
  it("does not let a guest write account settings", async () => {
    expect((await patch({ name: "Nope" })).status).toBe(403); expect(mocks.accountUpdate).not.toHaveBeenCalled();
  });
});
