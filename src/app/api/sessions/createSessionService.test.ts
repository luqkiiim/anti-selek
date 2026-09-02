import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SessionBalanceMetric,
  SessionCrossoverFrequency,
  SessionMatchmakingStyle,
  SessionMode,
  SessionPairingMode,
  SessionPool,
  SessionScoringType,
  SessionStatus,
  SessionType,
} from "@/types/enums";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clubMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    club: {
      findUnique: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    offlineIdentityMember: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/clubElo", () => ({
  getClubEloByUserId: vi.fn(),
  withClubElo: vi.fn((players: unknown) => players),
}));

import { prisma } from "@/lib/prisma";
import { getClubEloByUserId } from "@/lib/clubElo";
import { parseCreateSessionRequest } from "./createSessionRequest";
import { createSessionForUser } from "./createSessionService";

describe("createSessionForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires at least two players in each enabled player group", async () => {
    const playerIds = ["player-1", "player-2", "player-3", "player-4"];
    const input = parseCreateSessionRequest({
      name: "Grouped Friday",
      clubId: "community-1",
      poolsEnabled: true,
      playerIds,
      playerConfigs: [{ userId: "player-1", pool: SessionPool.A }],
    });

    vi.mocked(prisma.clubMember.findUnique).mockResolvedValue({
      clubId: "community-1",
      userId: "host-1",
      role: "ADMIN",
    } as never);
    vi.mocked(prisma.club.findUnique).mockResolvedValue({
      isTutorial: false,
      tutorialOwnerId: null,
    } as never);
    vi.mocked(prisma.clubMember.findMany).mockResolvedValue(
      playerIds.map((userId) => ({
        userId,
        needsMoreRest: false,
        preferredPool: SessionPool.B,
      })) as never
    );
    vi.mocked(prisma.user.findMany).mockResolvedValue(
      playerIds.map((id) => ({
        id,
        name: id,
        gender: "UNSPECIFIED",
        partnerPreference: "OPEN",
        mixedSideOverride: null,
      })) as never
    );
    vi.mocked(prisma.offlineIdentityMember.findMany).mockResolvedValue([] as never);

    await expect(
      createSessionForUser({
        requesterId: "host-1",
        requesterIsAdmin: false,
        input,
      })
    ).rejects.toThrow(
      "Player groups require at least 2 Competitive and 2 Social players"
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("uses explicit group overrides before saved club preferences", async () => {
    const playerIds = ["player-1", "player-2", "player-3", "player-4"];
    const input = parseCreateSessionRequest({
      name: "Grouped Friday",
      clubId: "community-1",
      poolsEnabled: true,
      poolAName: "Ignored A",
      poolBName: "Ignored B",
      playerIds,
      playerConfigs: [
        { userId: "player-2", pool: SessionPool.B },
        { userId: "player-3", pool: SessionPool.A },
      ],
    });
    vi.mocked(prisma.clubMember.findUnique).mockResolvedValue({
      clubId: "community-1",
      userId: "host-1",
      role: "ADMIN",
    } as never);
    vi.mocked(prisma.club.findUnique).mockResolvedValue({
      isTutorial: false,
      tutorialOwnerId: null,
    } as never);
    vi.mocked(prisma.clubMember.findMany).mockResolvedValue([
      { userId: "player-1", needsMoreRest: false, preferredPool: SessionPool.A },
      { userId: "player-2", needsMoreRest: false, preferredPool: SessionPool.A },
      { userId: "player-3", needsMoreRest: false, preferredPool: SessionPool.B },
      { userId: "player-4", needsMoreRest: false, preferredPool: SessionPool.B },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue(
      playerIds.map((id) => ({
        id,
        name: id,
        gender: "UNSPECIFIED",
        partnerPreference: "OPEN",
        mixedSideOverride: null,
      })) as never
    );
    vi.mocked(prisma.offlineIdentityMember.findMany).mockResolvedValue([] as never);
    const sessionCreate = vi.fn().mockResolvedValue({ id: "session-1" });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        session: {
          create: sessionCreate,
          findUnique: vi.fn().mockResolvedValue({
            id: "session-1",
            clubId: "community-1",
            players: [],
            courts: [],
            sessionClubs: [],
          }),
        },
        user: { create: vi.fn() },
        sessionPlayer: { createMany: vi.fn() },
      } as never)
    );

    await createSessionForUser({
      requesterId: "host-1",
      requesterIsAdmin: false,
      input,
    });

    const createdPlayers = sessionCreate.mock.calls[0][0].data.players.create;
    expect(createdPlayers.map((player: { pool: SessionPool }) => player.pool)).toEqual([
      SessionPool.A,
      SessionPool.B,
      SessionPool.A,
      SessionPool.B,
    ]);
    expect(sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          poolAName: "Competitive",
          poolBName: "Social",
        }),
      })
    );
  });

  it("rejects mixed tournaments when a selected member has no explicit gender", async () => {
    const input = parseCreateSessionRequest({
      name: "Mixed Friday",
      clubId: "community-1",
      type: SessionType.POINTS,
      mode: SessionMode.MIXICANO,
      courtCount: 1,
      playerIds: ["player-2", "player-3"],
    });

    vi.mocked(prisma.clubMember.findUnique).mockResolvedValue({
      clubId: "community-1",
      userId: "host-1",
      role: "ADMIN",
    } as never);
    vi.mocked(prisma.club.findUnique).mockResolvedValue({
      isTutorial: false,
      tutorialOwnerId: null,
    } as never);
    vi.mocked(prisma.clubMember.findMany).mockResolvedValue([
      { userId: "player-2", needsMoreRest: false },
      { userId: "player-3", needsMoreRest: false },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: "player-2",
        name: "Player Two",
        gender: "UNSPECIFIED",
        partnerPreference: "OPEN",
        mixedSideOverride: null,
      },
      {
        id: "player-3",
        name: "Player Three",
        gender: "FEMALE",
        partnerPreference: "OPEN",
        mixedSideOverride: null,
      },
    ] as never);
    vi.mocked(prisma.offlineIdentityMember.findMany).mockResolvedValue([] as never);

    await expect(
      createSessionForUser({
        requesterId: "host-1",
        requesterIsAdmin: false,
        input,
      })
    ).rejects.toThrow("Mixed requires player gender for Player Two");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("allows staff to host without auto-adding the requester to the tournament player list", async () => {
    const input = parseCreateSessionRequest({
      name: "Friday Night",
      clubId: "community-1",
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      courtCount: 3,
      playerIds: ["player-2", "player-3"],
    });

    vi.mocked(prisma.clubMember.findUnique).mockResolvedValue({
      clubId: "community-1",
      userId: "host-1",
      role: "STAFF",
    } as never);
    vi.mocked(prisma.club.findUnique).mockResolvedValue({
      isTutorial: false,
      tutorialOwnerId: null,
    } as never);
    vi.mocked(prisma.clubMember.findMany).mockResolvedValue([
      { userId: "host-1", needsMoreRest: false },
      { userId: "player-2", needsMoreRest: false },
      { userId: "player-3", needsMoreRest: true },
    ] as never);
    vi.mocked(prisma.user.findMany).mockResolvedValue([
      {
        id: "player-2",
        name: "Player Two",
        gender: "UNSPECIFIED",
        partnerPreference: "OPEN",
      },
      {
        id: "player-3",
        name: "Player Three",
        gender: "UNSPECIFIED",
        partnerPreference: "OPEN",
      },
    ] as never);
    vi.mocked(prisma.offlineIdentityMember.findMany).mockResolvedValue([] as never);
    vi.mocked(getClubEloByUserId).mockResolvedValue(new Map() as never);

    const sessionCreate = vi.fn().mockResolvedValue({
      id: "session-1",
      code: "session-1",
      clubId: "community-1",
      name: "Friday Night",
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      status: SessionStatus.WAITING,
    });
    const sessionFindUnique = vi.fn().mockResolvedValue({
      id: "session-1",
      code: "session-1",
      clubId: "community-1",
      name: "Friday Night",
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      status: SessionStatus.WAITING,
      courts: [],
      players: [
        {
          userId: "player-2",
          user: {
            id: "player-2",
            name: "Player Two",
            email: null,
            elo: 1000,
            gender: "UNSPECIFIED",
            partnerPreference: "OPEN",
          },
        },
        {
          userId: "player-3",
          user: {
            id: "player-3",
            name: "Player Three",
            email: null,
            elo: 1000,
            gender: "UNSPECIFIED",
            partnerPreference: "OPEN",
          },
        },
      ],
    });

    vi.mocked(prisma.$transaction).mockImplementation(async (callback) =>
      callback({
        session: {
          create: sessionCreate,
          findUnique: sessionFindUnique,
        },
        user: {
          create: vi.fn(),
        },
        sessionPlayer: {
          createMany: vi.fn(),
        },
      } as never)
    );

    await createSessionForUser({
      requesterId: "host-1",
      requesterIsAdmin: false,
      input,
    });

    expect(sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          respectPlayerRest: true,
          scoringType: SessionScoringType.POINTS,
          matchmakingStyle: SessionMatchmakingStyle.BALANCED,
          balanceMetric: SessionBalanceMetric.SESSION_POINTS,
          pairingMode: SessionPairingMode.OPEN,
          crossoverFrequency: SessionCrossoverFrequency.BALANCED,
          poolAssignmentsInitialized: true,
          players: {
            create: [
              expect.objectContaining({
                userId: "player-2",
                needsMoreRest: false,
                pool: SessionPool.B,
              }),
              expect.objectContaining({
                userId: "player-3",
                needsMoreRest: true,
                pool: SessionPool.B,
              }),
            ],
          },
        }),
      })
    );
    expect(sessionCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          players: {
            create: expect.arrayContaining([
              expect.objectContaining({
                userId: "host-1",
              }),
            ]),
          },
        }),
      })
    );
  });
});
