import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionMode, SessionStatus } from "@/types/enums";
const state = vi.hoisted(() => ({
  auth: vi.fn(), reserve: vi.fn(), update: vi.fn(),
  accepted: ["a", "b"],
  session: { id: "s", clubId: "a", code: "ABC", ratingPolicyVersion: 2, status: "WAITING", mode: "MEXICANO", poolsEnabled: false, players: [] as Array<{ playerId: string; pool: string; matchesPlayed: number; matchmakingMatchesCredit: number; isPaused: boolean }> },
  members: [] as Array<{ clubId: string; playerId: string; ownerUserId: string | null; archivedAt: Date | null; retiredByAdmissionEventId: string | null; preferredPool: string; elo: number; club: { name: string }; player: { name: string; isActive: boolean } }>,
  accesses: [] as Array<{ clubId: string; userId: string; status: string; role: string }>,
  seats: [] as Array<{ playerId: string; profileClubId: string | null; participantAccountId: string | null; representingClubId: string | null; isGuest: boolean }>,
}));
vi.mock("@/lib/auth", () => ({ auth: state.auth }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: vi.fn(async () => null), checkInvalidTargetRateLimit: vi.fn(async () => null), invalidTargetResponse: vi.fn(async () => Response.json({ error: "Unauthorized" }, { status: 403 })) }));
vi.mock("../queue-match/shared", () => ({ tryRebuildAutomaticQueuedMatchForSessionId: vi.fn(async () => null) }));
vi.mock("@/lib/sessionCollab", () => ({
  getAcceptedSessionClubIds: async () => state.accepted,
  getSessionMembership: async () => state.accesses.find(a => a.userId === "actor" && a.status === "ACTIVE" && state.accepted.includes(a.clubId)) ?? null,
  getSessionOperatorMembership: async () => state.accesses.find(a => a.userId === "actor" && a.status === "ACTIVE" && ["OWNER", "ADMIN", "STAFF"].includes(a.role) && state.accepted.includes(a.clubId)) ?? null,
  getPlayerClubBadges: vi.fn(async () => new Map()), withPlayerClubBadges: (players: unknown) => players,
}));
vi.mock("@/lib/prisma", () => {
  const db = {
    $executeRaw: state.reserve,
    $transaction: async (operation: (tx: unknown) => unknown) => operation(db),
    session: { findUnique: async () => state.session, update: state.update },
    sessionPlayer: {
      findUnique: async ({ where }: { where: { sessionId_playerId: { playerId: string } } }) => state.seats.find(p => p.playerId === where.sessionId_playerId.playerId) ?? null,
      findMany: async ({ where }: { where: { playerId?: { in?: string[]; not?: string } } }) => state.seats.filter(p => !where.playerId || (!where.playerId.in || where.playerId.in.includes(p.playerId)) && p.playerId !== where.playerId.not),
    },
    clubAccess: {
      findUnique: async ({ where }: { where: { clubId_userId: { clubId: string; userId: string } } }) => state.accesses.find(a => a.clubId === where.clubId_userId.clubId && a.userId === where.clubId_userId.userId) ?? null,
      findMany: async ({ where }: { where: { userId: string; status: string; clubId?: { in: string[] }; role?: { in: string[] } } }) => state.accesses.filter(a => a.userId === where.userId && a.status === where.status && (!where.clubId || where.clubId.in.includes(a.clubId)) && (!where.role || where.role.in.includes(a.role))),
    },
    clubMember: {
      findMany: async ({ where }: { where: { ownerUserId?: string; playerId?: string; clubId?: string | { in: string[] }; archivedAt?: null; retiredByAdmissionEventId?: null } }) => state.members.filter(m => (!where.ownerUserId || m.ownerUserId === where.ownerUserId) && (!where.playerId || m.playerId === where.playerId) && (!where.clubId || (typeof where.clubId === "string" ? m.clubId === where.clubId : where.clubId.in.includes(m.clubId))) && (where.archivedAt === undefined || m.archivedAt === null) && m.retiredByAdmissionEventId === null && m.player.isActive),
      findUnique: async ({ where }: { where: { clubId_playerId: { clubId: string; playerId: string } } }) => state.members.find(m => m.clubId === where.clubId_playerId.clubId && m.playerId === where.clubId_playerId.playerId) ?? null,
    },
    player: { findUnique: async () => ({ gender: "FEMALE", partnerPreference: "OPEN", mixedSideOverride: "UPPER" }) },
  };
  return { prisma: db };
});
import { POST } from "./route";
function post(body: unknown = {}) { return POST(new Request("http://localhost/api/sessions/ABC/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ code: "ABC" }) }); }
function member(playerId: string, clubId: string, ownerUserId: string | null = "actor") {
  return { playerId, clubId, ownerUserId, archivedAt: null, retiredByAdmissionEventId: null, preferredPool: "B", elo: clubId === "a" ? 1400 : 800, club: { name: clubId }, player: { name: playerId, isActive: true } };
}
describe("join exact local club profile", () => {
  beforeEach(() => {
    state.auth.mockReset().mockResolvedValue({ user: { id: "actor", isAdmin: false } });
    state.reserve.mockReset().mockResolvedValue(0);
    state.update.mockReset().mockImplementation(async args => ({ ...state.session, courts: [], players: [{ ...args.data.players.create, player: { id: args.data.players.create.playerId, name: "Person", elo: 9999 } }] }));
    state.accepted = ["a", "b"];
    Object.assign(state.session, { ratingPolicyVersion: 2, status: SessionStatus.WAITING, mode: SessionMode.MEXICANO, poolsEnabled: false, players: [] });
    state.members = [member("pa", "a")]; state.seats = [];
    state.accesses = [{ clubId: "a", userId: "actor", status: "ACTIVE", role: "MEMBER" }, { clubId: "b", userId: "actor", status: "ACTIVE", role: "MEMBER" }];
  });
  it("auto-selects the only eligible local pair and snapshots the Account separately from Player", async () => {
    const response = await post(); expect(response.status).toBe(200);
    expect(state.update.mock.calls[0][0].data.players.create).toMatchObject({ playerId: "pa", profileClubId: "a", participantAccountId: "actor", isGuest: false });
    expect((await response.json()).players[0].player.elo).toBe(1400); expect(state.reserve).toHaveBeenCalledOnce();
  });
  it("requires a pair choice for two owned profiles and accepts the chosen partner in ordinary collaboration", async () => {
    state.members.push(member("pb", "b"));
    const ambiguous = await post(); expect(ambiguous.status).toBe(409); expect((await ambiguous.json()).error).toContain("Choose which club profile");
    const selected = await post({ playerId: "pb", profileClubId: "b" }); expect(selected.status).toBe(200);
    expect(state.update.mock.calls[0][0].data.players.create).toMatchObject({ playerId: "pb", profileClubId: "b", participantAccountId: "actor", representingClubId: null });
    expect((await selected.json()).players[0].player.elo).toBe(800);
  });
  it("requires club selection even when one legacy physical Player belongs to both clubs", async () => {
    state.members.push(member("pa", "b")); expect((await post({ playerId: "pa" })).status).toBe(409);
    expect((await post({ playerId: "pa", profileClubId: "b" })).status).toBe(200);
  });
  it("rejects revoked or archived local profiles while another club remains active", async () => {
    state.accesses[0].status = "REVOKED";
    expect((await post({ playerId: "pa", profileClubId: "a" })).status).toBe(409);
    state.accesses[0].status = "ACTIVE"; state.members[0].archivedAt = new Date();
    expect((await post({ playerId: "pa", profileClubId: "a" })).status).toBe(409); expect(state.update).not.toHaveBeenCalled();
  });
  it("allows staff to add an unclaimed local placeholder only in their exact operator club", async () => {
    state.accesses[0].role = "STAFF"; state.members.push(member("unclaimed", "a", null), member("other", "b", null));
    expect((await post({ playerId: "unclaimed", profileClubId: "a" })).status).toBe(200);
    expect(state.update.mock.calls[0][0].data.players.create.participantAccountId).toBeNull();
    expect((await post({ playerId: "other", profileClubId: "b" })).status).toBe(409);
  });
  it("rejects a second account seat and revalidates ownership after acquiring the writer", async () => {
    state.members.push(member("pb", "b")); state.seats.push({ playerId: "pb", profileClubId: "b", participantAccountId: "actor", representingClubId: null, isGuest: false });
    expect((await post({ playerId: "pa", profileClubId: "a" })).status).toBe(409); expect(state.update).not.toHaveBeenCalled();
    state.seats = []; state.reserve.mockImplementation(async () => { state.members[0].ownerUserId = null; return 0; });
    expect((await post({ playerId: "pa", profileClubId: "a" })).status).toBe(409); expect(state.update).not.toHaveBeenCalled();
  });
  it("cannot switch an existing entry to another club profile", async () => {
    state.members.push(member("pa", "b")); state.seats.push({ playerId: "pa", profileClubId: "a", participantAccountId: "actor", representingClubId: null, isGuest: false });
    expect((await post({ playerId: "pa", profileClubId: "b" })).status).toBe(409); expect(state.update).not.toHaveBeenCalled();
  });
  it.each([{ input: { mixedSideOverride: null }, expected: null }, { input: { mixedSideOverride: "UPPER" }, expected: "UPPER" }])("keeps mixed-side overrides when selecting a local profile: $expected", async ({ input, expected }) => {
    expect((await post(input)).status).toBe(200); expect(state.update.mock.calls[0][0].data.players.create).toMatchObject({ gender: "FEMALE", mixedSideOverride: expected });
  });
  it("keeps saved player group and arrival credit for active joins, and denies self group override", async () => {
    Object.assign(state.session, { status: SessionStatus.ACTIVE, poolsEnabled: true, players: [{ playerId: "waiting", pool: "B", matchesPlayed: 4, matchmakingMatchesCredit: 0, isPaused: false }] });
    expect((await post({ pool: "A" })).status).toBe(403);
    expect((await post()).status).toBe(200); expect(state.update.mock.calls[0][0].data.players.create).toMatchObject({ pool: "B", matchmakingMatchesCredit: 4, arrivalPriorityAt: expect.any(Date) });
  });
  it("rejects joining ended sessions and quick-access identities", async () => {
    state.session.status = SessionStatus.COMPLETED; expect((await post()).status).toBe(400);
    state.session.status = SessionStatus.WAITING; state.auth.mockResolvedValue({ user: { id: "guest:pa", isQuickAccess: true, guestPlayerId: "pa", quickAccessClubId: "a" } });
    expect((await post()).status).toBe(403); expect(state.update).not.toHaveBeenCalled();
  });
});
