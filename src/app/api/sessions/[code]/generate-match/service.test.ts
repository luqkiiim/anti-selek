import { beforeEach, describe, expect, it, vi } from "vitest";
import { PartnerPreference, PlayerGender, SessionMode, SessionStatus, SessionType } from "@/types/enums";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    session: { findUnique: vi.fn() },
    court: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    communityMember: { findUnique: vi.fn() },
    match: { delete: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/communityElo", () => ({
  getCommunityEloByUserId: vi.fn(),
}));

vi.mock("@/lib/matchmaking/v2", async () => {
  const actual = await vi.importActual<typeof import("@/lib/matchmaking/v2")>(
    "@/lib/matchmaking/v2"
  );

  return {
    ...actual,
    findBestAutoMatchSelectionV2: vi.fn(),
    findBestBatchAutoMatchSelectionV2: vi.fn(),
  };
});

vi.mock("@/lib/matchmaking/partitioning", async () => {
  const actual = await vi.importActual<typeof import("@/lib/matchmaking/partitioning")>(
    "@/lib/matchmaking/partitioning"
  );

  return {
    ...actual,
    evaluateBestPartition: vi.fn(actual.evaluateBestPartition),
  };
});

import {
  findBestAutoMatchSelectionV2,
  findBestBatchAutoMatchSelectionV2,
} from "@/lib/matchmaking/v2";
import {
  buildRotationHistory,
  evaluateBestPartition,
  type PartitionCandidate,
} from "@/lib/matchmaking/partitioning";
import {
  ensureEnoughPlayers,
  GenerateMatchError,
  getRequestedOpenCourts,
  getRankedCandidates,
  parseGenerateMatchRequest,
  parseManualTeams,
  selectBatchMatches,
  selectSingleCourtMatch,
  type GenerateMatchCourt,
  type GenerateMatchSession,
  validateManualMatchRequest,
} from "./service";

function createSessionPlayer(
  userId: string,
  options: {
    name?: string;
    gender?: PlayerGender;
    partnerPreference?: PartnerPreference;
    isPaused?: boolean;
    isGuest?: boolean;
    sessionPoints?: number;
    elo?: number;
    lastPartnerId?: string | null;
    matchesPlayed?: number;
    matchmakingMatchesCredit?: number;
    joinedAt?: Date;
    availableSince?: Date;
    inactiveSeconds?: number;
  } = {}
) {
  return {
    userId,
    sessionPoints: options.sessionPoints ?? 1000,
    isPaused: options.isPaused ?? false,
    isGuest: options.isGuest ?? false,
    gender: options.gender ?? PlayerGender.MALE,
    partnerPreference: options.partnerPreference ?? PartnerPreference.OPEN,
    lastPartnerId: options.lastPartnerId ?? null,
    matchesPlayed: options.matchesPlayed ?? 0,
    matchmakingMatchesCredit: options.matchmakingMatchesCredit ?? 0,
    joinedAt: options.joinedAt ?? new Date("2026-01-01T00:00:00Z"),
    availableSince: options.availableSince ?? new Date("2026-01-01T00:00:00Z"),
    inactiveSeconds: options.inactiveSeconds ?? 0,
    user: {
      id: userId,
      name: options.name ?? userId,
      elo: options.elo ?? 1000,
    },
  } as GenerateMatchSession["players"][number];
}

function createSessionData(
  overrides: Partial<GenerateMatchSession> = {}
): GenerateMatchSession {
  return {
    id: "session-1",
    code: "session-1",
    communityId: "community-1",
    name: "Test Session",
    type: SessionType.ELO,
    mode: SessionMode.MEXICANO,
    status: SessionStatus.ACTIVE,
    players: [],
    matches: [],
    ...overrides,
  } as unknown as GenerateMatchSession;
}

function createCourt(
  id: string,
  currentMatch: GenerateMatchCourt["currentMatch"] = null
): GenerateMatchCourt {
  return {
    id,
    sessionId: "session-1",
    courtNumber: 1,
    currentMatchId: currentMatch?.id ?? null,
    currentMatch,
  } as unknown as GenerateMatchCourt;
}

function createPlayersById(players: GenerateMatchSession["players"]) {
  return new Map<string, PartitionCandidate>(
    players.map((player) => [
      player.userId,
      {
        userId: player.userId,
        elo: player.user.elo,
        pointDiff: 0,
        lastPartnerId: player.lastPartnerId,
        gender: player.gender,
        partnerPreference: player.partnerPreference,
      },
    ])
  );
}

function createSelection(
  ids: [string, string, string, string],
  partition: { team1: [string, string]; team2: [string, string] }
) {
  return {
    ids,
    partition,
    score: 0,
    pointDiffGap: 0,
    rotationPenalty: 0,
    exactPartitionPenalty: 0,
  };
}

describe("generate match service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("parseGenerateMatchRequest", () => {
    it("accepts a single court id and defaults optional flags", () => {
      expect(parseGenerateMatchRequest({ courtId: "court-1" })).toEqual({
        requestedCourtIds: ["court-1"],
        forceReshuffle: false,
        undoCurrentMatch: false,
        manualTeams: undefined,
      });
    });

    it("accepts explicit courtIds arrays", () => {
      expect(
        parseGenerateMatchRequest({
          courtIds: ["court-1", "court-2", 3],
          forceReshuffle: false,
        })
      ).toEqual({
        requestedCourtIds: ["court-1", "court-2"],
        forceReshuffle: false,
        undoCurrentMatch: false,
        manualTeams: undefined,
      });
    });

    it("rejects missing court identifiers", () => {
      expect(() => parseGenerateMatchRequest({})).toThrowError(
        new GenerateMatchError(400, "Court ID required")
      );
    });

    it("rejects conflicting actions", () => {
      expect(() =>
        parseGenerateMatchRequest({
          courtId: "court-1",
          forceReshuffle: true,
          undoCurrentMatch: true,
        })
      ).toThrowError(
        new GenerateMatchError(400, "Choose either reshuffle or undo, not both.")
      );
    });

    it("rejects manual creation combined with batch court requests", () => {
      expect(() =>
        parseGenerateMatchRequest({
          courtIds: ["court-1", "court-2"],
          manualTeams: { team1: ["A", "B"], team2: ["C", "D"] },
        })
      ).toThrowError(
        new GenerateMatchError(
          400,
          "Reshuffle, undo, and manual match creation are only supported for one court at a time."
        )
      );
    });
  });

  describe("parseManualTeams", () => {
    it("returns normalized manual teams", () => {
      expect(
        parseManualTeams({
          team1: ["A", "B"],
          team2: ["C", "D"],
        })
      ).toEqual({
        team1: ["A", "B"],
        team2: ["C", "D"],
      });
    });

    it("rejects invalid manual team payloads", () => {
      expect(() =>
        parseManualTeams({
          team1: ["A", "B", "C"],
          team2: ["D", "E"],
        })
      ).toThrowError(
        new GenerateMatchError(400, "Invalid manual team selection.")
      );
    });
  });

  describe("validateManualMatchRequest", () => {
    it("returns selected ids for a valid manual match", () => {
      const players = [
        createSessionPlayer("A"),
        createSessionPlayer("B"),
        createSessionPlayer("C"),
        createSessionPlayer("D"),
      ];
      const sessionData = createSessionData({ players });

      const selectedIds = validateManualMatchRequest({
        sessionData,
        targetCourt: createCourt("court-1"),
        parsedTeams: { team1: ["A", "B"], team2: ["C", "D"] },
        busyPlayerIds: new Set(),
        playersById: createPlayersById(players),
        rotationHistory: buildRotationHistory([]),
      });

      expect(selectedIds).toEqual(["A", "B", "C", "D"]);
    });

    it("rejects occupied courts", () => {
      const sessionData = createSessionData({
        players: [
          createSessionPlayer("A"),
          createSessionPlayer("B"),
          createSessionPlayer("C"),
          createSessionPlayer("D"),
        ],
      });

      expect(() =>
        validateManualMatchRequest({
          sessionData,
          targetCourt: createCourt("court-1", { id: "match-1" } as GenerateMatchCourt["currentMatch"]),
          parsedTeams: { team1: ["A", "B"], team2: ["C", "D"] },
          busyPlayerIds: new Set(),
          playersById: createPlayersById(sessionData.players),
          rotationHistory: buildRotationHistory([]),
        })
      ).toThrowError(
        new GenerateMatchError(
          409,
          "This court already has a match. Undo it first to create a manual match."
        )
      );
    });

    it("rejects paused players", () => {
      const players = [
        createSessionPlayer("A"),
        createSessionPlayer("B", { isPaused: true }),
        createSessionPlayer("C"),
        createSessionPlayer("D"),
      ];

      expect(() =>
        validateManualMatchRequest({
          sessionData: createSessionData({ players }),
          targetCourt: createCourt("court-1"),
          parsedTeams: { team1: ["A", "B"], team2: ["C", "D"] },
          busyPlayerIds: new Set(),
          playersById: createPlayersById(players),
          rotationHistory: buildRotationHistory([]),
        })
      ).toThrowError(
        new GenerateMatchError(
          400,
          "Paused players cannot be added to a manual match."
        )
      );
    });

    it("rejects players already busy on another court", () => {
      const players = [
        createSessionPlayer("A"),
        createSessionPlayer("B"),
        createSessionPlayer("C"),
        createSessionPlayer("D"),
      ];

      expect(() =>
        validateManualMatchRequest({
          sessionData: createSessionData({ players }),
          targetCourt: createCourt("court-1"),
          parsedTeams: { team1: ["A", "B"], team2: ["C", "D"] },
          busyPlayerIds: new Set(["C"]),
          playersById: createPlayersById(players),
          rotationHistory: buildRotationHistory([]),
        })
      ).toThrowError(
        new GenerateMatchError(
          409,
          "One or more selected players are already busy on another court."
        )
      );
    });

    it("rejects invalid Mixicano pairings", () => {
      const players = [
        createSessionPlayer("M1", { gender: PlayerGender.MALE }),
        createSessionPlayer("M2", { gender: PlayerGender.MALE }),
        createSessionPlayer("F1", {
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        }),
        createSessionPlayer("F2", {
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        }),
      ];

      expect(() =>
        validateManualMatchRequest({
          sessionData: createSessionData({
            mode: SessionMode.MIXICANO,
            players,
          }),
          targetCourt: createCourt("court-1"),
          parsedTeams: { team1: ["F1", "F2"], team2: ["M1", "M2"] },
          busyPlayerIds: new Set(),
          playersById: createPlayersById(players),
          rotationHistory: buildRotationHistory([]),
        })
      ).toThrowError(
        new GenerateMatchError(
          400,
          "That manual pairing is invalid for current Mixed preferences."
        )
      );
    });
  });

  describe("getRequestedOpenCourts", () => {
    it("allows courts freed earlier in the request", () => {
      const occupiedCourt = createCourt(
        "court-1",
        { id: "match-1" } as GenerateMatchCourt["currentMatch"]
      );
      const openCourt = createCourt("court-2");

      expect(
        getRequestedOpenCourts(
          [occupiedCourt, openCourt],
          new Set(["court-1"])
        )
      ).toEqual([occupiedCourt, openCourt]);
    });

    it("rejects non-empty courts that were not freed", () => {
      expect(() =>
        getRequestedOpenCourts(
          [
            createCourt(
              "court-1",
              { id: "match-1" } as GenerateMatchCourt["currentMatch"]
            ),
          ],
          new Set()
        )
      ).toThrowError(
        new GenerateMatchError(
          409,
          "Selected courts must be empty before creating matches."
        )
      );
    });
  });

  describe("ensureEnoughPlayers", () => {
    it("passes when enough players are available", () => {
      expect(() => ensureEnoughPlayers(8, 8, 2)).not.toThrow();
    });

    it("throws when there are not enough available players", () => {
      expect(() => ensureEnoughPlayers(7, 7, 2)).toThrowError(
        new GenerateMatchError(
          400,
          "Not enough players available (need 8, have 7)"
        )
      );
    });
  });

  describe("getRankedCandidates", () => {
    it("uses rotation-load ranking", () => {
      const now = new Date("2026-01-01T00:00:00Z");
      const players = [
        createSessionPlayer("resumed", {
          matchesPlayed: 0,
          matchmakingMatchesCredit: 5,
          availableSince: now,
        }),
        createSessionPlayer("A", {
          matchesPlayed: 5,
          availableSince: new Date("2025-12-31T23:50:00Z"),
        }),
        createSessionPlayer("B", {
          matchesPlayed: 5,
          availableSince: new Date("2025-12-31T23:49:00Z"),
        }),
      ];

      const { availableCandidates, rankedCandidates } =
        getRankedCandidates(createSessionData({ players }), new Set());

      expect(
        availableCandidates.find((candidate) => candidate.userId === "resumed")
          ?.matchmakingMatchesCredit
      ).toBe(5);
      expect(rankedCandidates[rankedCandidates.length - 1]?.userId).toBe(
        "resumed"
      );
    });
  });

  describe("selectSingleCourtMatch", () => {
    it("throws when no valid pairing exists", () => {
      vi.mocked(findBestAutoMatchSelectionV2).mockReturnValueOnce(null);

      expect(() =>
        selectSingleCourtMatch({
          rankedCandidates: [] as ReturnType<typeof import("@/lib/matchmaking/v2").rankPlayersByRotationLoad>,
          playersById: new Map(),
          sessionData: createSessionData(),
          rotationHistory: buildRotationHistory([]),
          reshuffleSource: null,
        })
      ).toThrowError(
        new GenerateMatchError(
          400,
          "No valid pairing found for current Open session rules. Try changing player preferences."
        )
      );
    });

    it("returns the initial selection when no reshuffle source exists", () => {
      const selection = createSelection(["A", "B", "C", "D"], {
        team1: ["A", "B"],
        team2: ["C", "D"],
      });
      vi.mocked(findBestAutoMatchSelectionV2).mockReturnValueOnce(
        selection as any
      );

      expect(
        selectSingleCourtMatch({
          rankedCandidates: [] as ReturnType<typeof import("@/lib/matchmaking/v2").rankPlayersByRotationLoad>,
          playersById: new Map(),
          sessionData: createSessionData(),
          rotationHistory: buildRotationHistory([]),
          reshuffleSource: null,
        })
      ).toEqual(selection);
      expect(findBestAutoMatchSelectionV2).toHaveBeenCalledTimes(1);
    });

    it("falls back to an alternative quartet when reshuffle repeats the same players", () => {
      const initial = createSelection(["A", "B", "C", "D"], {
        team1: ["A", "B"],
        team2: ["C", "D"],
      });
      const alternative = createSelection(["A", "B", "E", "F"], {
        team1: ["A", "E"],
        team2: ["B", "F"],
      });
      vi.mocked(findBestAutoMatchSelectionV2)
        .mockReturnValueOnce(initial as any)
        .mockReturnValueOnce(alternative as any);

      expect(
        selectSingleCourtMatch({
          rankedCandidates: [] as ReturnType<typeof import("@/lib/matchmaking/v2").rankPlayersByRotationLoad>,
          playersById: new Map(),
          sessionData: createSessionData(),
          rotationHistory: buildRotationHistory([]),
          reshuffleSource: {
            ids: ["A", "B", "C", "D"],
            partition: { team1: ["A", "B"], team2: ["C", "D"] },
          },
        })
      ).toEqual(alternative);
      expect(findBestAutoMatchSelectionV2).toHaveBeenCalledTimes(2);
    });

    it("falls back to an alternative partition when only the quartet repeats", () => {
      const initial = createSelection(["A", "B", "C", "D"], {
        team1: ["A", "B"],
        team2: ["C", "D"],
      });
      vi.mocked(findBestAutoMatchSelectionV2)
        .mockReturnValueOnce(initial as any)
        .mockReturnValueOnce(null);
      vi.mocked(evaluateBestPartition).mockReturnValueOnce({
        partition: { team1: ["A", "C"], team2: ["B", "D"] },
        score: 1,
        pointDiffGap: 0,
        rotationPenalty: 0,
        exactPartitionPenalty: 0,
      });

      expect(
        selectSingleCourtMatch({
          rankedCandidates: [] as ReturnType<typeof import("@/lib/matchmaking/v2").rankPlayersByRotationLoad>,
          playersById: new Map(),
          sessionData: createSessionData(),
          rotationHistory: buildRotationHistory([]),
          reshuffleSource: {
            ids: ["A", "B", "C", "D"],
            partition: { team1: ["A", "B"], team2: ["C", "D"] },
          },
        })
      ).toEqual({
        ...initial,
        partition: { team1: ["A", "C"], team2: ["B", "D"] },
        score: 1,
        pointDiffGap: 0,
        rotationPenalty: 0,
        exactPartitionPenalty: 0,
      });
    });

    it("throws when reshuffle has no valid alternative", () => {
      const initial = createSelection(["A", "B", "C", "D"], {
        team1: ["A", "B"],
        team2: ["C", "D"],
      });
      vi.mocked(findBestAutoMatchSelectionV2)
        .mockReturnValueOnce(initial as any)
        .mockReturnValueOnce(null);
      vi.mocked(evaluateBestPartition).mockReturnValueOnce(null);

      expect(() =>
        selectSingleCourtMatch({
          rankedCandidates: [] as ReturnType<typeof import("@/lib/matchmaking/v2").rankPlayersByRotationLoad>,
          playersById: new Map(),
          sessionData: createSessionData(),
          rotationHistory: buildRotationHistory([]),
          reshuffleSource: {
            ids: ["A", "B", "C", "D"],
            partition: { team1: ["A", "B"], team2: ["C", "D"] },
          },
        })
      ).toThrowError(
        new GenerateMatchError(
          409,
          "No alternative reshuffle was available. Undo this match if you want the same players returned to the pool."
        )
      );
    });
  });

  describe("selectBatchMatches", () => {
    it("returns the selected batch when one is available", () => {
      const batchSelection = {
        selections: [
          createSelection(["A", "B", "C", "D"], {
            team1: ["A", "B"],
            team2: ["C", "D"],
          }),
        ],
      };
      vi.mocked(findBestBatchAutoMatchSelectionV2).mockReturnValueOnce(
        batchSelection as any
      );

      expect(
        selectBatchMatches({
          rankedCandidates: [] as ReturnType<typeof import("@/lib/matchmaking/v2").rankPlayersByRotationLoad>,
          playersById: new Map(),
          sessionData: createSessionData(),
          rotationHistory: buildRotationHistory([]),
          requestedMatchCount: 1,
        })
      ).toEqual(batchSelection);
      expect(findBestBatchAutoMatchSelectionV2).toHaveBeenCalledTimes(1);
    });

    it("throws when no valid batch selection exists", () => {
      vi.mocked(findBestBatchAutoMatchSelectionV2).mockReturnValueOnce(null);

      expect(() =>
        selectBatchMatches({
          rankedCandidates: [] as ReturnType<typeof import("@/lib/matchmaking/v2").rankPlayersByRotationLoad>,
          playersById: new Map(),
          sessionData: createSessionData(),
          rotationHistory: buildRotationHistory([]),
          requestedMatchCount: 2,
        })
      ).toThrowError(
        new GenerateMatchError(
          400,
          "No valid set of matches found for current Open session rules. Try changing player preferences."
        )
      );
    });
  });
});
