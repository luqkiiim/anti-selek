import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), accountFind: vi.fn(), members: vi.fn(), member: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: async () => null }));
vi.mock("@/lib/serverAudit", () => ({ logAuditEvent: vi.fn() }));
vi.mock("@/lib/clubAdmissions", () => ({ admissionTransaction: async (_db: unknown, fn: (tx: object) => unknown) => fn({}) }));
vi.mock("@/lib/accountProfileSync", async original => ({ ...await original<typeof import("@/lib/accountProfileSync")>(), syncAccountProfile: mocks.sync }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.accountFind, findUniqueOrThrow: mocks.accountFind }, clubMember: { findMany: mocks.members, findUnique: mocks.member } } }));
import { GET, PATCH } from "./route";
const account = { id: "account", name: "Account Name", email: "account@example.com", avatarKey: null, gender: "MALE", mixedSideOverride: null, isActive: true, selfNameChangedAt: null, selfGenderChangedAt: null };
const request = () => new Request("http://localhost/api/user/me");
const patch = (body: unknown) => PATCH(new Request("http://localhost/api/user/me", { method: "PATCH", body: JSON.stringify(body) }));
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ user: { id: account.id } }); mocks.accountFind.mockResolvedValue(account);
  mocks.members.mockResolvedValue(["a", "b"].map(clubId => ({ id: `member-${clubId}`, playerId: "shared", clubId, status: clubId === "b" ? "ARCHIVED" : "ACTIVE", club: { name: clubId }, player: { id: "shared", name: "Name", avatarKey: null, gender: "MALE" } })));
  mocks.sync.mockResolvedValue({ account, playerIds: ["shared"] });
});
describe("account profile settings", () => {
  it("preserves unique players compatibility but exposes only owned club contexts", async () => {
    const response = await GET(request()); const body = await response.json();
    expect(response.status).toBe(200); expect(body.players).toHaveLength(1); expect(body.players[0].clubMemberships).toHaveLength(2);
    expect(body.clubProfiles).toMatchObject([{ memberId: "member-a", clubId: "a", playerId: "shared", status: "ACTIVE" }, { memberId: "member-b", clubId: "b", status: "ARCHIVED" }]);
    expect(mocks.members).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerUserId: "account", retiredByAdmissionEventId: null }) }));
  });
  it("sends canonical owner edits through the transactional shared service", async () => {
    expect((await patch({ name: "Updated" })).status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith({}, expect.objectContaining({ userId: "account", changes: expect.objectContaining({ name: "Updated" }) }));
  });
  it.each([{ mixedSideOverride: "LOWER" }, { clubPreferences: { clubId: "a", playerId: "shared" } }, { elo: 900 }, { ownerUserId: "other" }, { email: "bad" }, {}])("rejects unsupported settings %j", async body => {
    expect((await patch(body)).status).toBe(400); expect(mocks.sync).not.toHaveBeenCalled();
  });
  it("accepts preference-only and combined identity saves with exact club context", async () => {
    const clubPreferences = { clubId: "a", playerId: "shared", mixedSideOverride: "LOWER" };
    expect((await patch({ clubPreferences })).status).toBe(200);
    expect(mocks.sync).toHaveBeenLastCalledWith({}, expect.objectContaining({ userId: "account", clubPreferences, changes: { name: undefined, gender: undefined } }));
    expect((await patch({ name: "New name", gender: "FEMALE", clubPreferences: { ...clubPreferences, mixedSideOverride: null } })).status).toBe(200);
    expect(mocks.sync).toHaveBeenLastCalledWith({}, expect.objectContaining({ changes: { name: "New name", gender: "FEMALE" }, clubPreferences: { ...clubPreferences, mixedSideOverride: null } }));
  });
  it("authenticates quick access against the exact local membership", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "guest:shared", guestPlayerId: "shared", isQuickAccess: true, quickAccessClubId: "a" } });
    mocks.member.mockResolvedValue({ ownerUserId: null, status: "ACTIVE", retiredByAdmissionEventId: null, player: { id: "shared", name: "Name", avatarKey: null, gender: "MALE", ownerUserId: "global-provenance", isActive: true } });
    expect((await GET(request())).status).toBe(200);
    expect(mocks.member).toHaveBeenCalledWith(expect.objectContaining({ where: { clubId_playerId: { clubId: "a", playerId: "shared" } } }));
    mocks.member.mockResolvedValue({ ownerUserId: "claimed", status: "ACTIVE", player: { isActive: true } });
    expect((await GET(request())).status).toBe(401);
    expect((await patch({ name: "Nope" })).status).toBe(403);
  });
});
