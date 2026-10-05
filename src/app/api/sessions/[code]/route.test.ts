import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SessionBalanceMetric,
  SessionCollabFormat,
  SessionCrossoverFrequency,
  SessionMatchmakingStyle,
  SessionMode,
  SessionPairingMode,
  SessionScoringType,
  SessionStatus,
  SessionType,
} from "@/types/enums";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: { findUnique: vi.fn() },
    clubMember: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/playerGroupPreferences", () => ({
  applyPendingPlayerGroupChangesInTransaction: vi.fn(),
}));
vi.mock("@/lib/sessionCollab", () => ({
  getPlayerClubBadges: vi.fn(async () => new Map()),
  getSessionAdminMembership: vi.fn(async () => null),
  getSessionMembership: vi.fn(async () => null),
  getSessionOperatorMembership: vi.fn(async () => null),
  isAccountSessionPlayer: vi.fn(async () => true),
  withPlayerClubBadges: vi.fn((players) => players),
}));
vi.mock("@/lib/clubElo", () => ({
  getClubEloByUserId: vi.fn(async () => new Map()),
  withClubElo: vi.fn((players) => players),
}));
vi.mock("./queue-match/shared", () => ({
  tryRebuildQueuedMatchForSessionId: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { applyPendingPlayerGroupChangesInTransaction } from "@/lib/playerGroupPreferences";
import { prisma } from "@/lib/prisma";
import { GET, PATCH } from "./route";

const baseSession = {
  id: "session-1",
  clubId: "club-1",
  status: SessionStatus.WAITING,
  collabFormat: SessionCollabFormat.FREE_PLAY,
  poolAssignmentsInitialized: true,
  courts: [
    {
      id: "court-1",
      courtNumber: 1,
      currentMatchId: null,
      _count: { matches: 0 },
    },
  ],
};

function updatedSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    type: SessionType.POINTS,
    mode: SessionMode.MEXICANO,
    scoringType: SessionScoringType.POINTS,
    matchmakingStyle: SessionMatchmakingStyle.BALANCED,
    balanceMetric: SessionBalanceMetric.SESSION_POINTS,
    pairingMode: SessionPairingMode.OPEN,
    autoQueueEnabled: true,
    respectPlayerRest: true,
    poolsEnabled: false,
    crossoverFrequency: SessionCrossoverFrequency.BALANCED,
    courts: [{ id: "court-1", courtNumber: 1, label: null }],
    players: [],
    ...overrides,
  };
}

function transactionDouble(queuedMatch: unknown = null) {
  return {
    session: { update: vi.fn().mockResolvedValue({}) },
    sessionPlayer: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    clubMember: { findMany: vi.fn().mockResolvedValue([]) },
    court: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    queuedMatch: {
      findUnique: vi.fn().mockResolvedValue(queuedMatch),
      deleteMany: vi.fn().mockResolvedValue({ count: queuedMatch ? 1 : 0 }),
    },
  };
}

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/sessions/session-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("session settings route", () => {
  it("returns the viewer Account ID and owned Player ID without exposing owner IDs", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "account-1", isAdmin: false } } as never);
    const player = { id: "player-1", ownerUserId: "account-1", name: "Alex", avatarKey: null, elo: 1200, gender: "MALE", partnerPreference: "OPEN", mixedSideOverride: null };
    const currentMatch = {
      id: "match-live", createdAt: new Date("2026-05-01T10:00:00Z"), status: "IN_PROGRESS",
      team1ClubId: null, team2ClubId: null, team1Score: null, team2Score: null, completedAt: null,
      scoreSubmittedByUserId: "account-1", scoreSubmittedByPlayerId: "player-1",
      matchmakingReasonJson: null, courtGroupType: null, poolASeatCount: null, poolBSeatCount: null,
      team1Player1: { id: "player-1", name: "Alex", avatarKey: null },
      team1Player2: { id: "player-2", name: "Bea", avatarKey: null },
      team2Player1: { id: "player-3", name: "Casey", avatarKey: null },
      team2Player2: { id: "player-4", name: "Dev", avatarKey: null },
    };
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: "session-1", code: "ABC123", name: "Session", clubId: null,
      status: SessionStatus.ACTIVE, isTest: false, type: SessionType.POINTS,
      collabFormat: SessionCollabFormat.FREE_PLAY, sessionClubs: [],
      club: null, courts: [{ id: "court-1", courtNumber: 1, currentMatch: currentMatch as never }],
      players: [{ id: "appearance-1", sessionId: "session-1", playerId: "player-1", player }],
      matches: [{ id: "match-history", createdAt: new Date("2026-05-01T10:00:00Z"), team1Player1Id: "player-1", team1Player2Id: "player-2", team2Player1Id: "player-3", team2Player2Id: "player-4", team1ClubId: null, team2ClubId: null, team1Score: 15, team2Score: 14, winnerTeam: 1, status: "COMPLETED", completedAt: new Date("2026-05-01T10:30:00Z"), scoreSubmittedByUserId: "account-1", scoreSubmittedByPlayerId: "player-1", courtGroupType: null, poolASeatCount: null, poolBSeatCount: null }],
      queuedMatch: null,
    } as never);

    const response = await GET(new Request("http://localhost/api/sessions/ABC123"), { params: Promise.resolve({ code: "ABC123" }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.viewerUserId).toBe("account-1");
    expect(body.viewerPlayerId).toBe("player-1");
    expect(body.players[0].player).not.toHaveProperty("ownerUserId");
    expect(body.courts[0].currentMatch).toMatchObject({ scoreSubmittedByUserId: "account-1", scoreSubmittedByPlayerId: "player-1" });
    expect(body.matches[0]).toMatchObject({ scoreSubmittedByUserId: "account-1", scoreSubmittedByPlayerId: "player-1" });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({
      user: { id: "admin-1", isAdmin: true },
    } as never);
    vi.mocked(applyPendingPlayerGroupChangesInTransaction).mockResolvedValue({
      appliedCount: 0,
      appliedUserIds: [],
      automaticQueueInvalidated: false,
    });
  });

  it("updates operational settings and clears the queue atomically", async () => {
    vi.mocked(prisma.session.findUnique)
      .mockResolvedValueOnce(baseSession as never)
      .mockResolvedValueOnce(
        updatedSession({
          autoQueueEnabled: false,
          respectPlayerRest: false,
        }) as never
      );
    const tx = transactionDouble();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(tx as never)
    );

    const response = await PATCH(
      request({
        autoQueueEnabled: false,
        respectPlayerRest: false,
        courtLabels: [],
      }),
      { params: Promise.resolve({ code: "session-1" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      autoQueueEnabled: false,
      respectPlayerRest: false,
      queuedMatch: null,
    });
    expect(tx.queuedMatch.deleteMany).toHaveBeenCalledWith({
      where: { sessionId: "session-1" },
    });
  });

  it("releases pending players when disabling auto queue cancels a manual queue", async () => {
    const manualQueue = {
      id: "queue-1",
      isAutomatic: false,
      team1Player1Id: "p1",
      team1Player2Id: "p2",
      team2Player1Id: "p3",
      team2Player2Id: "p4",
    };
    vi.mocked(prisma.session.findUnique)
      .mockResolvedValueOnce(baseSession as never)
      .mockResolvedValueOnce(updatedSession({ autoQueueEnabled: false }) as never);
    const tx = transactionDouble(manualQueue);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(tx as never)
    );

    const response = await PATCH(
      request({
        autoQueueEnabled: false,
        respectPlayerRest: true,
        courtLabels: [],
      }),
      { params: Promise.resolve({ code: "session-1" }) }
    );

    expect(response.status).toBe(200);
    expect(applyPendingPlayerGroupChangesInTransaction).toHaveBeenCalledWith(
      tx,
      { sessionId: "session-1", userIds: ["p1", "p2", "p3", "p4"] }
    );
  });

  it("updates waiting gameplay settings, legacy shadows, courts, and labels", async () => {
    vi.mocked(prisma.session.findUnique)
      .mockResolvedValueOnce(baseSession as never)
      .mockResolvedValueOnce(
        updatedSession({
          type: SessionType.RACE,
          mode: SessionMode.MIXICANO,
          matchmakingStyle: SessionMatchmakingStyle.LEVEL_MATCH,
          pairingMode: SessionPairingMode.MIXED,
          courts: [
            { id: "court-1", courtNumber: 1, label: "Show" },
            { id: "court-2", courtNumber: 2, label: null },
          ],
        }) as never
      );
    const tx = transactionDouble();
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(tx as never)
    );

    const response = await PATCH(
      request({
        autoQueueEnabled: true,
        respectPlayerRest: true,
        courtLabels: [
          { courtNumber: 1, label: "Show" },
          { courtNumber: 2, label: "" },
        ],
        gameplaySettings: {
          matchmakingStyle: SessionMatchmakingStyle.LEVEL_MATCH,
          balanceMetric: SessionBalanceMetric.SESSION_POINTS,
          pairingMode: SessionPairingMode.MIXED,
          poolsEnabled: false,
          crossoverFrequency: SessionCrossoverFrequency.BALANCED,
          courtCount: 2,
        },
      }),
      { params: Promise.resolve({ code: "session-1" }) }
    );

    const responsePayload = await response.clone().json();
    expect(response.status, JSON.stringify(responsePayload)).toBe(200);
    expect(tx.session.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: SessionType.RACE,
          mode: SessionMode.MIXICANO,
          matchmakingStyle: SessionMatchmakingStyle.LEVEL_MATCH,
        }),
      })
    );
    expect(tx.court.createMany).toHaveBeenCalledWith({
      data: [{ sessionId: "session-1", courtNumber: 2 }],
    });
  });

  it("rejects gameplay changes after the tournament starts", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      ...baseSession,
      status: SessionStatus.ACTIVE,
    } as never);

    const response = await PATCH(
      request({
        autoQueueEnabled: true,
        respectPlayerRest: true,
        courtLabels: [],
        gameplaySettings: {
          matchmakingStyle: SessionMatchmakingStyle.SOCIAL,
          balanceMetric: SessionBalanceMetric.RATING,
          pairingMode: SessionPairingMode.OPEN,
          poolsEnabled: false,
          crossoverFrequency: SessionCrossoverFrequency.BALANCED,
          courtCount: 1,
        },
      }),
      { params: Promise.resolve({ code: "session-1" }) }
    );

    expect(response.status).toBe(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects player groups for club vs club tournaments", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      ...baseSession,
      collabFormat: SessionCollabFormat.INTERCLUB,
    } as never);

    const response = await PATCH(
      request({
        autoQueueEnabled: true,
        respectPlayerRest: true,
        courtLabels: [],
        gameplaySettings: {
          matchmakingStyle: SessionMatchmakingStyle.BALANCED,
          balanceMetric: SessionBalanceMetric.RATING,
          pairingMode: SessionPairingMode.OPEN,
          poolsEnabled: true,
          crossoverFrequency: SessionCrossoverFrequency.BALANCED,
          courtCount: 1,
        },
      }),
      { params: Promise.resolve({ code: "session-1" }) }
    );

    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("refuses to remove a court that has match history", async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      ...baseSession,
      courts: [
        baseSession.courts[0],
        {
          id: "court-2",
          courtNumber: 2,
          currentMatchId: null,
          _count: { matches: 1 },
        },
      ],
    } as never);

    const response = await PATCH(
      request({
        autoQueueEnabled: true,
        respectPlayerRest: true,
        courtLabels: [{ courtNumber: 1, label: "" }],
        gameplaySettings: {
          matchmakingStyle: SessionMatchmakingStyle.BALANCED,
          balanceMetric: SessionBalanceMetric.SESSION_POINTS,
          pairingMode: SessionPairingMode.OPEN,
          poolsEnabled: false,
          crossoverFrequency: SessionCrossoverFrequency.BALANCED,
          courtCount: 1,
        },
      }),
      { params: Promise.resolve({ code: "session-1" }) }
    );

    expect(response.status).toBe(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("restores legacy group assignments from club preferences once", async () => {
    vi.mocked(prisma.session.findUnique)
      .mockResolvedValueOnce({
        ...baseSession,
        poolAssignmentsInitialized: false,
      } as never)
      .mockResolvedValueOnce(updatedSession({ poolsEnabled: true }) as never);
    const tx = transactionDouble();
    tx.sessionPlayer.findMany.mockResolvedValue([
      { playerId: "competitive", isGuest: false },
      { playerId: "social", isGuest: false },
      { playerId: "guest", isGuest: true },
    ]);
    tx.clubMember.findMany.mockResolvedValue([
      { playerId: "competitive", preferredPool: "A" },
      { playerId: "social", preferredPool: "B" },
    ]);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback(tx as never)
    );

    const response = await PATCH(
      request({
        autoQueueEnabled: true,
        respectPlayerRest: true,
        courtLabels: [],
        gameplaySettings: {
          matchmakingStyle: SessionMatchmakingStyle.BALANCED,
          balanceMetric: SessionBalanceMetric.SESSION_POINTS,
          pairingMode: SessionPairingMode.OPEN,
          poolsEnabled: true,
          crossoverFrequency: SessionCrossoverFrequency.BALANCED,
          courtCount: 1,
        },
      }),
      { params: Promise.resolve({ code: "session-1" }) }
    );

    expect(response.status).toBe(200);
    expect(tx.sessionPlayer.updateMany).toHaveBeenNthCalledWith(1, {
      where: { sessionId: "session-1" },
      data: { pool: "B", pendingPool: null },
    });
    expect(tx.sessionPlayer.updateMany).toHaveBeenNthCalledWith(2, {
      where: {
        sessionId: "session-1",
        playerId: { in: ["competitive"] },
      },
      data: { pool: "A", pendingPool: null },
    });
  });
});
