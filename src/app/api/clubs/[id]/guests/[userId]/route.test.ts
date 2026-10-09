import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), playerFindFirst: vi.fn(), findFirst: vi.fn(), upsert: vi.fn(), quick: vi.fn(), matches: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/clubAdminPermissions", () => ({ getClubAdminAccess: mocks.access }));
vi.mock("@/lib/quickAccess", () => ({ isQuickAccessSession: mocks.quick }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: vi.fn(async () => null) }));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn({ player: { findFirst: mocks.playerFindFirst }, match: { findMany: mocks.matches }, sessionPlayer: { findFirst: mocks.findFirst }, clubMember: { upsert: mocks.upsert } }) } }));
import { POST } from "./route";
const call = () => POST(new Request("http://localhost/api/clubs/club/guests/player-guest", { method: "POST" }), { params: Promise.resolve({ id: "club", userId: "player-guest" }) });
describe("add a guest to the club", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "account-admin" } });
    mocks.quick.mockReturnValue(false);
    mocks.matches.mockResolvedValue([]);
    mocks.playerFindFirst.mockResolvedValue({ id: "player-guest" });
    mocks.access.mockResolvedValue({ canAdmin: true });
    mocks.findFirst.mockResolvedValue({ player: { elo: 1150 } });
    mocks.upsert.mockResolvedValue({ playerId: "player-guest" });
  });
  it("adds only the selected identity, preserving its starting rating and past records", async () => {
    expect((await call()).status).toBe(200);
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ playerId: "player-guest", isGuest: true, session: expect.objectContaining({ isTest: false, status: "COMPLETED" }) }), select: { player: { select: { elo: true } } } }));
    expect(mocks.upsert).toHaveBeenCalledWith({ where: { clubId_playerId: { clubId: "club", playerId: "player-guest" } }, update: {}, create: { clubId: "club", playerId: "player-guest", status: "OCCASIONAL", elo: 1150 }, select: { playerId: true } });
  });
  it("is safe to repeat without resetting existing membership or rating", async () => {
    await call(); await call();
    expect(mocks.upsert.mock.calls.every(([args]) => Object.keys(args.update).length === 0)).toBe(true);
  });
  it("rejects someone without a qualifying guest appearance", async () => {
    mocks.findFirst.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("rejects a retired Player before looking up or creating a guest membership", async () => {
    mocks.playerFindFirst.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(mocks.playerFindFirst).toHaveBeenCalledWith({
      where: {
        id: "player-guest",
        clubMemberships: { none: { retiredByAdmissionEventId: { not: null } } },
      },
      select: { id: true },
    });
    expect(mocks.findFirst).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("rejects non-admins", async () => {
    mocks.access.mockResolvedValue({ canAdmin: false });
    expect((await call()).status).toBe(403);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
  it("rejects view-only access", async () => {
    mocks.quick.mockReturnValue(true);
    expect((await call()).status).toBe(403);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it("requires authentication", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
  });

  it('carries the earned guest rating into the new membership', async () => {
    mocks.matches.mockResolvedValue([{ team1Player1Id: 'player-guest', team1Player2Id: 'player-a', team2Player1Id: 'player-b', team2Player2Id: 'player-c', team1EloChange: 17, team2EloChange: -17 }]);
    expect((await call()).status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ playerId: 'player-guest', elo: 1167 }), update: {} }));
  });
});
