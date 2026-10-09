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
    clubAccess: {
      findUnique: vi.fn(),
    },
    clubMember: {
      findMany: vi.fn(),
    },
    club: {
      findUnique: vi.fn(),
    },
    player: {
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

function mockRequesterAccess(role: "ADMIN" | "STAFF" = "ADMIN") {
  vi.mocked(prisma.clubAccess.findUnique).mockResolvedValue({
    role,
    status: "ACTIVE",
    club: { isTutorial: false, tutorialOwnerId: null },
  } as never);
}

function mockClubMemberships(rows: Array<Record<string, unknown>>) {
  vi.mocked(prisma.clubMember.findMany).mockImplementation((args) => {
    const memberships = args?.where?.player ? [] : rows;
    return Promise.resolve(memberships) as never;
  });
}

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
      playerConfigs: [{ playerId: "player-1", pool: SessionPool.A }],
    });

    mockRequesterAccess();
    mockClubMemberships(
      playerIds.map((playerId) => ({
        playerId,
        preferredPool: SessionPool.B,
      }))
    );
    vi.mocked(prisma.player.findMany).mockResolvedValue(
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
        requesterId: "host-account",
        requesterIsAdmin: false,
        input,
      })
    ).rejects.toThrow(
      "Player groups require at least 2 Competitive and 2 Social players"
    );
    expect(prisma.clubMember.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        clubId: { in: ["community-1"] },
        retiredByAdmissionEventId: null,
      }),
    }));
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
        { playerId: "player-2", pool: SessionPool.B },
        { playerId: "player-3", pool: SessionPool.A },
      ],
    });
    mockRequesterAccess();
    mockClubMemberships([
      { playerId: "player-1", preferredPool: SessionPool.A },
      { playerId: "player-2", preferredPool: SessionPool.A },
      { playerId: "player-3", preferredPool: SessionPool.B },
      { playerId: "player-4", preferredPool: SessionPool.B },
    ]);
    vi.mocked(prisma.player.findMany).mockResolvedValue(
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
        player: { create: vi.fn() },
        sessionPlayer: { createMany: vi.fn() },
      } as never)
    );

    await createSessionForUser({
      requesterId: "host-account",
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

    mockRequesterAccess();
    mockClubMemberships([
      { playerId: "player-2" },
      { playerId: "player-3" },
    ]);
    vi.mocked(prisma.player.findMany).mockResolvedValue([
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
        requesterId: "host-account",
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

    mockRequesterAccess("STAFF");
    mockClubMemberships([
      { playerId: "player-2" },
      { playerId: "player-3", preferredPool: SessionPool.B },
    ]);
    vi.mocked(prisma.player.findMany).mockResolvedValue([
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
          playerId: "player-2",
          player: {
            id: "player-2",
            name: "Player Two",
            elo: 1000,
            gender: "UNSPECIFIED",
            partnerPreference: "OPEN",
          },
        },
        {
          playerId: "player-3",
          player: {
            id: "player-3",
            name: "Player Three",
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
        player: { create: vi.fn() },
        sessionPlayer: {
          createMany: vi.fn(),
        },
      } as never)
    );

    await createSessionForUser({
      requesterId: "host-account",
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
                playerId: "player-2",
                pool: SessionPool.B,
              }),
              expect.objectContaining({
                playerId: "player-3",
                pool: SessionPool.B,
              }),
            ],
          },
        }),
      })
    );
    const createdPlayers = sessionCreate.mock.calls[0]?.[0]?.data?.players
      ?.create as Array<Record<string, unknown>>;
    expect(
      createdPlayers.find((player) => player.playerId === "player-3")
    ).not.toHaveProperty("needsMoreRest");
    expect(sessionCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          players: {
            create: expect.arrayContaining([
              expect.objectContaining({
                playerId: "host-account",
              }),
            ]),
          },
        }),
      })
    );
  });
});
