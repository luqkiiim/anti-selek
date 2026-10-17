import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type MockedFunction } from "vitest";
import { MatchStatus, PlayerGender, SessionMode, SessionStatus, SessionType } from "@/types/enums";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/rateLimit", () => ({
  rateLimit: vi.fn(async () => null),
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(async () => Response.json({ error: "Unauthorized" }, { status: 403 })),
}));
vi.mock("../../_lib/reconcileSessionQueue", () => ({
  reconcileSessionQueueAfterCourtChange: vi.fn(async () => ({ autoAssignedMatch: null, queuedMatchCleared: false, queuedMatch: null })),
}));

type PrismaInstance = typeof import("@/lib/prisma")["prisma"];
type ScoreHandler = typeof import("./route")["POST"];
type ApproveHandler = typeof import("../approve/route")["POST"];
const tempDatabaseFile = path.resolve(process.cwd(), "prisma", `score-route-${randomUUID()}.db`);
const tempDatabaseUrl = `file:${tempDatabaseFile.replace(/\\/g, "/")}`;
const mutableEnv = process.env as Record<string, string | undefined>;
const previousEnv = {
  DATABASE_URL: mutableEnv.DATABASE_URL,
  TURSO_DATABASE_URL: mutableEnv.TURSO_DATABASE_URL,
  TURSO_AUTH_TOKEN: mutableEnv.TURSO_AUTH_TOKEN,
  NODE_ENV: mutableEnv.NODE_ENV,
};
let prisma: PrismaInstance;
let POSTScore: ScoreHandler;
let POSTApprove: ApproveHandler;
let mockedAuth: MockedFunction<typeof import("@/lib/auth")["auth"]>;
const matchId = "score-integration-match";
const sessionId = "score-integration-session";
const courtId = "score-integration-court";
const playerIds = ["player-cross-club", "player-a2", "player-a3", "player-b2"];
const accountIds = ["account-cross-club", "account-a2", "account-a3", "account-b2"];
const clubAId = "score-integration-club-a";
const clubBId = "score-integration-club-b";

async function removeDatabaseFiles() {
  await Promise.all(["", "-journal", "-shm", "-wal"].map((suffix) => fs.rm(`${tempDatabaseFile}${suffix}`, { force: true })));
}

function routeContext(id: string) { return { params: Promise.resolve({ id }) }; }
async function postScore(id = matchId) {
  return POSTScore(new Request(`http://localhost/api/matches/${id}/score`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ team1Score: 15, team2Score: 14 }),
  }), routeContext(id));
}
async function postApproval(id = matchId) {
  return POSTApprove(new Request(`http://localhost/api/matches/${id}/approve`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
  }), routeContext(id));
}

beforeAll(async () => {
  mutableEnv.DATABASE_URL = tempDatabaseUrl;
  mutableEnv.TURSO_DATABASE_URL = "";
  mutableEnv.TURSO_AUTH_TOKEN = "";
  mutableEnv.NODE_ENV = "test";
  await removeDatabaseFiles();
  await fs.writeFile(tempDatabaseFile, "");
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { cwd: process.cwd(), env: process.env as NodeJS.ProcessEnv, stdio: "pipe" });
  vi.resetModules();
  (globalThis as { prisma?: PrismaInstance }).prisma = undefined;
  mockedAuth = vi.mocked((await import("@/lib/auth")).auth);
  prisma = (await import("@/lib/prisma")).prisma;
  POSTScore = (await import("./route")).POST;
  POSTApprove = (await import("../approve/route")).POST;
});

beforeEach(() => { vi.clearAllMocks(); });

afterAll(async () => {
  await prisma?.$disconnect();
  (globalThis as { prisma?: PrismaInstance }).prisma = undefined;
  mutableEnv.DATABASE_URL = previousEnv.DATABASE_URL;
  mutableEnv.TURSO_DATABASE_URL = previousEnv.TURSO_DATABASE_URL;
  mutableEnv.TURSO_AUTH_TOKEN = previousEnv.TURSO_AUTH_TOKEN;
  mutableEnv.NODE_ENV = previousEnv.NODE_ENV;
  await removeDatabaseFiles();
});

describe("score and approval identity integration", () => {
  it("requires active access to the represented club for owned participants while keeping actor and Player IDs separate", async () => {
    const allAccounts = [...accountIds, "player-cross-club", "score-admin"];
    await prisma.user.createMany({
      data: allAccounts.map((id) => ({ id, email: `${id}@example.test`, passwordHash: "test-hash", name: id })),
    });
    await prisma.club.createMany({
      data: [
        { id: clubAId, name: clubAId, createdById: accountIds[0] },
        { id: clubBId, name: clubBId, createdById: accountIds[0] },
      ],
    });
    await prisma.player.createMany({
      data: playerIds.map((id, index) => ({
        id, name: id, ownerUserId: accountIds[index], gender: PlayerGender.MALE, elo: 1000,
      })),
    });
    await prisma.clubMember.createMany({
      data: [
        { clubId: clubAId, playerId: playerIds[0] },
        { clubId: clubBId, playerId: playerIds[0] },
        { clubId: clubAId, playerId: playerIds[1] },
        { clubId: clubAId, playerId: playerIds[2] },
        { clubId: clubBId, playerId: playerIds[3] },
      ],
    });
    await prisma.clubAccess.createMany({
      data: [
        { clubId: clubAId, userId: accountIds[0], role: "MEMBER", status: "ACTIVE" },
        { clubId: clubAId, userId: accountIds[1], role: "MEMBER", status: "ACTIVE" },
        { clubId: clubAId, userId: accountIds[2], role: "MEMBER", status: "ACTIVE" },
        { clubId: clubBId, userId: accountIds[3], role: "MEMBER", status: "ACTIVE" },
      ],
    });
    await prisma.clubAccess.createMany({ data: [clubAId, clubBId].map(clubId => ({ clubId, userId: "score-admin", role: "ADMIN" })) });
    const { clubOwnershipTransaction, claimClubPlayer } = await import("@/lib/clubPlayerOwnership");
    for (const [clubId, playerId, userId] of [[clubAId, playerIds[0], accountIds[0]], [clubBId, playerIds[0], accountIds[0]], [clubAId, playerIds[1], accountIds[1]], [clubAId, playerIds[2], accountIds[2]], [clubBId, playerIds[3], accountIds[3]]]) {
      await clubOwnershipTransaction(prisma, tx => claimClubPlayer(tx, { clubId, playerId, userId, actorUserId: "score-admin" }));
    }
    await prisma.clubAccess.update({ where: { clubId_userId: { clubId: clubBId, userId: accountIds[0] } }, data: { status: "REVOKED" } });
    await prisma.session.create({
      data: {
        id: sessionId,
        code: "score-integration-code",
        name: "Score identity integration",
        clubId: null,
        collabFormat: "INTERCLUB",
        type: SessionType.POINTS,
        mode: SessionMode.MEXICANO,
        status: SessionStatus.ACTIVE,
        sessionClubs: {
          create: [
            { id: "score-session-club-a", clubId: clubAId, role: "HOST", status: "ACCEPTED" },
            { id: "score-session-club-b", clubId: clubBId, role: "PARTNER", status: "ACCEPTED" },
          ],
        },
        players: {
          create: [
            { playerId: playerIds[0], isGuest: false, representingClubId: clubBId },
            { playerId: playerIds[1], isGuest: false, representingClubId: clubAId },
            { playerId: playerIds[2], isGuest: false, representingClubId: clubAId },
            { playerId: playerIds[3], isGuest: false, representingClubId: clubBId },
          ],
        },
        courts: { create: [{ id: courtId, courtNumber: 1 }] },
      },
    });
    await prisma.match.create({
      data: {
        id: matchId, sessionId, courtId,
        status: MatchStatus.IN_PROGRESS,
        team1Player1Id: playerIds[1], team1Player2Id: playerIds[2],
        team1ClubId: clubAId,
        team2Player1Id: playerIds[0], team2Player2Id: playerIds[3],
        team2ClubId: clubBId,
      },
    });
    await prisma.court.update({ where: { id: courtId }, data: { currentMatchId: matchId } });

    // This separate Account deliberately has the same string ID as a Player.
    // It owns no participating Player, so the route must not infer participation.
    mockedAuth.mockResolvedValue({ user: { id: "player-cross-club", isAdmin: false } } as never);
    const equalStringAttempt = await postScore();
    expect(equalStringAttempt.status).toBe(403);
    const unchangedAfterCollision = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(unchangedAfterCollision).toMatchObject({ status: MatchStatus.IN_PROGRESS, team1Score: null, team2Score: null });

    // The Account has active access to Club A and owns a Player represented for Club B,
    // but that Player ownership and Club A access cannot authorize a Club B match.
    mockedAuth.mockResolvedValue({ user: { id: "account-cross-club", isAdmin: false } } as never);
    const noClubBAccess = await postScore();
    expect(noClubBAccess.status).toBe(403);
    const unchangedAfterMissingAccess = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(unchangedAfterMissingAccess).toMatchObject({
      status: MatchStatus.IN_PROGRESS,
      team1Score: null,
      team2Score: null,
      scoreSubmittedByUserId: null,
      scoreSubmittedByPlayerId: null,
    });
    expect(await prisma.matchEloAdjustment.count({ where: { matchId } })).toBe(0);

    await prisma.clubAccess.update({ where: { clubId_userId: { clubId: clubBId, userId: accountIds[0] } }, data: { status: "REVOKED" } });
    const revokedClubBAccess = await postScore();
    expect(revokedClubBAccess.status).toBe(403);
    const unchangedAfterRevokedAccess = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(unchangedAfterRevokedAccess).toMatchObject({
      status: MatchStatus.IN_PROGRESS,
      team1Score: null,
      team2Score: null,
      scoreSubmittedByUserId: null,
      scoreSubmittedByPlayerId: null,
    });
    expect(await prisma.matchEloAdjustment.count({ where: { matchId } })).toBe(0);

    await prisma.clubAccess.update({
      where: { clubId_userId: { clubId: clubBId, userId: accountIds[0] } },
      data: { status: "ACTIVE" },
    });
    const submitResponse = await postScore();
    expect(submitResponse.status).toBe(200);
    const pending = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(pending).toMatchObject({
      status: MatchStatus.PENDING_APPROVAL,
      team1Score: 15,
      team2Score: 14,
      scoreSubmittedByUserId: accountIds[0],
      scoreSubmittedByPlayerId: playerIds[0],
    });

    // The submitter account cannot self-approve even though its Player ID differs.
    const selfApproval = await postApproval();
    expect(selfApproval.status).toBe(403);
    expect((await prisma.match.findUniqueOrThrow({ where: { id: matchId } })).status).toBe(MatchStatus.PENDING_APPROVAL);

    // An owned opponent with active access to its represented Club A can approve.
    mockedAuth.mockResolvedValue({ user: { id: accountIds[1], isAdmin: false } } as never);
    const approval = await postApproval();
    expect(approval.status).toBe(200);
    const completed = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(completed).toMatchObject({
      status: MatchStatus.COMPLETED,
      winnerTeam: 1,
      scoreSubmittedByUserId: accountIds[0],
      scoreSubmittedByPlayerId: playerIds[0],
    });

    const approvalMatchId = "score-integration-approval-match";
    const approvalCourtId = "score-integration-approval-court";
    await prisma.court.create({ data: { id: approvalCourtId, sessionId, courtNumber: 2 } });
    await prisma.match.create({
      data: {
        id: approvalMatchId,
        sessionId,
        courtId: approvalCourtId,
        status: MatchStatus.PENDING_APPROVAL,
        team1Player1Id: playerIds[1],
        team1Player2Id: playerIds[2],
        team1ClubId: clubAId,
        team2Player1Id: playerIds[0],
        team2Player2Id: playerIds[3],
        team2ClubId: clubBId,
        team1Score: 15,
        team2Score: 14,
        winnerTeam: 1,
        completedAt: new Date(),
        scoreSubmittedByUserId: accountIds[1],
        scoreSubmittedByPlayerId: playerIds[1],
      },
    });
    await prisma.court.update({
      where: { id: approvalCourtId },
      data: { currentMatchId: approvalMatchId },
    });

    // Approval has the same represented-club authorization requirement as score entry.
    await prisma.clubAccess.update({
      where: { clubId_userId: { clubId: clubBId, userId: accountIds[0] } },
      data: { status: "REVOKED" },
    });
    mockedAuth.mockResolvedValue({ user: { id: accountIds[0], isAdmin: false } } as never);
    const deniedApproval = await postApproval(approvalMatchId);
    expect(deniedApproval.status).toBe(403);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: approvalMatchId } })).toMatchObject({
      status: MatchStatus.PENDING_APPROVAL,
      scoreSubmittedByUserId: accountIds[1],
      scoreSubmittedByPlayerId: playerIds[1],
    });
    expect(await prisma.matchEloAdjustment.count({ where: { matchId: approvalMatchId } })).toBe(0);

    await prisma.clubAccess.update({
      where: { clubId_userId: { clubId: clubBId, userId: accountIds[0] } },
      data: { status: "ACTIVE" },
    });
    const authorizedApproval = await postApproval(approvalMatchId);
    expect(authorizedApproval.status).toBe(200);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: approvalMatchId } })).toMatchObject({
      status: MatchStatus.COMPLETED,
      scoreSubmittedByUserId: accountIds[1],
      scoreSubmittedByPlayerId: playerIds[1],
    });
  });

  it("denies ambiguous context in a clubless legacy session without borrowing global ownership", async () => {
    const legacySessionId = "score-integration-legacy-session";
    const legacyCourtId = "score-integration-legacy-court";
    const legacyMatchId = "score-integration-legacy-match";
    await prisma.session.create({
      data: {
        id: legacySessionId,
        code: "score-integration-legacy-code",
        name: "Legacy clubless session",
        type: SessionType.POINTS,
        mode: SessionMode.MEXICANO,
        status: SessionStatus.ACTIVE,
        players: { create: playerIds.map((playerId) => ({ playerId, isGuest: false })) },
        courts: { create: [{ id: legacyCourtId, courtNumber: 1 }] },
      },
    });
    await prisma.match.create({
      data: {
        id: legacyMatchId,
        sessionId: legacySessionId,
        courtId: legacyCourtId,
        status: MatchStatus.IN_PROGRESS,
        team1Player1Id: playerIds[0],
        team1Player2Id: playerIds[1],
        team2Player1Id: playerIds[2],
        team2Player2Id: playerIds[3],
      },
    });
    await prisma.court.update({
      where: { id: legacyCourtId },
      data: { currentMatchId: legacyMatchId },
    });

    mockedAuth.mockResolvedValue({ user: { id: accountIds[0], isAdmin: false } } as never);
    const response = await postScore(legacyMatchId);

    expect(response.status).toBe(403);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: legacyMatchId } })).toMatchObject({ status: MatchStatus.IN_PROGRESS, scoreSubmittedByUserId: null, scoreSubmittedByPlayerId: null });

  });
  it("supports an explicit exact profile in a clubless legacy session without adding club rating effects", async () => {
    const localSession = "legacy-explicit-session"; const localCourt = "legacy-explicit-court"; const localMatch = "legacy-explicit-match";
    await prisma.session.create({ data: { id: localSession, code: localSession, name: "Legacy exact pair", status: SessionStatus.ACTIVE, players: { create: playerIds.map((playerId, i) => ({ playerId, profileClubId: i === 0 || i === 3 ? clubBId : clubAId, participantAccountId: accountIds[i] })) }, courts: { create: { id: localCourt, courtNumber: 1 } } } });
    await prisma.match.create({ data: { id: localMatch, sessionId: localSession, courtId: localCourt, status: MatchStatus.IN_PROGRESS, team1Player1Id: playerIds[0], team1Player2Id: playerIds[1], team2Player1Id: playerIds[2], team2Player2Id: playerIds[3] } });
    await prisma.court.update({ where: { id: localCourt }, data: { currentMatchId: localMatch } });
    const localRatings = await prisma.clubMember.findMany({ orderBy: { id: "asc" }, select: { id: true, elo: true } });
    mockedAuth.mockResolvedValue({ user: { id: accountIds[0], isAdmin: false } } as never);
    expect((await postScore(localMatch)).status).toBe(200);
    mockedAuth.mockResolvedValue({ user: { id: accountIds[2], isAdmin: false } } as never);
    expect((await postApproval(localMatch)).status).toBe(200);
    expect(await prisma.matchEloAdjustment.count({ where: { matchId: localMatch } })).toBe(0);
    expect(await prisma.clubMember.findMany({ orderBy: { id: "asc" }, select: { id: true, elo: true } })).toEqual(localRatings);
  });

});

describe("club collaboration series scoring", () => {
  it.each(["RATED", "UNRATED"])("preserves %s policy through draft, final, correction, undo and reset reversal", async (ratingMode) => {
    const prefix = `series-${ratingMode.toLowerCase()}`;
    const seriesSessionId = `${prefix}-session`, seriesCourtId = `${prefix}-court`, seriesMatchId = `${prefix}-match`;
    const selectedClubs = [clubBId, clubAId, clubAId, null];
    await prisma.session.create({ data: {
      id: seriesSessionId, code: prefix, name: prefix, clubId: clubAId, status: "ACTIVE", type: "POINTS", mode: "MEXICANO", collaborationVersion: 2, ratingPolicyVersion: 2, ratingMode, scoringFormat: "BEST_OF_THREE", collabFormat: "INTERCLUB",
      sessionClubs: { create: [{ clubId: clubAId, role: "HOST", status: "ACCEPTED" }, { clubId: clubBId, role: "PARTNER", status: "ACCEPTED" }] },
      courts: { create: { id: seriesCourtId, courtNumber: 1 } },
    } });
    await prisma.sessionPlayer.createMany({ data: playerIds.map((playerId, index) => ({ sessionId: seriesSessionId, playerId, profileClubId: selectedClubs[index], participantAccountId: index === 3 ? null : accountIds[index], representingClubId: index === 0 || index === 3 ? clubBId : clubAId, isGuest: index === 3 })) });
    const makeMatch = async (id: string) => {
      await prisma.match.create({ data: { id, sessionId: seriesSessionId, courtId: seriesCourtId, scoringFormat: "BEST_OF_THREE", status: "IN_PROGRESS", team1ClubId: clubAId, team2ClubId: clubBId, team1Player1Id: playerIds[1], team1Player2Id: playerIds[2], team2Player1Id: playerIds[0], team2Player2Id: playerIds[3] } });
      await prisma.court.update({ where: { id: seriesCourtId }, data: { currentMatchId: id } });
    };
    const submit = async (body: Record<string, unknown>, id = seriesMatchId) => POSTScore(new Request(`http://localhost/api/matches/${id}/score`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), routeContext(id));
    const memberships = () => prisma.clubMember.findMany({ where: { OR: playerIds.slice(0,3).map((playerId, index) => ({ playerId, clubId: selectedClubs[index]! })) }, orderBy: [{ clubId: "asc" }, { playerId: "asc" }], select: { id: true, elo: true } });
    const before = await memberships();
    const { getGuestRating } = await import("@/lib/guestRating");
    const guestBefore = await getGuestRating(prisma as never, playerIds[3], 1000);
    mockedAuth.mockResolvedValue({ user: { id: "score-admin", isAdmin: true } } as never);
    await makeMatch(seriesMatchId);
    const gameScores = [{ team1Score: 21, team2Score: 19 }, { team1Score: 1, team2Score: 21 }, { team1Score: 21, team2Score: 19 }];
    expect((await submit({ gameScores, finalize: false })).status).toBe(409);
    const draft = await submit({ gameScores: gameScores.slice(0,1), finalize: false, scoreRevision: 0 });
    expect(draft.status).toBe(200);
    expect(await prisma.match.findUniqueOrThrow({ where: { id: seriesMatchId } })).toMatchObject({ status: "IN_PROGRESS", winnerTeam: null, scoreRevision: 1, team1EloChange: null });
    expect(await prisma.session.findUniqueOrThrow({ where: { id: seriesSessionId } })).toMatchObject({ resultsRevision: 1 });
    expect(await prisma.matchEloAdjustment.count({ where: { matchId: seriesMatchId } })).toBe(0);
    expect((await submit({ gameScores, scoreRevision: 0 })).status).toBe(409);
    expect((await submit({ gameScores: gameScores.slice(0,1), scoreRevision: 1 })).status).toBe(400);
    const finalResponse = await submit({ gameScores, scoreRevision: 1 });
    expect(finalResponse.status).toBe(200);
    const completed = await prisma.match.findUniqueOrThrow({ where: { id: seriesMatchId } });
    expect(completed).toMatchObject({ status: "COMPLETED", winnerTeam: 1, team1Score: 43, team2Score: 59, scoreRevision: 2, gameScoresJson: JSON.stringify(gameScores) });
    const seats = await prisma.sessionPlayer.findMany({ where: { sessionId: seriesSessionId }, orderBy: { playerId: "asc" } });
    expect(seats.every(seat => seat.matchesPlayed === 1)).toBe(true);
    expect(seats.filter(seat => [playerIds[1],playerIds[2]].includes(seat.playerId)).every(seat => seat.sessionPoints === 3)).toBe(true);
    expect(await prisma.matchEloAdjustment.count({ where: { matchId: seriesMatchId } })).toBe(ratingMode === "RATED" ? 3 : 0);
    if (ratingMode === "UNRATED") {
      expect(completed).toMatchObject({ team1EloChange: null, team2EloChange: null });
      expect(await memberships()).toEqual(before);
      expect(await getGuestRating(prisma as never, playerIds[3], 1000)).toBe(guestBefore);
    }
    const { correctCompletedMatchScore, undoCompletedMatchResult } = await import("@/lib/matchCompletion");
    const reversedGames = [{ team1Score: 1, team2Score: 21 }, { team1Score: 21, team2Score: 19 }, { team1Score: 19, team2Score: 21 }];
    await correctCompletedMatchScore({ matchId: seriesMatchId, finalTeam1Score: 41, finalTeam2Score: 61, finalGameScores: reversedGames, expectedScoreRevision: 2 });
    expect(await prisma.match.findUniqueOrThrow({ where: { id: seriesMatchId } })).toMatchObject({ winnerTeam: 2, gameScoresJson: JSON.stringify(reversedGames), scoreRevision: 3 });
    expect(await prisma.session.findUniqueOrThrow({ where: { id: seriesSessionId } })).toMatchObject({ resultsRevision: 3 });
    await undoCompletedMatchResult({ matchId: seriesMatchId });
    expect(await memberships()).toEqual(before);
    expect(await getGuestRating(prisma as never, playerIds[3], 1000)).toBe(guestBefore);
    expect(await prisma.match.count({ where: { id: seriesMatchId } })).toBe(0);
    expect(await prisma.session.findUniqueOrThrow({ where: { id: seriesSessionId } })).toMatchObject({ resultsRevision: 4 });
    expect((await prisma.sessionPlayer.findMany({ where: { sessionId: seriesSessionId } })).every(seat => seat.matchesPlayed === 0 && seat.sessionPoints === 0)).toBe(true);
    const secondId = `${seriesMatchId}-reset`;
    await makeMatch(secondId);
    expect((await submit({ gameScores, scoreRevision: 0 }, secondId)).status).toBe(200);
    const { reverseSessionEloChanges } = await import("@/lib/sessionLifecycle");
    await prisma.$transaction(async tx => {
      await reverseSessionEloChanges(tx, { sessionId: seriesSessionId, clubId: clubAId });
      await tx.match.delete({ where: { id: secondId } });
    });
    expect(await memberships()).toEqual(before);
    expect(await getGuestRating(prisma as never, playerIds[3], 1000)).toBe(guestBefore);
  });
});
