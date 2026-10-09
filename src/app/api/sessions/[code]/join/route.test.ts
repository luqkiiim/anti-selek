import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MixedSide,
  PartnerPreference,
  PlayerGender,
  SessionClubRole,
  SessionClubStatus,
  SessionCollabFormat,
  SessionMode,
  SessionPool,
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
  clubAccessFindUnique: vi.fn(),
  offlineIdentityMemberFindMany: vi.fn(),
  playerFindMany: vi.fn(),
  playerFindFirst: vi.fn(),
  playerFindUnique: vi.fn(),
  getAcceptedSessionClubIds: vi.fn(),
  getPlayerClubBadges: vi.fn(),
  getSessionMembership: vi.fn(),
  getSessionOperatorMembership: vi.fn(),
  withPlayerClubBadges: vi.fn(),
  getClubEloByUserId: vi.fn(),
  withClubElo: vi.fn(),
  getAcceptedInterclubClubIds: vi.fn(),
  isInterclubSession: vi.fn(),
  canQuickAccessClub: vi.fn(),
  isQuickAccessSession: vi.fn(),
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
    clubAccess: {
      findUnique: mocks.clubAccessFindUnique,
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
    player: {
      findMany: mocks.playerFindMany,
      findFirst: mocks.playerFindFirst,
      findUnique: mocks.playerFindUnique,
    },
  },
}));

vi.mock("@/lib/sessionCollab", () => ({
  getAcceptedSessionClubIds: mocks.getAcceptedSessionClubIds,
  getPlayerClubBadges: mocks.getPlayerClubBadges,
  getSessionMembership: mocks.getSessionMembership,
  getSessionOperatorMembership: mocks.getSessionOperatorMembership,
  withPlayerClubBadges: mocks.withPlayerClubBadges,
}));

vi.mock("@/lib/clubElo", () => ({
  getClubEloByUserId: mocks.getClubEloByUserId,
  withClubElo: mocks.withClubElo,
}));

vi.mock("@/lib/sessionCollabFormat", () => ({
  getAcceptedInterclubClubIds: mocks.getAcceptedInterclubClubIds,
  isInterclubSession: mocks.isInterclubSession,
}));

vi.mock("@/lib/quickAccess", () => ({
  canQuickAccessClub: mocks.canQuickAccessClub,
  isQuickAccessSession: mocks.isQuickAccessSession,
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
    mocks.clubAccessFindUnique.mockResolvedValue({ status: "ACTIVE" });
    mocks.offlineIdentityMemberFindMany.mockResolvedValue([]);
    mocks.sessionClubFindMany.mockResolvedValue([]);
    mocks.playerFindMany.mockImplementation(async (args: { where: { ownerUserId: string } }) => [
      { id: args.where.ownerUserId.replace(/^account-/, "") },
    ]);
    mocks.playerFindFirst.mockResolvedValue({ ownerUserId: "account-other" });
    mocks.playerFindUnique.mockResolvedValue({
      ownerUserId: "account-other",
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });
    mocks.getAcceptedSessionClubIds.mockResolvedValue([]);
    mocks.getPlayerClubBadges.mockResolvedValue(new Map());
    mocks.getSessionMembership.mockResolvedValue({ role: "MEMBER" });
    mocks.getSessionOperatorMembership.mockResolvedValue(null);
    mocks.withPlayerClubBadges.mockImplementation((players) => players);
    mocks.getClubEloByUserId.mockResolvedValue(new Map());
    mocks.withClubElo.mockImplementation((players) => players);
    mocks.getAcceptedInterclubClubIds.mockImplementation((session: { sessionClubs?: Array<{ clubId: string; status: string }> }) =>
      (session.sessionClubs ?? []).filter((club) => club.status === SessionClubStatus.ACCEPTED).map((club) => club.clubId)
    );
    mocks.isInterclubSession.mockImplementation((session: { collabFormat?: string }) => session.collabFormat === SessionCollabFormat.INTERCLUB);
    mocks.canQuickAccessClub.mockReturnValue(true);
    mocks.isQuickAccessSession.mockImplementation((session: { user?: { isQuickAccess?: boolean } } | null | undefined) => session?.user?.isQuickAccess === true);
  });

  it.each([
    {
      label: "an explicit Default mixed side",
      input: { mixedSideOverride: null },
      expectedSide: null,
      expectedPreference: PartnerPreference.FEMALE_FLEX,
    },
    {
      label: "a legacy preference-only Default request",
      input: { partnerPreference: PartnerPreference.FEMALE_FLEX },
      expectedSide: null,
      expectedPreference: PartnerPreference.FEMALE_FLEX,
    },
    {
      label: "an explicit Upper Side over a conflicting legacy preference",
      input: {
        mixedSideOverride: MixedSide.UPPER,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      },
      expectedSide: MixedSide.UPPER,
      expectedPreference: PartnerPreference.OPEN,
    },
  ])("uses $label when joining", async ({ input, expectedSide, expectedPreference }) => {
    mocks.auth.mockResolvedValue({ user: { id: "account-player-1", isAdmin: false } });
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: null,
      status: SessionStatus.WAITING,
      mode: SessionMode.MIXICANO,
      poolsEnabled: false,
      players: [],
    });
    mocks.sessionPlayerFindUnique.mockResolvedValue(null);
    mocks.playerFindUnique.mockResolvedValue({
      gender: PlayerGender.FEMALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: MixedSide.UPPER,
    });
    mocks.sessionUpdate.mockResolvedValue({
      id: "session-1",
      clubId: null,
      courts: [],
      players: [],
    });

    const response = await postJoin(input);

    expect(response.status).toBe(200);
    expect(mocks.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          players: {
            create: expect.objectContaining({
              playerId: "player-1",
              gender: PlayerGender.FEMALE,
              mixedSideOverride: expectedSide,
              partnerPreference: expectedPreference,
            }),
          },
        },
      })
    );
  });

  it("blocks quick-access users from joining sessions", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "guest:player-1",
        isAdmin: false,
        isQuickAccess: true,
        guestPlayerId: "player-1",
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
    expect(mocks.playerFindUnique).not.toHaveBeenCalled();
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });

  it("requires active club access before a Player owner can join a club session", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "account-owner", isAdmin: false },
    });
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: "community-1",
      status: SessionStatus.WAITING,
      mode: SessionMode.MEXICANO,
      poolsEnabled: false,
      players: [],
    });
    mocks.getAcceptedSessionClubIds.mockResolvedValue(["community-1"]);
    mocks.getSessionMembership.mockResolvedValue(null);
    mocks.playerFindFirst.mockResolvedValue({ ownerUserId: "account-owner" });
    mocks.playerFindUnique.mockResolvedValue({
      ownerUserId: "account-owner",
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });

    const response = await postJoin({ playerId: "player-profile-9" });

    expect(response.status).toBe(403);
    expect(mocks.sessionPlayerFindUnique).not.toHaveBeenCalled();
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });

  it("lets an active MEMBER join their owned Player when account and Player ids differ", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "account-owner", isAdmin: false },
    });
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: "community-1",
      status: SessionStatus.WAITING,
      mode: SessionMode.MEXICANO,
      poolsEnabled: false,
      players: [],
    });
    mocks.getAcceptedSessionClubIds.mockResolvedValue(["community-1"]);
    mocks.getSessionMembership.mockResolvedValue({
      clubId: "community-1",
      role: "MEMBER",
    });
    mocks.playerFindFirst.mockResolvedValue({ ownerUserId: "account-owner" });
    mocks.playerFindUnique.mockResolvedValue({
      ownerUserId: "account-owner",
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });
    mocks.clubMemberFindUnique.mockResolvedValue({
      preferredPool: SessionPool.A,
    });
    mocks.sessionPlayerFindUnique.mockResolvedValue(null);
    mocks.sessionUpdate.mockResolvedValue({
      id: "session-1",
      clubId: "community-1",
      courts: [],
      players: [],
    });

    const response = await postJoin({ playerId: "player-profile-9" });

    expect(response.status).toBe(200);
    expect(mocks.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          players: {
            create: expect.objectContaining({ playerId: "player-profile-9" }),
          },
        },
      })
    );
  });

  it("rejects an archived roster row for an explicitly selected Player in a linked-club session", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "account-owner", isAdmin: false },
    });
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: null,
      collabFormat: SessionCollabFormat.FREE_PLAY,
      sessionClubs: [
        { clubId: "linked-club", role: SessionClubRole.HOST, status: SessionClubStatus.ACCEPTED },
      ],
      status: SessionStatus.WAITING,
      mode: SessionMode.MEXICANO,
      poolsEnabled: false,
      players: [],
    });
    mocks.getAcceptedSessionClubIds.mockResolvedValue(["linked-club"]);
    mocks.getSessionMembership.mockResolvedValue({
      clubId: "linked-club",
      role: "MEMBER",
    });
    mocks.playerFindFirst.mockResolvedValue({ ownerUserId: "account-owner" });
    mocks.playerFindUnique.mockResolvedValue({
      ownerUserId: "account-owner",
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });
    mocks.clubMemberFindUnique.mockResolvedValue(null);

    const response = await postJoin({ playerId: "player-profile-9" });

    expect(response.status).toBe(400);
    expect(mocks.clubMemberFindUnique).toHaveBeenCalledWith({
      where: {
        clubId_playerId: {
          clubId: "linked-club",
          playerId: "player-profile-9",
        },
        archivedAt: null,
      },
      select: { preferredPool: true },
    });
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });

  it.each([
    { accessStatus: "REVOKED", expectedStatus: 403 },
    { accessStatus: "ACTIVE", expectedStatus: 200 },
  ])(
    "requires access to the selected interclub side when joining an owned Player ($accessStatus)",
    async ({ accessStatus, expectedStatus }) => {
      const sessionClubs = [
        {
          clubId: "club-a",
          role: SessionClubRole.HOST,
          status: SessionClubStatus.ACCEPTED,
        },
        {
          clubId: "club-b",
          role: SessionClubRole.PARTNER,
          status: SessionClubStatus.ACCEPTED,
        },
      ];
      mocks.auth.mockResolvedValue({
        user: { id: "account-owner", isAdmin: false },
      });
      mocks.sessionFindUnique.mockResolvedValue({
        id: "session-1",
        clubId: "club-a",
        collabFormat: SessionCollabFormat.INTERCLUB,
        sessionClubs,
        status: SessionStatus.WAITING,
        mode: SessionMode.MEXICANO,
        poolsEnabled: false,
        players: [],
      });
      mocks.getAcceptedSessionClubIds.mockResolvedValue(["club-a", "club-b"]);
      mocks.getSessionMembership.mockResolvedValue({
        clubId: "club-a",
        role: "MEMBER",
      });
      mocks.playerFindFirst.mockResolvedValue({ ownerUserId: "account-owner" });
      mocks.playerFindUnique.mockResolvedValue({ ownerUserId: "account-owner" });
      mocks.getPlayerClubBadges.mockResolvedValue(
        new Map([["player-profile-9", [{ id: "club-b" }]]])
      );
      mocks.clubMemberFindUnique.mockResolvedValue({ preferredPool: SessionPool.B });
      mocks.clubAccessFindUnique.mockResolvedValue({ status: accessStatus });
      mocks.sessionPlayerFindUnique.mockResolvedValue(null);
      mocks.sessionUpdate.mockResolvedValue({
        id: "session-1",
        clubId: "club-a",
        courts: [],
        players: [],
      });

      const response = await postJoin({
        playerId: "player-profile-9",
        representingClubId: "club-b",
      });

      expect(response.status).toBe(expectedStatus);
      expect(mocks.clubAccessFindUnique).toHaveBeenCalledWith({
        where: {
          clubId_userId: { clubId: "club-b", userId: "account-owner" },
        },
        select: { status: true },
      });
      if (expectedStatus === 200) {
        expect(mocks.sessionUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: {
              players: {
                create: expect.objectContaining({
                  playerId: "player-profile-9",
                  representingClubId: "club-b",
                }),
              },
            },
          })
        );
      } else {
        expect(mocks.sessionUpdate).not.toHaveBeenCalled();
      }
    }
  );

  it("sets no-catch-up credit and arrival priority for active-session joins", async () => {
    const now = new Date("2026-05-08T04:10:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    mocks.auth.mockResolvedValue({
      user: {
        id: "account-late-player",
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
    mocks.playerFindUnique.mockResolvedValue({
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
          playerId: "late-player",
          ...args.data.players.create,
          player: {
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
              playerId: "late-player",
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

  it("uses the joining player's group baseline in active grouped sessions", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "account-late-player", isAdmin: true },
    });
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: null,
      status: SessionStatus.ACTIVE,
      mode: SessionMode.MEXICANO,
      poolsEnabled: true,
      players: [
        { isPaused: false, pool: SessionPool.A, matchesPlayed: 6, matchmakingMatchesCredit: 0 },
        { isPaused: false, pool: SessionPool.B, matchesPlayed: 2, matchmakingMatchesCredit: 0 },
      ],
    });
    mocks.sessionPlayerFindUnique.mockResolvedValue(null);
    mocks.playerFindUnique.mockResolvedValue({
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });
    mocks.sessionUpdate.mockResolvedValue({ id: "session-1", clubId: null, courts: [], players: [] });

    const response = await postJoin({ pool: SessionPool.A });

    expect(response.status).toBe(200);
    expect(mocks.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          players: {
            create: expect.objectContaining({
              pool: SessionPool.A,
              matchmakingMatchesCredit: 6,
            }),
          },
        },
      })
    );
  });

  it("does not set arrival priority for waiting-session joins", async () => {
    const now = new Date("2026-05-08T04:10:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    mocks.auth.mockResolvedValue({
      user: {
        id: "account-early-player",
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
    mocks.playerFindUnique.mockResolvedValue({
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
          playerId: "early-player",
          ...args.data.players.create,
          player: {
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

  it("copies the saved game group and ignores a legacy more-rest value", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "account-rest-player",
        isAdmin: false,
      },
    });
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: "community-1",
      status: SessionStatus.WAITING,
      mode: SessionMode.MEXICANO,
      poolsEnabled: true,
      players: [],
    });
    mocks.clubMemberFindUnique.mockResolvedValue({
      clubId: "community-1",
      role: "MEMBER",
      needsMoreRest: true,
      preferredPool: SessionPool.A,
    });
    mocks.sessionPlayerFindUnique.mockResolvedValue(null);
    mocks.playerFindUnique.mockResolvedValue({
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
              playerId: "rest-player",
              pool: SessionPool.A,
            }),
          },
        },
      })
    );
  });

  it("does not let a self-joining member override the saved game group", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "account-member-1", isAdmin: false },
    });
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-1",
      clubId: "community-1",
      status: SessionStatus.WAITING,
      mode: SessionMode.MEXICANO,
      poolsEnabled: true,
      players: [],
    });
    mocks.clubMemberFindUnique.mockResolvedValue({
      clubId: "community-1",
      role: "MEMBER",
      preferredPool: SessionPool.A,
    });

    const response = await postJoin({ pool: SessionPool.B });

    expect(response.status).toBe(403);
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });

  it("lets a Club B admin add a Club B player with Club B representation", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "account-club-b-admin",
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
    mocks.getSessionOperatorMembership.mockResolvedValue({ clubId: "community-2", role: "ADMIN" });
    mocks.clubMemberFindUnique.mockResolvedValue({ preferredPool: SessionPool.B });
    mocks.getPlayerClubBadges.mockResolvedValue(new Map([["club-b-player", [{ id: "community-2" }]]]));
    mocks.sessionPlayerFindUnique.mockResolvedValue(null);
    mocks.playerFindUnique.mockResolvedValue({
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
          playerId: "club-b-player",
          ...args.data.players.create,
          player: {
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
      playerId: "club-b-player",
      representingClubId: "community-2",
    });

    expect(response.status).toBe(200);
    expect(mocks.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          players: {
            create: expect.objectContaining({
              playerId: "club-b-player",
              representingClubId: "community-2",
            }),
          },
        },
      })
    );
  });

  it("requires a represented club for dual-club interclub players", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "account-club-a-admin",
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
    });
    mocks.getPlayerClubBadges.mockResolvedValue(new Map([["dual-player", [{ id: "community-1" }, { id: "community-2" }]]]));
    mocks.sessionPlayerFindUnique.mockResolvedValue(null);
    mocks.playerFindUnique.mockResolvedValue({
      gender: PlayerGender.MALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });

    const response = await postJoin({ playerId: "dual-player" });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Choose which club this player represents");
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });

  it("rejects a retired explicit Player before joining an unscoped session", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "account-owner", isAdmin: false } });
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-global",
      clubId: null,
      status: SessionStatus.WAITING,
      mode: SessionMode.MEXICANO,
      poolsEnabled: false,
      players: [],
    });
    mocks.playerFindFirst.mockResolvedValue(null);

    const response = await postJoin({ playerId: "retired-duplicate" });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "Player profile is not available for new sessions",
    });
    expect(mocks.playerFindFirst).toHaveBeenCalledWith({
      where: {
        id: "retired-duplicate",
        clubMemberships: {
          none: { retiredByAdmissionEventId: { not: null } },
        },
      },
      select: { ownerUserId: true },
    });
    expect(mocks.sessionPlayerFindUnique).not.toHaveBeenCalled();
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });

  it("joins the active original Player by explicit ID in an unscoped session", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "account-owner", isAdmin: false } });
    mocks.sessionFindUnique.mockResolvedValue({
      id: "session-global",
      clubId: null,
      status: SessionStatus.WAITING,
      mode: SessionMode.MEXICANO,
      poolsEnabled: false,
      players: [],
    });
    mocks.playerFindFirst.mockResolvedValue({ ownerUserId: "account-owner" });
    mocks.playerFindUnique.mockResolvedValue({
      gender: PlayerGender.FEMALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: null,
    });
    mocks.sessionPlayerFindUnique.mockResolvedValue(null);
    mocks.sessionUpdate.mockResolvedValue({
      id: "session-global",
      clubId: null,
      courts: [],
      players: [],
    });

    const response = await postJoin({ playerId: "historical-player" });

    expect(response.status).toBe(200);
    expect(mocks.playerFindFirst).toHaveBeenCalledWith({
      where: {
        id: "historical-player",
        clubMemberships: {
          none: { retiredByAdmissionEventId: { not: null } },
        },
      },
      select: { ownerUserId: true },
    });
    expect(mocks.sessionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          players: {
            create: expect.objectContaining({ playerId: "historical-player" }),
          },
        },
      })
    );
  });
});
