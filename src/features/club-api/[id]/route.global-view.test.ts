import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(), account: vi.fn(), club: vi.fn(), access: vi.fn(), membership: vi.fn(), rosterMembers: vi.fn(), rosterAccess: vi.fn(), sessions: vi.fn(), notificationCount: vi.fn(),
  write: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  user: { findUnique: mocks.account, create: mocks.write },
  club: { findUnique: mocks.club, update: mocks.write, delete: mocks.write },
  clubAccess: { findUnique: mocks.access, findMany: mocks.rosterAccess, create: mocks.write },
  clubMember: { findFirst: mocks.membership, findMany: mocks.rosterMembers, create: mocks.write },
  player: { create: mocks.write }, sessionPlayer: { create: mocks.write }, clubAdmissionRequest: { create: mocks.write },
  match: { findMany: vi.fn(async () => []) },
  clubNotification: { count: mocks.notificationCount, updateMany: mocks.write },
  clubNewsLike: { findMany: vi.fn(async () => []) },
  $transaction: mocks.write,
} }));
vi.mock("@/lib/offlineIdentities", () => ({ getClubStatUserResolver: vi.fn(async () => (id: string) => id), getOfflineIdentityInfoByUserId: vi.fn(async () => new Map()) }));
vi.mock("@/lib/profileClubRank", () => ({ buildClubLeaderboardRankMovements: vi.fn(() => new Map()) }));
vi.mock("@/lib/clubPulse", () => ({ buildClubPulse: vi.fn(() => ({ sessionNews: [] })), applyClubPulseNewsLikes: (pulse: unknown) => pulse }));
vi.mock("@/app/api/sessions/listSessionsService", () => ({ listSessionsForClub: mocks.sessions }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: vi.fn(async () => null), checkInvalidTargetRateLimit: vi.fn(async () => null), invalidTargetResponse: vi.fn(async () => Response.json({ error: "Not authorized" }, { status: 403 })) }));
import { GET, PATCH, DELETE } from "./route";
const params = Promise.resolve({ id: "club-1" });
const viewer = { user: { id: "viewer", isAdmin: false, canBrowseAllClubs: true, isQuickAccess: false } };
const club = { id: "club-1", name: "Closed Protected Club", createdById: "owner", isTutorial: false, isPasswordProtected: true, isAcceptingRequests: false, avatarKey: null, rules: "Rules", _count: { members: 0, sessions: 0 } };
function read(query = "?view=global") { return GET(new Request(`http://localhost/api/clubs/club-1${query}`), { params }); }
describe("explicit global club viewing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("GLOBAL_CLUB_VIEWER_EMAILS", "h.luqman1998@gmail.com");
    mocks.auth.mockResolvedValue(viewer);
    mocks.account.mockResolvedValue({ id: "viewer", email: "h.luqman1998@gmail.com", name: "Viewer", passwordHash: "hash", isActive: true });
    mocks.club.mockResolvedValue(club);
    mocks.access.mockResolvedValue(null);
    mocks.membership.mockResolvedValue(null);
    mocks.rosterMembers.mockResolvedValue([]);
    mocks.rosterAccess.mockResolvedValue([]);
    mocks.sessions.mockResolvedValue([]);
    mocks.notificationCount.mockResolvedValue(3);
  });
  afterEach(() => vi.unstubAllEnvs());
  it("reads protected and closed clubs without creating sporting identities or membership", async () => {
    const response = await read();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ club: { id: "club-1", readOnly: true, role: null, isPasswordProtected: true, viewerIsOwner: false }, viewer: { playerId: null, isAdmin: false }, notifications: { unreadCount: 0 } });
    expect(mocks.sessions).toHaveBeenCalledWith({ clubId: "club-1", viewerId: "viewer", viewerIsAdmin: false, globalViewerSession: viewer });
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.notificationCount).not.toHaveBeenCalled();
  });
  it("keeps explicit global viewing read-only for an actual owner and suppresses their Player identity", async () => {
    mocks.club.mockResolvedValue({ ...club, createdById: "viewer" });
    mocks.access.mockResolvedValue({ role: "OWNER", status: "ACTIVE" });
    mocks.membership.mockResolvedValue({ player: { id: "player-1", name: "Owner Player", elo: 1300, avatarKey: null }, elo: 1300 });
    expect((await (await read()).json())).toMatchObject({ club: { readOnly: true, role: null, viewerIsOwner: false }, viewer: { playerId: null, isAdmin: false } });
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("preserves normal owner permissions and identity outside global mode", async () => {
    mocks.club.mockResolvedValue({ ...club, createdById: "viewer" });
    mocks.access.mockResolvedValue({ role: "OWNER", status: "ACTIVE" });
    mocks.membership.mockResolvedValue({ player: { id: "player-1", name: "Owner Player", elo: 1300, avatarKey: null }, elo: 1300 });
    const response = await read("");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ club: { readOnly: false, role: "ADMIN", viewerIsOwner: true }, viewer: { playerId: "player-1" }, notifications: { unreadCount: 3 } });
  });
  it("agrees with the selected roster after a club-local save without changing a shared legacy Player in another club", async () => {
    const sharedPlayer = { id: "legacy-shared-player", name: "Player", gender: "FEMALE", partnerPreference: "FEMALE_FLEX", mixedSideOverride: "LOWER", avatarKey: null, elo: 1000 };
    const localMember = { id: "membership-local", clubId: "club-1", playerId: sharedPlayer.id, ownerUserId: "viewer", archivedAt: null, retiredByAdmissionEventId: null, mixedSideOverride: null as string | null, elo: 1200, status: "CORE", player: sharedPlayer };
    const otherMember = { ...localMember, id: "membership-other", clubId: "club-2", elo: 1400 };
    mocks.access.mockResolvedValue({ role: "MEMBER", status: "ACTIVE" });
    mocks.rosterAccess.mockResolvedValue([{ userId: "viewer", role: "MEMBER" }]);
    mocks.membership.mockImplementation(({ where }: { where: { clubId: string } }) => Promise.resolve(where.clubId === "club-1" ? localMember : otherMember));
    mocks.rosterMembers.mockImplementation(({ where }: { where: { clubId: string } }) => Promise.resolve([where.clubId === "club-1" ? localMember : otherMember]));
    mocks.club.mockImplementation(({ where }: { where: { id: string } }) => Promise.resolve({ ...club, id: where.id }));
    const before = await (await read("")).json();
    expect(before.viewer).toMatchObject({ partnerPreference: "FEMALE_FLEX", mixedSideOverride: null });
    // Model the persisted club-local save; the frozen shared Player is unchanged.
    localMember.mixedSideOverride = "UPPER";
    const after = await (await read("")).json();
    expect(after.viewer).toMatchObject({ playerId: sharedPlayer.id, partnerPreference: "OPEN", mixedSideOverride: "UPPER" });
    expect(after.clubMembers[0]).toMatchObject({ id: sharedPlayer.id, partnerPreference: after.viewer.partnerPreference, mixedSideOverride: after.viewer.mixedSideOverride });
    const other = await (await GET(new Request("http://localhost/api/clubs/club-2"), { params: Promise.resolve({ id: "club-2" }) })).json();
    expect(other.viewer).toMatchObject({ playerId: sharedPlayer.id, partnerPreference: "FEMALE_FLEX", mixedSideOverride: null });
    expect(other.clubMembers[0]).toMatchObject({ id: sharedPlayer.id, partnerPreference: "FEMALE_FLEX", mixedSideOverride: null });
    expect(sharedPlayer).toMatchObject({ partnerPreference: "FEMALE_FLEX", mixedSideOverride: "LOWER" });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("returns neutral viewer preferences in global mode even with a saved local override", async () => {
    mocks.access.mockResolvedValue({ role: "MEMBER", status: "ACTIVE" });
    mocks.membership.mockResolvedValue({ mixedSideOverride: "UPPER", player: { id: "player-1", name: "Player", gender: "FEMALE", partnerPreference: "FEMALE_FLEX", mixedSideOverride: "LOWER", avatarKey: null } });
    expect(await (await read()).json()).toMatchObject({ viewer: { playerId: null, gender: "UNSPECIFIED", partnerPreference: "OPEN", mixedSideOverride: null }, club: { readOnly: true, role: null } });
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it.each([{ ...viewer.user, canBrowseAllClubs: false }, { ...viewer.user, isQuickAccess: true, guestPlayerId: "player-1" }])("denies ordinary and quick-access accounts from global club reads", async user => {
    mocks.auth.mockResolvedValue({ user });
    expect((await read()).status).toBe(403);
    expect(mocks.sessions).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("does not grant unjoined access on the normal club route", async () => {
    expect((await read("")).status).toBe(403);
    expect(mocks.sessions).not.toHaveBeenCalled();
  });
  it.each(["PATCH", "DELETE"])("denies direct %s bypasses by an unjoined browsing account", async method => {
    const route = method === "PATCH" ? PATCH : DELETE;
    const response = await route(new Request("http://localhost/api/clubs/club-1?view=global", { method, body: JSON.stringify({ rules: "Changed", confirmation: "DELETE" }) }), { params });
    expect(response.status).toBe(403);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
