import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MixedSide,
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionPool,
  SessionStatus,
  SessionType,
} from "@/types/enums";

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

vi.mock("@/lib/matchmaking/v3", async () => {
  const actual = await vi.importActual<typeof import("@/lib/matchmaking/v3")>(
    "@/lib/matchmaking/v3"
  );

  return {
    ...actual,
    findBestSingleCourtSelectionV3: vi.fn(),
    findBestBatchSelectionV3: vi.fn(),
  };
});

vi.mock("@/lib/matchmaking/ladder", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/matchmaking/ladder")
  >("@/lib/matchmaking/ladder");

  return {
    ...actual,
    findBestSingleCourtSelectionLadder: vi.fn(),
    findBestBatchSelectionLadder: vi.fn(),
  };
});

import {
  findBestBatchSelectionV3,
  findBestSingleCourtSelectionV3,
  type ActiveMatchmakerV3Player,
  type MatchmakerV3Player,
  type V3BatchSelection,
  type V3SingleCourtSelection,
} from "@/lib/matchmaking/v3";
import { getCommunityEloByUserId } from "@/lib/communityElo";
import {
  findBestBatchSelectionLadder,
  findBestSingleCourtSelectionLadder,
  type ActiveMatchmakerLadderPlayer,
  type LadderBatchSelection,
  type LadderSingleCourtSelection,
  type MatchmakerLadderPlayer,
} from "@/lib/matchmaking/ladder";
import {
  buildRotationHistory,
  type PartitionCandidate,
} from "@/lib/matchmaking/partitioning";
import {
  buildMatchmakingState,
  ensureEnoughPlayers,
  ensureEnoughMatchTypePlayers,
  filterRankedCandidatesByMatchType,
  GenerateMatchError,
  getRankedCandidates,
  getRequestedOpenCourts,
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
    mixedSideOverride?: MixedSide | null;
    lastPartnerId?: string | null;
    matchesPlayed?: number;
    matchmakingMatchesCredit?: number;
    joinedAt?: Date;
    availableSince?: Date;
    inactiveSeconds?: number;
    pool?: SessionPool;
  } = {}
) {
  return {
    userId,
    sessionPoints: options.sessionPoints ?? 1000,
    isPaused: options.isPaused ?? false,
    isGuest: options.isGuest ?? false,
    gender: options.gender ?? PlayerGender.MALE,
    partnerPreference: options.partnerPreference ?? PartnerPreference.OPEN,
    mixedSideOverride: options.mixedSideOverride ?? null,
    lastPartnerId: options.lastPartnerId ?? null,
    matchesPlayed: options.matchesPlayed ?? 0,
    matchmakingMatchesCredit: options.matchmakingMatchesCredit ?? 0,
    joinedAt: options.joinedAt ?? new Date("2026-01-01T00:00:00Z"),
    availableSince: options.availableSince ?? new Date("2026-01-01T00:00:00Z"),
    inactiveSeconds: options.inactiveSeconds ?? 0,
    pool: options.pool ?? SessionPool.A,
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
    poolsEnabled: false,
    poolAName: "Open",
    poolBName: "Regular",
    poolACourtAssignments: 0,
    poolBCourtAssignments: 0,
    poolAMissedTurns: 0,
    poolBMissedTurns: 0,
    crossoverMissThreshold: 1,
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
        mixedSideOverride: player.mixedSideOverride,
      },
    ])
  );
}

function createActiveV3Player(
  userId: string
): ActiveMatchmakerV3Player<MatchmakerV3Player> {
  return {
    userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-01-01T00:00:00Z"),
    strength: 1000,
    effectiveMatchCount: 0,
    waitMs: 0,
    randomScore: 0,
    rank: 0,
  };
}

function createActiveLadderPlayer(
  userId: string
): ActiveMatchmakerLadderPlayer<MatchmakerLadderPlayer> {
  return {
    userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-01-01T00:00:00Z"),
    strength: 1000,
    wins: 0,
    losses: 0,
    pointDiff: 0,
    ladderScore: 0,
    effectiveMatchCount: 0,
    waitMs: 0,
    randomScore: 0,
    rank: 0,
  };
}

function createV3PlayersTuple(
  ids: [string, string, string, string]
): [
  ActiveMatchmakerV3Player<MatchmakerV3Player>,
  ActiveMatchmakerV3Player<MatchmakerV3Player>,
  ActiveMatchmakerV3Player<MatchmakerV3Player>,
  ActiveMatchmakerV3Player<MatchmakerV3Player>,
] {
  return ids.map((userId) => createActiveV3Player(userId)) as [
    ActiveMatchmakerV3Player<MatchmakerV3Player>,
    ActiveMatchmakerV3Player<MatchmakerV3Player>,
    ActiveMatchmakerV3Player<MatchmakerV3Player>,
    ActiveMatchmakerV3Player<MatchmakerV3Player>,
  ];
}

function createLadderPlayersTuple(
  ids: [string, string, string, string]
): [
  ActiveMatchmakerLadderPlayer<MatchmakerLadderPlayer>,
  ActiveMatchmakerLadderPlayer<MatchmakerLadderPlayer>,
  ActiveMatchmakerLadderPlayer<MatchmakerLadderPlayer>,
  ActiveMatchmakerLadderPlayer<MatchmakerLadderPlayer>,
] {
  return ids.map((userId) => createActiveLadderPlayer(userId)) as [
    ActiveMatchmakerLadderPlayer<MatchmakerLadderPlayer>,
    ActiveMatchmakerLadderPlayer<MatchmakerLadderPlayer>,
    ActiveMatchmakerLadderPlayer<MatchmakerLadderPlayer>,
    ActiveMatchmakerLadderPlayer<MatchmakerLadderPlayer>,
  ];
}

function createV3Selection(
  ids: [string, string, string, string],
  partition: { team1: [string, string]; team2: [string, string] }
): V3SingleCourtSelection<ActiveMatchmakerV3Player<MatchmakerV3Player>> {
  return {
    ids,
    players: createV3PlayersTuple(ids),
    partition,
    waitSummary: {
      totalWaitMs: 0,
      minimumWaitMs: 0,
      waitVector: [],
    },
    balanceGap: 0,
    exactRematchPenalty: 0,
    randomScore: 0,
  };
}

function createLadderSelection(
  ids: [string, string, string, string],
  partition: { team1: [string, string]; team2: [string, string] }
): LadderSingleCourtSelection<
  ActiveMatchmakerLadderPlayer<MatchmakerLadderPlayer>
> {
  return {
    ids,
    players: createLadderPlayersTuple(ids),
    partition,
    waitSummary: {
      totalWaitMs: 0,
      minimumWaitMs: 0,
      waitVector: [],
    },
    groupingSummary: {
      maxLadderGap: 0,
      totalLadderGap: 0,
      pointDiffSpread: 0,
      totalPointDiffGap: 0,
    },
    balanceGap: 0,
    pointDiffGap: 0,
    strengthGap: 0,
    randomScore: 0,
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
        excludedUserId: undefined,
        replaceUserId: undefined,
        matchType: undefined,
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
        excludedUserId: undefined,
        replaceUserId: undefined,
        matchType: undefined,
      });
    });

    it("accepts excluded-player reshuffles", () => {
      expect(
        parseGenerateMatchRequest({
          courtId: "court-1",
          forceReshuffle: true,
          excludedUserId: "player-1",
        })
      ).toEqual({
        requestedCourtIds: ["court-1"],
        forceReshuffle: true,
        undoCurrentMatch: false,
        manualTeams: undefined,
        excludedUserId: "player-1",
        replaceUserId: undefined,
        matchType: undefined,
      });
    });

    it("accepts replace-player requests", () => {
      expect(
        parseGenerateMatchRequest({
          courtId: "court-1",
          replaceUserId: "player-2",
        })
      ).toEqual({
        requestedCourtIds: ["court-1"],
        forceReshuffle: false,
        undoCurrentMatch: false,
        manualTeams: undefined,
        excludedUserId: undefined,
        replaceUserId: "player-2",
        matchType: undefined,
      });
    });

    it("accepts men's and women's court requests", () => {
      expect(
        parseGenerateMatchRequest({
          courtId: "court-1",
          matchType: "WOMENS",
        })
      ).toEqual({
        requestedCourtIds: ["court-1"],
        forceReshuffle: false,
        undoCurrentMatch: false,
        manualTeams: undefined,
        excludedUserId: undefined,
        replaceUserId: undefined,
        matchType: "WOMENS",
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
          "Reshuffle, undo, replace player, men's/women's court creation, and manual match creation are only supported for one court at a time."
        )
      );
    });

    it("rejects excluded-player reshuffle without reshuffle", () => {
      expect(() =>
        parseGenerateMatchRequest({
          courtId: "court-1",
          excludedUserId: "player-1",
        })
      ).toThrowError(
        new GenerateMatchError(
          400,
          "Excluded-player reshuffle must be combined with reshuffle."
        )
      );
    });

    it("rejects replace-player requests combined with reshuffle", () => {
      expect(() =>
        parseGenerateMatchRequest({
          courtId: "court-1",
          forceReshuffle: true,
          replaceUserId: "player-1",
        })
      ).toThrowError(
        new GenerateMatchError(
          400,
          "Replace player cannot be combined with reshuffle, undo, or manual match creation."
        )
      );
    });

    it("rejects invalid court match types", () => {
      expect(() =>
        parseGenerateMatchRequest({
          courtId: "court-1",
          matchType: "DOUBLES",
        })
      ).toThrowError(new GenerateMatchError(400, "Invalid court match type."));
    });

    it("rejects men's/women's court creation combined with manual creation", () => {
      expect(() =>
        parseGenerateMatchRequest({
          courtId: "court-1",
          matchType: "MENS",
          manualTeams: { team1: ["A", "B"], team2: ["C", "D"] },
        })
      ).toThrowError(
        new GenerateMatchError(
          400,
          "Men's/Women's court creation cannot be combined with reshuffle, undo, replace player, or manual match creation."
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
      });

      expect(selectedIds).toEqual(["A", "B", "C", "D"]);
    });

    it("allows manual override for cross-pool hybrid matches", () => {
      const players = [
        createSessionPlayer("M1", {
          gender: PlayerGender.MALE,
          pool: SessionPool.A,
        }),
        createSessionPlayer("M2", {
          gender: PlayerGender.MALE,
          pool: SessionPool.B,
        }),
        createSessionPlayer("F1", {
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          pool: SessionPool.A,
        }),
        createSessionPlayer("F2", {
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          pool: SessionPool.B,
        }),
      ];

      expect(
        validateManualMatchRequest({
          sessionData: createSessionData({
            mode: SessionMode.MIXICANO,
            poolsEnabled: true,
            players,
          }),
          targetCourt: createCourt("court-1"),
          parsedTeams: { team1: ["F1", "F2"], team2: ["M1", "M2"] },
          busyPlayerIds: new Set(),
        })
      ).toEqual(["F1", "F2", "M1", "M2"]);
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
        getRequestedOpenCourts([occupiedCourt, openCourt], new Set(["court-1"]))
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

  describe("ensureEnoughMatchTypePlayers", () => {
    it("throws a label-specific shortage error for side-filtered creation", () => {
      expect(() => ensureEnoughMatchTypePlayers("WOMENS", 3)).toThrowError(
        new GenerateMatchError(
          400,
          "Not enough available players for a Women's Court (need 4, have 3)."
        )
      );
    });
  });

  describe("getRankedCandidates", () => {
    it("uses the v3 effective baseline for ordering", () => {
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
          ?.matchmakingBaseline
      ).toBe(5);
      expect(rankedCandidates[rankedCandidates.length - 1]?.userId).toBe(
        "resumed"
      );
    });
  });

  describe("buildMatchmakingState", () => {
    it("uses community elo only for ratings sessions", async () => {
      vi.mocked(getCommunityEloByUserId).mockResolvedValue(
        new Map([
          ["A", 1440],
          ["B", 1330],
        ])
      );

      const players = [
        createSessionPlayer("A", { elo: 1100 }),
        createSessionPlayer("B", { elo: 1080 }),
      ];

      const eloState = await buildMatchmakingState(
        createSessionData({ type: SessionType.ELO, players })
      );

      expect(getCommunityEloByUserId).toHaveBeenCalledTimes(1);
      expect(eloState.playersById.get("A")?.elo).toBe(1440);
      expect(eloState.playersById.get("B")?.elo).toBe(1330);
    });

    it("ignores external elo for race sessions", async () => {
      const players = [
        createSessionPlayer("A", { elo: 1600 }),
        createSessionPlayer("B", { elo: 900 }),
      ];

      const raceState = await buildMatchmakingState(
        createSessionData({ type: SessionType.RACE, players })
      );

      expect(getCommunityEloByUserId).not.toHaveBeenCalled();
      expect(raceState.playersById.get("A")?.elo).toBe(0);
      expect(raceState.playersById.get("B")?.elo).toBe(0);
    });
  });

  describe("selectSingleCourtMatch", () => {
    it("filters women's court requests by effective side instead of raw gender", () => {
      const players = [
        createSessionPlayer("male-upper"),
        createSessionPlayer("male-lower", {
          mixedSideOverride: MixedSide.LOWER,
        }),
        createSessionPlayer("female-lower", {
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        }),
        createSessionPlayer("female-upper", {
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.OPEN,
          mixedSideOverride: MixedSide.UPPER,
        }),
      ];
      const sessionData = createSessionData({
        mode: SessionMode.MIXICANO,
        players,
      });
      const { rankedCandidates } = getRankedCandidates(sessionData, new Set());

      expect(
        filterRankedCandidatesByMatchType(rankedCandidates, sessionData, "WOMENS")
          .map((candidate) => candidate.userId)
          .sort()
      ).toEqual(["female-lower", "male-lower"]);
    });

    it("throws when no valid pairing exists", () => {
      vi.mocked(findBestSingleCourtSelectionV3).mockReturnValueOnce({
        selection: null,
        debug: {} as never,
      });

      expect(() =>
        selectSingleCourtMatch({
          rankedCandidates: [] as ReturnType<
            typeof getRankedCandidates
          >["rankedCandidates"],
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
      const selection = createV3Selection(["A", "B", "C", "D"], {
        team1: ["A", "B"],
        team2: ["C", "D"],
      });
      vi.mocked(findBestSingleCourtSelectionV3).mockReturnValueOnce({
        selection,
        debug: {} as never,
      });

      const players = [
        createSessionPlayer("A"),
        createSessionPlayer("B"),
        createSessionPlayer("C"),
        createSessionPlayer("D"),
      ];

      expect(
        selectSingleCourtMatch({
          rankedCandidates: [] as ReturnType<
            typeof getRankedCandidates
          >["rankedCandidates"],
          playersById: createPlayersById(players),
          sessionData: createSessionData({ players }),
          rotationHistory: buildRotationHistory([]),
          reshuffleSource: null,
        })
      ).toEqual(selection);
    });

    it("uses the ladder selector for ladder sessions", () => {
      const selection = createLadderSelection(["A", "B", "C", "D"], {
        team1: ["A", "B"],
        team2: ["C", "D"],
      });
      vi.mocked(findBestSingleCourtSelectionLadder).mockReturnValueOnce({
        selection,
        debug: {} as never,
      });

      const players = [
        createSessionPlayer("A"),
        createSessionPlayer("B"),
        createSessionPlayer("C"),
        createSessionPlayer("D"),
      ];

      expect(
        selectSingleCourtMatch({
          rankedCandidates: [] as ReturnType<
            typeof getRankedCandidates
          >["rankedCandidates"],
          playersById: createPlayersById(players),
          sessionData: createSessionData({
            type: SessionType.LADDER,
            players,
          }),
          rotationHistory: buildRotationHistory([]),
          reshuffleSource: null,
        })
      ).toEqual(selection);
      expect(findBestSingleCourtSelectionV3).not.toHaveBeenCalled();
    });

    it("uses the ladder selector for race sessions", () => {
      const selection = createLadderSelection(["A", "B", "C", "D"], {
        team1: ["A", "B"],
        team2: ["C", "D"],
      });
      vi.mocked(findBestSingleCourtSelectionLadder).mockReturnValueOnce({
        selection,
        debug: {} as never,
      });

      const players = [
        createSessionPlayer("A"),
        createSessionPlayer("B"),
        createSessionPlayer("C"),
        createSessionPlayer("D"),
      ];

      expect(
        selectSingleCourtMatch({
          rankedCandidates: [] as ReturnType<
            typeof getRankedCandidates
          >["rankedCandidates"],
          playersById: createPlayersById(players),
          sessionData: createSessionData({
            type: SessionType.RACE,
            players,
          }),
          rotationHistory: buildRotationHistory([]),
          reshuffleSource: null,
        })
      ).toEqual(selection);
      expect(findBestSingleCourtSelectionV3).not.toHaveBeenCalled();
    });

    it("allows immediate crossover when no pool can field a same-pool quartet", () => {
      const crossoverSelection = createLadderSelection(
        ["A1", "A2", "B1", "B2"],
        {
          team1: ["A1", "B1"],
          team2: ["A2", "B2"],
        }
      );

      vi.mocked(findBestSingleCourtSelectionLadder).mockImplementation(
        (players, options) => {
          const activeIds = players
            .filter((player) => !player.isBusy)
            .map((player) => player.userId)
            .sort()
            .join("|");

          if (activeIds === "A1|A2|A3|A4" || activeIds === "B1|B2|B3|B4") {
            return { selection: null, debug: {} as never };
          }

          if (
            activeIds === "A1|A2|A3|A4|B1|B2|B3|B4" &&
            options.targetPool === SessionPool.A &&
            options.minimumTargetPoolPlayers === 2
          ) {
            return { selection: crossoverSelection, debug: {} as never };
          }

          return { selection: null, debug: {} as never };
        }
      );

      const players = [
        createSessionPlayer("A1", { pool: SessionPool.A }),
        createSessionPlayer("A2", { pool: SessionPool.A }),
        createSessionPlayer("A3", { pool: SessionPool.A }),
        createSessionPlayer("A4", { pool: SessionPool.A }),
        createSessionPlayer("B1", { pool: SessionPool.B }),
        createSessionPlayer("B2", { pool: SessionPool.B }),
        createSessionPlayer("B3", { pool: SessionPool.B }),
        createSessionPlayer("B4", { pool: SessionPool.B }),
      ];
      const sessionData = createSessionData({
        type: SessionType.RACE,
        mode: SessionMode.MIXICANO,
        poolsEnabled: true,
        players,
      });
      const { rankedCandidates } = getRankedCandidates(sessionData, new Set());

      expect(
        selectSingleCourtMatch({
          rankedCandidates,
          playersById: createPlayersById(players),
          sessionData,
          rotationHistory: buildRotationHistory([]),
          reshuffleSource: null,
        })
      ).toEqual({
        ...crossoverSelection,
        targetPool: SessionPool.A,
        missedPool: null,
      });
    });

    it("reshuffles ladder sessions to an alternative quartet when possible", () => {
      const initial = createLadderSelection(["A", "B", "C", "D"], {
        team1: ["A", "B"],
        team2: ["C", "D"],
      });
      const alternative = createLadderSelection(["A", "B", "E", "F"], {
        team1: ["A", "E"],
        team2: ["B", "F"],
      });
      vi.mocked(findBestSingleCourtSelectionLadder)
        .mockReturnValueOnce({ selection: initial, debug: {} as never })
        .mockReturnValueOnce({ selection: alternative, debug: {} as never });

      const players = [
        createSessionPlayer("A"),
        createSessionPlayer("B"),
        createSessionPlayer("C"),
        createSessionPlayer("D"),
        createSessionPlayer("E"),
        createSessionPlayer("F"),
      ];

      expect(
        selectSingleCourtMatch({
          rankedCandidates: [] as ReturnType<
            typeof getRankedCandidates
          >["rankedCandidates"],
          playersById: createPlayersById(players),
          sessionData: createSessionData({
            type: SessionType.RACE,
            players,
          }),
          rotationHistory: buildRotationHistory([]),
          reshuffleSource: {
            ids: ["A", "B", "C", "D"],
            partition: { team1: ["A", "B"], team2: ["C", "D"] },
          },
        })
      ).toEqual(alternative);
      expect(findBestSingleCourtSelectionLadder).toHaveBeenNthCalledWith(
        2,
        expect.any(Array),
        expect.objectContaining({
          excludedQuartetKey: "A|B|C|D",
        })
      );
    });

    it("throws when competitive reshuffle has no valid alternative", () => {
      const initial = createLadderSelection(["A", "B", "C", "D"], {
        team1: ["A", "B"],
        team2: ["C", "D"],
      });
      vi.mocked(findBestSingleCourtSelectionLadder)
        .mockReturnValueOnce({ selection: initial, debug: {} as never })
        .mockReturnValueOnce({ selection: null, debug: {} as never })
        .mockReturnValueOnce({ selection: null, debug: {} as never });

      const players = [
        createSessionPlayer("A"),
        createSessionPlayer("B"),
        createSessionPlayer("C"),
        createSessionPlayer("D"),
      ];

      expect(() =>
        selectSingleCourtMatch({
          rankedCandidates: [] as ReturnType<
            typeof getRankedCandidates
          >["rankedCandidates"],
          playersById: createPlayersById(players),
          sessionData: createSessionData({
            type: SessionType.LADDER,
            players,
          }),
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

    it("falls back to an alternative quartet when reshuffle repeats the same players", () => {
      const initial = createV3Selection(["A", "B", "C", "D"], {
        team1: ["A", "B"],
        team2: ["C", "D"],
      });
      const alternative = createV3Selection(["A", "B", "E", "F"], {
        team1: ["A", "E"],
        team2: ["B", "F"],
      });
      vi.mocked(findBestSingleCourtSelectionV3)
        .mockReturnValueOnce({ selection: initial, debug: {} as never })
        .mockReturnValueOnce({ selection: alternative, debug: {} as never });

      const players = [
        createSessionPlayer("A"),
        createSessionPlayer("B"),
        createSessionPlayer("C"),
        createSessionPlayer("D"),
        createSessionPlayer("E"),
        createSessionPlayer("F"),
      ];

      expect(
        selectSingleCourtMatch({
          rankedCandidates: [] as ReturnType<
            typeof getRankedCandidates
          >["rankedCandidates"],
          playersById: createPlayersById(players),
          sessionData: createSessionData({ players }),
          rotationHistory: buildRotationHistory([]),
          reshuffleSource: {
            ids: ["A", "B", "C", "D"],
            partition: { team1: ["A", "B"], team2: ["C", "D"] },
          },
        })
      ).toEqual(alternative);
    });

    it("falls back to an alternative partition when only the same partition repeats", () => {
      const initial = createV3Selection(["A", "B", "C", "D"], {
        team1: ["A", "B"],
        team2: ["C", "D"],
      });
      const alternative = createV3Selection(["A", "B", "C", "D"], {
        team1: ["A", "C"],
        team2: ["B", "D"],
      });
      vi.mocked(findBestSingleCourtSelectionV3)
        .mockReturnValueOnce({ selection: initial, debug: {} as never })
        .mockReturnValueOnce({ selection: null, debug: {} as never })
        .mockReturnValueOnce({ selection: alternative, debug: {} as never });

      const players = [
        createSessionPlayer("A"),
        createSessionPlayer("B"),
        createSessionPlayer("C"),
        createSessionPlayer("D"),
      ];

      expect(
        selectSingleCourtMatch({
          rankedCandidates: [] as ReturnType<
            typeof getRankedCandidates
          >["rankedCandidates"],
          playersById: createPlayersById(players),
          sessionData: createSessionData({ players }),
          rotationHistory: buildRotationHistory([]),
          reshuffleSource: {
            ids: ["A", "B", "C", "D"],
            partition: { team1: ["A", "B"], team2: ["C", "D"] },
          },
        })
      ).toEqual(alternative);
    });

    it("throws when reshuffle has no valid alternative", () => {
      const initial = createV3Selection(["A", "B", "C", "D"], {
        team1: ["A", "B"],
        team2: ["C", "D"],
      });
      vi.mocked(findBestSingleCourtSelectionV3)
        .mockReturnValueOnce({ selection: initial, debug: {} as never })
        .mockReturnValueOnce({ selection: null, debug: {} as never })
        .mockReturnValueOnce({ selection: null, debug: {} as never });

      const players = [
        createSessionPlayer("A"),
        createSessionPlayer("B"),
        createSessionPlayer("C"),
        createSessionPlayer("D"),
      ];

      expect(() =>
        selectSingleCourtMatch({
          rankedCandidates: [] as ReturnType<
            typeof getRankedCandidates
          >["rankedCandidates"],
          playersById: createPlayersById(players),
          sessionData: createSessionData({ players }),
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
      const batchSelection: V3BatchSelection<
        ActiveMatchmakerV3Player<MatchmakerV3Player>
      > = {
        selections: [
          createV3Selection(["A", "B", "C", "D"], {
            team1: ["A", "B"],
            team2: ["C", "D"],
          }),
        ],
        waitSummary: {
          totalWaitMs: 0,
          minimumWaitMs: 0,
          waitVector: [],
        },
        maxBalanceGap: 0,
        totalBalanceGap: 0,
        totalExactRematchPenalty: 0,
        totalRandomScore: 0,
      };
      vi.mocked(findBestBatchSelectionV3).mockReturnValueOnce({
        selection: batchSelection,
        debug: {} as never,
      });

      const players = [
        createSessionPlayer("A"),
        createSessionPlayer("B"),
        createSessionPlayer("C"),
        createSessionPlayer("D"),
      ];

      expect(
        selectBatchMatches({
          rankedCandidates: [] as ReturnType<
            typeof getRankedCandidates
          >["rankedCandidates"],
          playersById: createPlayersById(players),
          sessionData: createSessionData({ players }),
          rotationHistory: buildRotationHistory([]),
          requestedMatchCount: 1,
        })
      ).toEqual(batchSelection);
    });

    it("uses the ladder batch selector for ladder sessions", () => {
      const batchSelection: LadderBatchSelection<
        ActiveMatchmakerLadderPlayer<MatchmakerLadderPlayer>
      > = {
        selections: [
          createLadderSelection(["A", "B", "C", "D"], {
            team1: ["A", "B"],
            team2: ["C", "D"],
          }),
        ],
        waitSummary: {
          totalWaitMs: 0,
          minimumWaitMs: 0,
          waitVector: [],
        },
        maxLadderGap: 0,
        totalLadderGap: 0,
        totalPointDiffGap: 0,
        maxBalanceGap: 0,
        totalBalanceGap: 0,
        maxPointDiffBalanceGap: 0,
        totalPointDiffBalanceGap: 0,
        maxStrengthGap: 0,
        totalStrengthGap: 0,
        totalRandomScore: 0,
      };
      vi.mocked(findBestBatchSelectionLadder).mockReturnValueOnce({
        selection: batchSelection,
        debug: {} as never,
      });

      const players = [
        createSessionPlayer("A"),
        createSessionPlayer("B"),
        createSessionPlayer("C"),
        createSessionPlayer("D"),
      ];

      expect(
        selectBatchMatches({
          rankedCandidates: [] as ReturnType<
            typeof getRankedCandidates
          >["rankedCandidates"],
          playersById: createPlayersById(players),
          sessionData: createSessionData({
            type: SessionType.LADDER,
            players,
          }),
          rotationHistory: buildRotationHistory([]),
          requestedMatchCount: 1,
        })
      ).toEqual(batchSelection);
      expect(findBestBatchSelectionV3).not.toHaveBeenCalled();
    });

    it("uses the ladder batch selector for race sessions", () => {
      const batchSelection: LadderBatchSelection<
        ActiveMatchmakerLadderPlayer<MatchmakerLadderPlayer>
      > = {
        selections: [
          createLadderSelection(["A", "B", "C", "D"], {
            team1: ["A", "B"],
            team2: ["C", "D"],
          }),
        ],
        waitSummary: {
          totalWaitMs: 0,
          minimumWaitMs: 0,
          waitVector: [],
        },
        maxLadderGap: 0,
        totalLadderGap: 0,
        totalPointDiffGap: 0,
        maxBalanceGap: 0,
        totalBalanceGap: 0,
        maxPointDiffBalanceGap: 0,
        totalPointDiffBalanceGap: 0,
        maxStrengthGap: 0,
        totalStrengthGap: 0,
        totalRandomScore: 0,
      };
      vi.mocked(findBestBatchSelectionLadder).mockReturnValueOnce({
        selection: batchSelection,
        debug: {} as never,
      });

      const players = [
        createSessionPlayer("A"),
        createSessionPlayer("B"),
        createSessionPlayer("C"),
        createSessionPlayer("D"),
      ];

      expect(
        selectBatchMatches({
          rankedCandidates: [] as ReturnType<
            typeof getRankedCandidates
          >["rankedCandidates"],
          playersById: createPlayersById(players),
          sessionData: createSessionData({
            type: SessionType.RACE,
            players,
          }),
          rotationHistory: buildRotationHistory([]),
          requestedMatchCount: 1,
        })
      ).toEqual(batchSelection);
      expect(findBestBatchSelectionV3).not.toHaveBeenCalled();
    });

    it("backtracks across pool-aware quartets instead of failing the whole batch", () => {
      const firstQuartet = createLadderSelection(["A1", "A2", "A5", "A6"], {
        team1: ["A1", "A5"],
        team2: ["A2", "A6"],
      });
      const fallbackFirstQuartet = createLadderSelection(
        ["A1", "A3", "A5", "A6"],
        {
          team1: ["A1", "A5"],
          team2: ["A3", "A6"],
        }
      );
      const secondQuartet = createLadderSelection(["A2", "A4", "B1", "B2"], {
        team1: ["A2", "B1"],
        team2: ["A4", "B2"],
      });
      const firstQuartetKey = "A1|A2|A5|A6";

      vi.mocked(findBestSingleCourtSelectionLadder).mockImplementation(
        (players, options) => {
          const activeIds = players
            .filter((player) => !player.isBusy)
            .map((player) => player.userId)
            .sort()
            .join("|");

          if (activeIds === "A1|A2|A3|A4|A5|A6") {
            return {
              selection: options.excludedQuartetKeys?.has(firstQuartetKey)
                ? fallbackFirstQuartet
                : firstQuartet,
              debug: {} as never,
            };
          }

          if (activeIds === "B1|B2|B3|B4") {
            return { selection: null, debug: {} as never };
          }

          if (
            activeIds === "A2|A4|B1|B2|B3|B4" &&
            options.targetPool === SessionPool.B &&
            options.minimumTargetPoolPlayers === 2
          ) {
            return { selection: secondQuartet, debug: {} as never };
          }

          return { selection: null, debug: {} as never };
        }
      );

      const players = [
        createSessionPlayer("A1", { pool: SessionPool.A }),
        createSessionPlayer("A2", { pool: SessionPool.A }),
        createSessionPlayer("A3", { pool: SessionPool.A }),
        createSessionPlayer("A4", { pool: SessionPool.A }),
        createSessionPlayer("A5", { pool: SessionPool.A }),
        createSessionPlayer("A6", { pool: SessionPool.A }),
        createSessionPlayer("B1", { pool: SessionPool.B }),
        createSessionPlayer("B2", { pool: SessionPool.B }),
        createSessionPlayer("B3", { pool: SessionPool.B }),
        createSessionPlayer("B4", { pool: SessionPool.B }),
      ];
      const sessionData = createSessionData({
        type: SessionType.RACE,
        mode: SessionMode.MIXICANO,
        poolsEnabled: true,
        players,
      });
      const { rankedCandidates } = getRankedCandidates(sessionData, new Set());

      expect(
        selectBatchMatches({
          rankedCandidates,
          playersById: createPlayersById(players),
          sessionData,
          rotationHistory: buildRotationHistory([]),
          requestedMatchCount: 2,
        })
      ).toEqual({
        selections: [
          {
            ...fallbackFirstQuartet,
            targetPool: SessionPool.A,
            missedPool: null,
          },
          {
            ...secondQuartet,
            targetPool: SessionPool.B,
            missedPool: null,
          },
        ],
        poolSchedulingState: expect.objectContaining({
          poolACourtAssignments: 1,
          poolBCourtAssignments: 1,
        }),
      });
    });

    it("throws when no valid batch selection exists", () => {
      vi.mocked(findBestBatchSelectionV3).mockReturnValueOnce({
        selection: null,
        debug: {} as never,
      });

      expect(() =>
        selectBatchMatches({
          rankedCandidates: [] as ReturnType<
            typeof getRankedCandidates
          >["rankedCandidates"],
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
