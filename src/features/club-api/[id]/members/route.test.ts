import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), members: vi.fn(), create: vi.fn(), membership: vi.fn(), adjustment: vi.fn(), roster: vi.fn(), rosterMember: vi.fn(), transaction: vi.fn(), logError: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: async () => null }));
vi.mock("@/lib/clubAdminPermissions", () => ({ getClubAdminAccess: mocks.access }));
vi.mock("@/lib/clubRoster", () => ({ getClubRoster: mocks.roster, getClubRosterMember: mocks.rosterMember }));
vi.mock("@/lib/prisma", () => ({ prisma: { clubMember: { findMany: mocks.members, create: mocks.membership }, player: { create: mocks.create }, clubRatingAdjustment: { create: mocks.adjustment }, $transaction: mocks.transaction } }));
vi.mock("@/lib/errors", () => ({ logError: mocks.logError, safeErrorResponse: () => Response.json({ error: "Internal server error" }, { status: 500 }) }));
import { prisma } from "@/lib/prisma";
import { POST } from "./route";
function create(body: unknown) { return POST(new Request("http://localhost/api/clubs/club/members", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "club" }) }); }
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "account-admin", name: "Admin" } });
  mocks.access.mockResolvedValue({ canAdmin: true }); mocks.members.mockResolvedValue([]);
  mocks.transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  mocks.create.mockResolvedValue({ id: "offline-player" }); mocks.membership.mockResolvedValue({ id: "member-1" });
  mocks.rosterMember.mockResolvedValue({ id: "offline-player", name: "Offline Player", elo: 1000 });
});
describe("offline roster creation", () => {
  it("creates a Player and ClubMember without an Account or permissions", async () => {
    expect((await create({ name: "Offline Player", gender: "FEMALE", mixedSideOverride: null, needsMoreRest: true })).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({ data: { name: "Offline Player", gender: "FEMALE" } });
    expect(mocks.membership).toHaveBeenCalledWith({ data: { clubId: "club", playerId: "offline-player", ownerUserId: null, mixedSideOverride: null, status: "CORE", preferredPool: "B", elo: 1000 } });
    expect(mocks.adjustment).not.toHaveBeenCalled();
  });
  it("initializes an explicit membership override from requested legacy preferences", async () => {
    expect((await create({ name: "Offline Player", gender: "FEMALE", partnerPreference: "OPEN" })).status).toBe(201);
    expect(mocks.membership).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ mixedSideOverride: "UPPER" }) }));
  });
  it.each(["email", "password", "ownerUserId"])("does not infer account ownership from %s", async field => {
    expect((await create({ name: "Offline Player", gender: "MALE", [field]: "unsafe" })).status).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("warns about a same-name existing Player without changing it", async () => {
    mocks.members.mockResolvedValue([{ playerId: "existing-player", player: { name: "Offline Player" } }]);
    const response = await create({ name: "Offline Player", gender: "MALE" });
    expect(response.status).toBe(409); expect(await response.json()).toMatchObject({ existingPlayerId: "existing-player" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("requires account administration", async () => {
    mocks.access.mockResolvedValue({ canAdmin: false });
    expect((await create({ name: "Offline Player", gender: "MALE" })).status).toBe(403);
  });
  it.each([0, 5000, 1432])("creates rating %i with its initial audit in the creation transaction", async initialRating => {
    const tx = { player: { create: mocks.create }, clubMember: { create: mocks.membership }, clubRatingAdjustment: { create: mocks.adjustment } };
    mocks.transaction.mockImplementation(async callback => {
      const result = await callback(tx);
      expect(mocks.rosterMember).toHaveBeenCalledWith(tx, "club", "offline-player");
      expect(mocks.adjustment).toHaveBeenCalledWith({ data: { memberId: "member-1", actorId: "account-admin", actorName: "Admin", beforeElo: 1000, afterElo: initialRating, reason: "Initial rating" } });
      return result;
    });
    mocks.rosterMember.mockResolvedValue({ id: "offline-player", elo: initialRating });
    const response = await create({ name: "Offline Player", gender: "MALE", initialRating });
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: "offline-player", elo: initialRating });
    expect(mocks.membership).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ elo: initialRating }) }));
    expect(mocks.roster).not.toHaveBeenCalled();
  });
  it("does not audit an explicitly default rating", async () => {
    expect((await create({ name: "Offline Player", gender: "MALE", initialRating: 1000 })).status).toBe(201);
    expect(mocks.adjustment).not.toHaveBeenCalled();
  });
  it.each([-1, 5001, 1.5, "1200", null, true])("rejects invalid initial rating %s before writing", async initialRating => {
    expect((await create({ name: "Offline Player", gender: "MALE", initialRating })).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("fails within the transaction when the response member cannot be read", async () => {
    mocks.rosterMember.mockResolvedValue(null);
    expect((await create({ name: "Offline Player", gender: "MALE" })).status).toBe(500);
    expect(mocks.roster).not.toHaveBeenCalled();
    await expect(mocks.transaction.mock.results[0].value).rejects.toThrow("response is unavailable");
  });
});
