import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PartnerPreference,
  PlayerGender,
  SessionClubRole,
  SessionClubStatus,
  SessionCollabFormat,
  SessionMode,
  SessionStatus,
} from "@/types/enums";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  invalidTargetResponse: vi.fn(),
  rateLimit: vi.fn(),
  checkInvalidTargetRateLimit: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionUpdate: vi.fn(),
  sessionClubFindMany: vi.fn(),
  sessionPlayerFindUnique: vi.fn(),
  clubMemberFindUnique: vi.fn(),
  clubMemberFindMany: vi.fn(),
  offlineIdentityMemberFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  tryRebuildAutomaticQueuedMatchForSessionId: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clubMember: {
      findUnique: mocks.clubMemberFindUnique,
      findMany: mocks.clubMemberFindMany,
    },
    session: {
      findUnique: mocks.sessionFindUnique,
      update: mocks.sessionUpdate,
    },
    sessionClub: {
      findMany: mocks.sessionClubFindMany,
    },
    sessionPlayer: {
      findUnique: mocks.sessionPlayerFindUnique,
    },
    offlineIdentityMember: {
      findMany: mocks.offlineIdentityMemberFindMany,
    },
    user: {
      findUnique: mocks.userFindUnique,
    },
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: mocks.checkInvalidTargetRateLimit,
  invalidTargetResponse: mocks.invalidTargetResponse,
  rateLimit: mocks.rateLimit,
}));

vi.mock("../queue-match/shared", () => ({
  tryRebuildAutomaticQueuedMatchForSessionId:
    mocks.tryRebuildAutomaticQueuedMatchForSessionId,
}));

import { POST } from "./route";

function postJoin(body: unknown = {}) {
  return POST(
    new Request("http://localhost/api/sessions/ABC/join", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ code: "ABC" }) }
  );
}

describe("join session route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.rateLimit.mockResolvedValue(null);
    mocks.checkInvalidTargetRateLimit.mockResolvedValue(null);
    mocks.tryRebuildAutomaticQueuedMatchForSessionId.mockResolvedValue(null);
    mocks.invalidTargetResponse.mockImplementation(() =>
      Response.json({ error: "Unauthorized" }, { status: 403 })
    );
    mocks.clubMemberFindUnique.mockResolvedValue(null);
    mocks.clubMemberFindMany.mockResolvedValue([]);
    mocks.offlineIdentityMemberFindMany.mockResolvedValue([]);
    mocks.sessionClubFindMany.mockResolvedValue([]);
  });

  it("blocks quick-access users from joining sessions", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "player-1",
        isAdmin: false,
        isQuickAccess: true,
        quickAccessClubId: "community-1",
      },
    });
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: "community-1",
      status: SessionStatus.WAITING,
      players: [],
    });

    const response = await postJoin();

    expect(response.status).toBe(403);
    expect(mocks.sessionPlayerFindUnique).not.toHaveBeenCalled();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });

  it("sets no-catch-up credit and arrival priority for active-session joins", async () => {
    const now = new Date("2026-05-08T04:10:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    mocks.auth.mockResolvedValue({
      user: {
        id: "late-player",
        isAdmin: false,
      },
    });
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: null,
      status: SessionStatus.ACTIVE,
      mode: SessionMode.MEXICANO,
      poolsEnabled: false,
      players: [
        { isPaused: false, matchesPlayed: 4, matchmakingMatchesCredit: 0 },
        { isPaused: false, matchesPlayed: 5, matchmakingMatchesCredit: 0 },
      ],
    });
    mocks.sessionPlayerFindUnique.mockResolvedValue(null);
    mocks.userFindUnique.mockResolvedValue({
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });
    mocks.sessionUpdate.mockImplementation(async (args) => ({
      id: "session-1",
      clubId: null,
      courts: [],
      players: [
        {
          userId: "late-player",
          ...args.data.players.create,
          user: {
            id: "late-player",
            name: "Late Player",
            elo: 1000,
            gender: PlayerGender.MALE,
            partnerPreference: PartnerPreference.OPEN,
            mixedSideOverride: null,
          },
        },
      ],
    }));

    const response = await postJoin();

    expect(response.status).toBe(200);
    expect(mocks.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          players: {
            create: expect.objectContaining({
              userId: "late-player",
              matchmakingMatchesCredit: 4,
              joinedAt: now,
              ladderEntryAt: now,
              availableSince: now,
              arrivalPriorityAt: now,
            }),
          },
        },
      })
    );
    expect(mocks.tryRebuildAutomaticQueuedMatchForSessionId).toHaveBeenCalledWith(
      "session-1"
    );

    vi.useRealTimers();
  });

  it("does not set arrival priority for waiting-session joins", async () => {
    const now = new Date("2026-05-08T04:10:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    mocks.auth.mockResolvedValue({
      user: {
        id: "early-player",
        isAdmin: false,
      },
    });
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: null,
      status: SessionStatus.WAITING,
      mode: SessionMode.MEXICANO,
      poolsEnabled: false,
      players: [],
    });
    mocks.sessionPlayerFindUnique.mockResolvedValue(null);
    mocks.userFindUnique.mockResolvedValue({
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });
    mocks.sessionUpdate.mockImplementation(async (args) => ({
      id: "session-1",
      clubId: null,
      courts: [],
      players: [
        {
          userId: "early-player",
          ...args.data.players.create,
          user: {
            id: "early-player",
            name: "Early Player",
            elo: 1000,
            gender: PlayerGender.MALE,
            partnerPreference: PartnerPreference.OPEN,
            mixedSideOverride: null,
          },
        },
      ],
    }));

    const response = await postJoin();

    expect(response.status).toBe(200);
    expect(mocks.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          players: {
            create: expect.objectContaining({
              matchmakingMatchesCredit: 0,
              arrivalPriorityAt: null,
            }),
          },
        },
      })
    );
    expect(
      mocks.tryRebuildAutomaticQueuedMatchForSessionId
    ).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it("copies the club more-rest default when a member joins", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "rest-player",
        isAdmin: false,
      },
    });
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: "community-1",
      status: SessionStatus.WAITING,
      mode: SessionMode.MEXICANO,
      poolsEnabled: false,
      players: [],
    });
    mocks.clubMemberFindUnique.mockResolvedValue({
      clubId: "community-1",
      role: "MEMBER",
      needsMoreRest: true,
    });
    mocks.sessionPlayerFindUnique.mockResolvedValue(null);
    mocks.userFindUnique.mockResolvedValue({
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });
    mocks.sessionUpdate.mockResolvedValue({
      id: "session-1",
      players: [],
      courts: [],
    });

    const response = await postJoin();

    expect(response.status).toBe(200);
    expect(mocks.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          players: {
            create: expect.objectContaining({
              userId: "rest-player",
              needsMoreRest: true,
            }),
          },
        },
      })
    );
  });

  it("lets a Club B admin add a Club B player with Club B representation", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "club-b-admin",
        isAdmin: false,
      },
    });
    const sessionClubs = [
      {
        id: "session-club-host",
        sessionId: "session-1",
        clubId: "community-1",
        role: SessionClubRole.HOST,
        status: SessionClubStatus.ACCEPTED,
        createdAt: new Date("2026-05-08T04:00:00.000Z"),
        club: { id: "community-1", name: "Club A" },
      },
      {
        id: "session-club-partner",
        sessionId: "session-1",
        clubId: "community-2",
        role: SessionClubRole.PARTNER,
        status: SessionClubStatus.ACCEPTED,
        createdAt: new Date("2026-05-08T04:01:00.000Z"),
        club: { id: "community-2", name: "Club B" },
      },
    ];
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: "community-1",
      collabFormat: SessionCollabFormat.INTERCLUB,
      status: SessionStatus.WAITING,
      mode: SessionMode.MEXICANO,
      poolsEnabled: false,
      sessionClubs,
      players: [],
    });
    mocks.sessionClubFindMany.mockResolvedValue(sessionClubs);
    mocks.clubMemberFindUnique.mockImplementation(async (args) => {
      const { clubId, userId } = args.where.clubId_userId;
      if (userId === "club-b-admin" && clubId === "community-2") {
        return { clubId, role: "ADMIN", needsMoreRest: false };
      }
      if (userId === "club-b-player" && clubId === "community-2") {
        return { clubId, role: "MEMBER", needsMoreRest: true };
      }
      return null;
    });
    mocks.clubMemberFindMany.mockResolvedValue([
      {
        userId: "club-b-player",
        elo: 1110,
        club: { id: "community-2", name: "Club B" },
      },
    ]);
    mocks.sessionPlayerFindUnique.mockResolvedValue(null);
    mocks.userFindUnique.mockResolvedValue({
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });
    mocks.sessionUpdate.mockImplementation(async (args) => ({
      id: "session-1",
      clubId: null,
      courts: [],
      players: [
        {
          userId: "club-b-player",
          ...args.data.players.create,
          user: {
            id: "club-b-player",
            name: "Club B Player",
            elo: 1110,
            gender: PlayerGender.MALE,
            partnerPreference: PartnerPreference.OPEN,
            mixedSideOverride: null,
          },
        },
      ],
    }));

    const response = await postJoin({
      userId: "club-b-player",
      representingClubId: "community-2",
    });

    expect(response.status).toBe(200);
    expect(mocks.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          players: {
            create: expect.objectContaining({
              userId: "club-b-player",
              representingClubId: "community-2",
              needsMoreRest: true,
            }),
          },
        },
      })
    );
  });

  it("requires a represented club for dual-club interclub players", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "club-a-admin",
        isAdmin: true,
      },
    });
    const sessionClubs = [
      {
        id: "session-club-host",
        sessionId: "session-1",
        clubId: "community-1",
        role: SessionClubRole.HOST,
        status: SessionClubStatus.ACCEPTED,
        createdAt: new Date("2026-05-08T04:00:00.000Z"),
        club: { id: "community-1", name: "Club A" },
      },
      {
        id: "session-club-partner",
        sessionId: "session-1",
        clubId: "community-2",
        role: SessionClubRole.PARTNER,
        status: SessionClubStatus.ACCEPTED,
        createdAt: new Date("2026-05-08T04:01:00.000Z"),
        club: { id: "community-2", name: "Club B" },
      },
    ];
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: "community-1",
      collabFormat: SessionCollabFormat.INTERCLUB,
      status: SessionStatus.WAITING,
      mode: SessionMode.MEXICANO,
      poolsEnabled: false,
      sessionClubs,
      players: [],
    });
    mocks.sessionClubFindMany.mockResolvedValue(sessionClubs);
    mocks.clubMemberFindUnique.mockResolvedValue({
      clubId: "community-1",
      role: "ADMIN",
      needsMoreRest: false,
    });
    mocks.clubMemberFindMany.mockResolvedValue([
      {
        userId: "dual-player",
        elo: 1100,
        club: { id: "community-1", name: "Club A" },
      },
      {
        userId: "dual-player",
        elo: 1100,
        club: { id: "community-2", name: "Club B" },
      },
    ]);
    mocks.sessionPlayerFindUnique.mockResolvedValue(null);
    mocks.userFindUnique.mockResolvedValue({
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });

    const response = await postJoin({ userId: "dual-player" });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Choose which club this player represents");
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });
});
