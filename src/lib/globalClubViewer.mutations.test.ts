import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const write = vi.fn(() => { throw new Error("Unauthorized browser reached a write"); });
  const model = () => ({ findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: write, createMany: write, update: write, updateMany: write, upsert: write, delete: write, deleteMany: write });
  return { auth: vi.fn(), write, db: { user: model(), club: model(), clubAccess: model(), clubMember: model(), player: model(), session: model(), sessionClub: model(), sessionPlayer: model(), match: model(), court: model(), queuedMatch: model(), clubNewsLike: model(), clubNotification: model(), clubAdmissionRequest: model(), playerInvitation: model(), $transaction: write } };
});
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("@/lib/rateLimit", () => ({ rateLimit: vi.fn(async () => null), checkInvalidTargetRateLimit: vi.fn(async () => null), invalidTargetResponse: vi.fn(async () => Response.json({ error: "Not authorized" }, { status: 403 })) }));
vi.mock("@/lib/serverAudit", () => ({ logAuditEvent: vi.fn() }));

const club = { id: "club-1", name: "Protected Club", createdById: "owner", isTutorial: false, isPasswordProtected: true, isAcceptingRequests: false };
const session = { id: "session-1", code: "ABC123", clubId: "club-1", status: "ACTIVE", isTest: false, club, type: "POINTS", mode: "MEXICANO", scoringType: "POINTS", collabFormat: "FREE_PLAY", pairingMode: "OPEN", poolAssignmentsInitialized: true, courts: [], players: [], matches: [], sessionClubs: [{ id: "link-1", clubId: "club-1", status: "ACCEPTED", role: "HOST", club }], queuedMatch: null };
const player = (id: string) => ({ id, name: id, ownerUserId: "different-account", elo: 1000 });
const match = { id: "match-1", sessionId: "session-1", courtId: "court-1", status: "IN_PROGRESS", team1Score: 11, team2Score: 9, team1Player1Id: "p1", team1Player2Id: "p2", team2Player1Id: "p3", team2Player2Id: "p4", team1Player1: player("p1"), team1Player2: player("p2"), team2Player1: player("p3"), team2Player2: player("p4"), session, createdAt: new Date("2026-01-01"), completedAt: new Date("2026-01-02") };

const cases = [
  { path: "@/features/club-api/[id]/route", method: "PATCH", body: { rules: "Altered" } },
  { path: "@/features/club-api/[id]/route", method: "DELETE", body: { confirmation: "DELETE" } },
  { path: "@/features/club-api/[id]/avatar/route", method: "POST", body: {} },
  { path: "@/features/club-api/[id]/avatar/route", method: "DELETE", body: {} },
  { path: "@/features/club-api/[id]/members/route", method: "POST", body: { name: "New Player" } },
  { path: "@/features/club-api/[id]/members/[userId]/route", method: "PATCH", body: { mixedSideOverride: "LOWER" } },
  { path: "@/features/club-api/[id]/members/[userId]/route", method: "DELETE", body: {} },
  { path: "@/features/club-api/[id]/news-likes/route", method: "POST", body: { newsItemId: "news-1", liked: true } },
  { path: "@/app/api/clubs/[id]/achievements/route", method: "PATCH", body: { seen: [] } },
  { path: "@/app/api/sessions/[code]/route", method: "PATCH", body: { autoQueueEnabled: false, respectPlayerRest: true } },
  { path: "@/app/api/sessions/[code]/start/route", method: "POST", body: {}, sessionStatus: "WAITING" },
  { path: "@/app/api/sessions/[code]/end/route", method: "POST", body: {} },
  { path: "@/app/api/sessions/[code]/reset/route", method: "POST", body: {} },
  { path: "@/app/api/sessions/[code]/delete/route", method: "DELETE", body: {} },
  { path: "@/app/api/sessions/[code]/rollback/route", method: "POST", body: {}, sessionStatus: "COMPLETED" },
  { path: "@/app/api/sessions/[code]/collab/route", method: "PATCH", body: { status: "ACCEPTED" } },
  { path: "@/app/api/sessions/[code]/join/route", method: "POST", body: { profileClubId: "club-1" } },
  { path: "@/app/api/sessions/[code]/guests/route", method: "POST", body: { name: "New Guest" } },
  { path: "@/app/api/sessions/[code]/pause-player/route", method: "POST", body: { playerId: "p1", isPaused: true } },
  { path: "@/app/api/sessions/[code]/courts/labels/route", method: "PATCH", body: { courts: [{ courtId: "court-1", label: "One" }] } },
  { path: "@/app/api/sessions/[code]/players/[userId]/route", method: "PATCH", body: { name: "Renamed Guest" } },
  { path: "@/app/api/sessions/[code]/players/[userId]/route", method: "DELETE", body: {} },
  { path: "@/app/api/sessions/[code]/players/[userId]/preferences/route", method: "PATCH", body: { mixedSideOverride: "LOWER" } },
  { path: "@/app/api/sessions/[code]/queue-match/route", method: "POST", body: {} },
  { path: "@/app/api/sessions/[code]/queue-match/route", method: "DELETE", body: {} },
  { path: "@/app/api/sessions/[code]/queue-match/assign/route", method: "POST", body: {} },
  { path: "@/app/api/sessions/[code]/generate-match/route", method: "POST", body: { courtId: "court-1" } },
  { path: "@/app/api/matches/[id]/score/route", method: "POST", body: { team1Score: 11, team2Score: 9 } },
  { path: "@/app/api/matches/[id]/approve/route", method: "POST", body: {}, matchStatus: "PENDING_APPROVAL" },
  { path: "@/app/api/matches/[id]/undo/route", method: "POST", body: {}, matchStatus: "COMPLETED" },
  { path: "@/app/api/matches/[id]/reopen/route", method: "POST", body: {}, matchStatus: "PENDING_APPROVAL" },
  { path: "@/app/api/matches/[id]/correction/route", method: "POST", body: { team1Score: 21, team2Score: 19 }, matchStatus: "COMPLETED" },
];

describe("unjoined global browsers cannot bypass mutation authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "browser", email: "h.luqman1998@gmail.com", isAdmin: false, isQuickAccess: false, canBrowseAllClubs: true } });
    for (const [name, model] of Object.entries(mocks.db)) {
      if (name === "$transaction") continue;
      const methods = model as { findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
      methods.findUnique.mockResolvedValue(null);
      methods.findFirst.mockResolvedValue(null);
      methods.findMany.mockResolvedValue([]);
      methods.count.mockResolvedValue(0);
    }
    mocks.db.club.findUnique.mockResolvedValue(club);
    mocks.db.clubMember.findUnique.mockResolvedValue({ id: "member-1", clubId: "club-1", playerId: "p1", ownerUserId: "different-account", archivedAt: null, retiredByAdmissionEventId: null, player: player("p1") });
    mocks.db.session.findUnique.mockResolvedValue(session);
    mocks.db.sessionClub.findMany.mockResolvedValue(session.sessionClubs);
    mocks.db.match.findUnique.mockResolvedValue(match);
    mocks.db.player.findUnique.mockResolvedValue(player("p1"));
  });
  it.each(cases)("denies $method $path before writes", async testcase => {
    mocks.db.session.findUnique.mockResolvedValue({ ...session, status: testcase.sessionStatus ?? "ACTIVE" });
    mocks.db.match.findUnique.mockResolvedValue({ ...match, status: testcase.matchStatus ?? "IN_PROGRESS" });
    const routes = await import(testcase.path);
    const id = testcase.path.includes("matches") ? "match-1" : "club-1";
    const response = await routes[testcase.method](new Request("http://localhost/api/target?view=global&clubId=club-1", { method: testcase.method, headers: { "content-type": "application/json" }, body: JSON.stringify(testcase.body) }), { params: Promise.resolve({ id, code: "ABC123", userId: "p1" }) });
    const body = await response.json();
    if (response.status !== 403) throw new Error(`${testcase.path}: ${response.status} ${JSON.stringify(body)}`);
    expect(response.status).toBe(403);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
