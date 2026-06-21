import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  SessionBalanceMetric,
  SessionMatchmakingStyle,
  SessionMode,
  SessionPairingMode,
  SessionScoringType,
  SessionStatus,
  SessionType,
} from "@/types/enums";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    communityMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    community: {
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

  it("allows staff to host without auto-adding the requester to the tournament player list", async () => {
    const input = parseCreateSessionRequest({
      name: "Friday Night",
      communityId: "community-1",
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      courtCount: 3,
      playerIds: ["player-2", "player-3"],
    });

    vi.mocked(prisma.communityMember.findUnique).mockResolvedValue({
      communityId: "community-1",
      userId: "host-1",
      role: "STAFF",
    } as never);
    vi.mocked(prisma.community.findUnique).mockResolvedValue({
      isTutorial: false,
      tutorialOwnerId: null,
    } as never);
    vi.mocked(prisma.communityMember.findMany).mockResolvedValue([
      { userId: "host-1" },
      { userId: "player-2" },
      { userId: "player-3" },
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
      communityId: "community-1",
      name: "Friday Night",
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      status: SessionStatus.WAITING,
    });
    const sessionFindUnique = vi.fn().mockResolvedValue({
      id: "session-1",
      code: "session-1",
      communityId: "community-1",
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
          players: {
            create: [
              expect.objectContaining({
                userId: "player-2",
              }),
              expect.objectContaining({
                userId: "player-3",
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
