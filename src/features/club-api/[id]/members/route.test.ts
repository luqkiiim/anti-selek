import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), members: vi.fn(), create: vi.fn(), membership: vi.fn(), roster: vi.fn(), transaction: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: async () => null }));
vi.mock("@/lib/clubAdminPermissions", () => ({ getClubAdminAccess: mocks.access }));
vi.mock("@/lib/clubRoster", () => ({ getClubRoster: mocks.roster }));
vi.mock("@/lib/prisma", () => ({ prisma: { clubMember: { findMany: mocks.members, create: mocks.membership }, player: { create: mocks.create }, $transaction: mocks.transaction } }));
import { prisma } from "@/lib/prisma";
import { POST } from "./route";
function create(body: unknown) { return POST(new Request("http://localhost/api/clubs/club/members", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: "club" }) }); }
beforeEach(() => {
  vi.resetAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "account-admin" } });
  mocks.access.mockResolvedValue({ canAdmin: true }); mocks.members.mockResolvedValue([]);
  mocks.transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
  mocks.create.mockResolvedValue({ id: "offline-player" }); mocks.roster.mockResolvedValue([{ id: "offline-player", name: "Offline Player" }]);
});
describe("offline roster creation", () => {
  it("creates a Player and ClubMember without an Account or permissions", async () => {
    expect((await create({ name: "Offline Player", gender: "FEMALE", mixedSideOverride: null, needsMoreRest: true })).status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({ data: { name: "Offline Player", gender: "FEMALE", partnerPreference: "FEMALE_FLEX", mixedSideOverride: null } });
    expect(mocks.membership).toHaveBeenCalledWith({ data: { clubId: "club", playerId: "offline-player", ownerUserId: null, status: "CORE", preferredPool: "B" } });
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
});
