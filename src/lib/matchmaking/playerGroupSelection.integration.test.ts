import { describe, expect, it } from "vitest";
import {
  compareGroupedBatchSelections,
  evaluateBalancedMixedRotationBatchCandidate,
  getRankedCandidates,
  selectBatchMatches,
  selectSingleCourtMatch,
} from "@/app/api/sessions/[code]/generate-match/selection";
import type { GenerateMatchSession } from "@/app/api/sessions/[code]/generate-match/shared";
import { buildRotationHistory } from "@/lib/matchmaking/partitioning";
import { buildMixedVarietyContext } from "@/lib/matchmaking/v3/mixedVariety";
import { getBalancedMixedBatchCategoryPenalty } from "@/lib/matchmaking/v3/balancedMixedRotation";
import {
  CourtGroupType,
  MatchStatus,
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionPool,
  SessionType,
} from "@/types/enums";

function createPlayer(
  userId: string,
  pool: SessionPool,
  gender = PlayerGender.MALE
) {
  const availableSince = new Date("2026-08-23T00:00:00Z");

  return {
    userId,
    matchesPlayed: 0,
    matchmakingMatchesCredit: 0,
    availableSince,
    joinedAt: availableSince,
    ladderEntryAt: availableSince,
    arrivalPriorityAt: null,
    sessionPoints: 0,
    isPaused: false,
    isGuest: false,
    needsMoreRest: false,
    gender,
    partnerPreference: PartnerPreference.OPEN,
    mixedSideOverride: null,
    pool,
    lastPartnerId: null,
    user: { id: userId, name: userId, elo: 1000 },
  };
}

describe("player-group batch selection", () => {
  it("fills the three-court 12 Competitive / 9 Social office workflow", () => {
    const players = [
      ...Array.from({ length: 12 }, (_, index) =>
        createPlayer(`A${index + 1}`, SessionPool.A)
      ),
      ...Array.from({ length: 9 }, (_, index) =>
        createPlayer(`B${index + 1}`, SessionPool.B)
      ),
    ];
    const sessionData = {
      id: "session-1",
      code: "GROUPS",
      clubId: "club-1",
      type: SessionType.ELO,
      mode: SessionMode.MEXICANO,
      poolsEnabled: true,
      respectPlayerRest: true,
      courts: [
        { id: "court-1" },
        { id: "court-2" },
        { id: "court-3" },
      ],
      players,
      matches: [],
      queuedMatch: null,
      sessionClubs: [],
    } as unknown as GenerateMatchSession;
    const { rankedCandidates } = getRankedCandidates(sessionData, new Set());
    const playersById = new Map(
      players.map((player) => [
        player.userId,
        {
          userId: player.userId,
          elo: player.user.elo,
          pointDiff: 0,
          gender: player.gender,
          partnerPreference: player.partnerPreference,
          mixedSideOverride: player.mixedSideOverride,
          pool: player.pool,
          lastPartnerId: player.lastPartnerId,
        },
      ])
    );

    const result = selectBatchMatches({
      rankedCandidates,
      playersById,
      sessionData,
      rotationHistory: buildRotationHistory([]),
      requestedMatchCount: 3,
      requestedCourtIds: ["court-1", "court-2", "court-3"],
      randomFn: () => 0,
    });

    expect(result.selections).toHaveLength(3);
    expect(
      result.selections
        .map((selection) =>
          "courtGroupType" in selection ? selection.courtGroupType : null
        )
        .sort()
    ).toEqual(
      [
        CourtGroupType.COMPETITIVE,
        CourtGroupType.CROSSOVER,
        CourtGroupType.SOCIAL,
      ].sort()
    );
    expect(new Set(result.selections.flatMap((selection) => selection.ids)).size)
      .toBe(12);
  });

  it("returns two courts when three are requested but only eight players wait", () => {
    const players = [
      ...Array.from({ length: 4 }, (_, index) =>
        createPlayer(`A${index + 1}`, SessionPool.A)
      ),
      ...Array.from({ length: 4 }, (_, index) =>
        createPlayer(`B${index + 1}`, SessionPool.B)
      ),
    ];
    const sessionData = {
      id: "session-2",
      code: "PARTIAL",
      clubId: "club-1",
      type: SessionType.ELO,
      mode: SessionMode.MEXICANO,
      poolsEnabled: true,
      respectPlayerRest: true,
      courts: [
        { id: "court-1" },
        { id: "court-2" },
        { id: "court-3" },
      ],
      players,
      matches: [],
      queuedMatch: null,
      sessionClubs: [],
    } as unknown as GenerateMatchSession;
    const { rankedCandidates } = getRankedCandidates(sessionData, new Set());
    const playersById = new Map(
      players.map((player) => [
        player.userId,
        {
          userId: player.userId,
          elo: player.user.elo,
          pointDiff: 0,
          gender: player.gender,
          partnerPreference: player.partnerPreference,
          mixedSideOverride: player.mixedSideOverride,
          pool: player.pool,
          lastPartnerId: player.lastPartnerId,
        },
      ])
    );

    const result = selectBatchMatches({
      rankedCandidates,
      playersById,
      sessionData,
      rotationHistory: buildRotationHistory([]),
      requestedMatchCount: 3,
      requestedCourtIds: ["court-1", "court-2", "court-3"],
      randomFn: () => 0,
    });

    expect(result.selections).toHaveLength(2);
  });

  it("falls from three courts to two when Mixed constraints make the third infeasible", () => {
    const groupPlayers = (pool: SessionPool) => [
      createPlayer(`${pool}-M1`, pool, PlayerGender.MALE),
      createPlayer(`${pool}-M2`, pool, PlayerGender.MALE),
      createPlayer(`${pool}-F1`, pool, PlayerGender.FEMALE),
      createPlayer(`${pool}-F2`, pool, PlayerGender.FEMALE),
      createPlayer(`${pool}-U1`, pool, PlayerGender.UNSPECIFIED),
      createPlayer(`${pool}-U2`, pool, PlayerGender.UNSPECIFIED),
    ];
    const players = [
      ...groupPlayers(SessionPool.A),
      ...groupPlayers(SessionPool.B),
    ];
    const sessionData = {
      id: "session-3",
      code: "CONSTRAINED",
      clubId: "club-1",
      type: SessionType.ELO,
      mode: SessionMode.MIXICANO,
      poolsEnabled: true,
      respectPlayerRest: true,
      courts: [
        { id: "court-1" },
        { id: "court-2" },
        { id: "court-3" },
      ],
      players,
      matches: [],
      queuedMatch: null,
      sessionClubs: [],
    } as unknown as GenerateMatchSession;
    const { rankedCandidates } = getRankedCandidates(sessionData, new Set());
    const playersById = new Map(
      players.map((player) => [
        player.userId,
        {
          userId: player.userId,
          elo: player.user.elo,
          pointDiff: 0,
          gender: player.gender,
          partnerPreference: player.partnerPreference,
          mixedSideOverride: player.mixedSideOverride,
          pool: player.pool,
          lastPartnerId: player.lastPartnerId,
        },
      ])
    );

    const result = selectBatchMatches({
      rankedCandidates,
      playersById,
      sessionData,
      rotationHistory: buildRotationHistory([]),
      requestedMatchCount: 3,
      requestedCourtIds: ["court-1", "court-2", "court-3"],
      randomFn: () => 0,
    });

    expect(result.selections).toHaveLength(2);
    expect(
      result.selections.every(
        (selection) =>
          "courtGroupType" in selection && selection.courtGroupType !== null
      )
    ).toBe(true);
  });
});

describe("Balanced + Mixed grouped batch ordering", () => {
  it("keeps shared-court novelty ahead of a better format-composition score", () => {
    const availableSince = new Date("2026-08-23T00:00:00Z");
    const players = Array.from({ length: 16 }, (_, index) => {
      const isUpper = index < 8;
      const sideIndex = (index % 8) + 1;
      const userId = `${isUpper ? "U" : "L"}${sideIndex}`;
      return {
        userId,
        matchesPlayed: 1,
        matchmakingBaseline: 1,
        effectiveMatchCount: 1,
        availableSince,
        restTurns: 0,
        needsMoreRest: false,
        moreRestTarget: 0,
        moreRestDeficit: 0,
        randomScore: 0,
        rank: index,
        strength: 1000,
        gender: isUpper ? PlayerGender.MALE : PlayerGender.FEMALE,
        mixedSideOverride: null,
        partnerPreference: isUpper
          ? PartnerPreference.OPEN
          : PartnerPreference.FEMALE_FLEX,
      };
    });
    const playerById = new Map(players.map((player) => [player.userId, player]));
    const history = [
      { team1: ["U1", "U2"] as [string, string], team2: ["U3", "U4"] as [string, string] },
      { team1: ["U5", "L5"] as [string, string], team2: ["U6", "L6"] as [string, string] },
      { team1: ["U7", "L7"] as [string, string], team2: ["U8", "L8"] as [string, string] },
      { team1: ["U5", "L6"] as [string, string], team2: ["U7", "L8"] as [string, string] },
    ];
    const completedHistory = history.map((match, index) => ({
      ...match,
      team1Score: 11,
      team2Score: 9,
      status: MatchStatus.COMPLETED,
      completedAt: new Date(availableSince.getTime() + index * 60_000),
    }));
    const context = buildMixedVarietyContext(players, history);

    const makeSelection = (
      ids: [string, string, string, string],
      team1: [string, string],
      team2: [string, string],
      sharedCourtRepeatPenalty: number,
      sharedCourtEncounterFrequencyPenalty: number,
      mixedGame: boolean
    ) => ({
      ids,
      players: ids.map((id) => playerById.get(id)!) as [
        (typeof players)[number],
        (typeof players)[number],
        (typeof players)[number],
        (typeof players)[number],
      ],
      partition: { team1, team2 },
      restSummary: {
        totalRestTurns: 0,
        minimumRestTurns: 0,
        restTurnVector: [0, 0, 0, 0],
      },
      balanceGap: 0,
      pointDiffGap: 0,
      sharedCourtRepeatPenalty,
      sharedCourtEncounterFrequencyPenalty,
      partnerCoveragePenalty: 0,
      opponentCoveragePenalty: 0,
      partnerRepeatPenalty: 0,
      opponentRepeatPenalty: 0,
      exactRematchPenalty: 0,
      mixedVarietyPenalty: 0,
      mixedGame,
      consecutivePlayCount: 0,
      consecutivePlayMaxBurden: 0,
      consecutivePlayTotalBurden: 0,
      randomScore: 0,
      pairingRandomScore: 0,
      courtGroupType: CourtGroupType.COMPETITIVE,
      poolASeatCount: 4,
      poolBSeatCount: 0,
      targetPool: SessionPool.A,
      missedPool: null,
      competitiveTargetRatio: 1,
    });

    const compositionPreferred = [
      makeSelection(
        ["U1", "U2", "U3", "U4"],
        ["U1", "U2"],
        ["U3", "U4"],
        6,
        6,
        false
      ),
      makeSelection(
        ["L1", "L2", "L3", "L4"],
        ["L1", "L2"],
        ["L3", "L4"],
        0,
        0,
        false
      ),
    ];
    const varietyPreferred = [
      makeSelection(
        ["U1", "U3", "L1", "L3"],
        ["U1", "L1"],
        ["U3", "L3"],
        1,
        1,
        true
      ),
      makeSelection(
        ["U2", "U4", "L2", "L4"],
        ["U2", "L2"],
        ["U4", "L4"],
        1,
        1,
        true
      ),
    ];
    const sessionData = {
      type: SessionType.ELO,
      mode: SessionMode.MIXICANO,
      respectPlayerRest: true,
    } as GenerateMatchSession;
    const rotationPolicy = {
      baselineSelections: compositionPreferred,
      context,
      players,
      completedMatches: completedHistory,
      outstandingMatchCountByUserId: new Map<string, number>(),
      pendingObligations: [],
    } as NonNullable<Parameters<typeof compareGroupedBatchSelections>[3]>;
    const compositionPreferredSelections = compositionPreferred as unknown as
      Parameters<typeof compareGroupedBatchSelections>[0];
    const varietyPreferredSelections = varietyPreferred as unknown as
      Parameters<typeof compareGroupedBatchSelections>[0];

    expect(
      getBalancedMixedBatchCategoryPenalty(context, compositionPreferred)
    ).toBeLessThan(
      getBalancedMixedBatchCategoryPenalty(context, varietyPreferred)
    );
    expect(
      compareGroupedBatchSelections(
        varietyPreferredSelections,
        compositionPreferredSelections,
        sessionData,
        rotationPolicy
      )
    ).toBeLessThan(0);
    const exposureImprovement = compareGroupedBatchSelections(
      varietyPreferredSelections,
      compositionPreferredSelections,
      sessionData,
      rotationPolicy
    );
    const rotationDecision = evaluateBalancedMixedRotationBatchCandidate({
      baselineSelections: compositionPreferred,
      candidateSelections: varietyPreferred,
      players,
      outstandingMatchCountByUserId: new Map(),
      completedMatches: completedHistory,
      pendingObligations: [],
      sessionType: SessionType.ELO,
      respectPlayerRest: true,
      improvesOtherRotationGoal: exposureImprovement < 0,
    });
    expect(rotationDecision.accepted).toBe(true);

    const compositionTieBaseline = compositionPreferred.map((selection) => ({
      ...selection,
      sharedCourtRepeatPenalty: 1,
      sharedCourtEncounterFrequencyPenalty: 1,
    }));
    const compositionTieVariety = varietyPreferred.map((selection) => ({
      ...selection,
      sharedCourtRepeatPenalty: 1,
      sharedCourtEncounterFrequencyPenalty: 1,
    }));
    const tiedRotationPolicy = {
      ...rotationPolicy,
      baselineSelections: compositionTieBaseline,
    } as NonNullable<Parameters<typeof compareGroupedBatchSelections>[3]>;
    expect(
      compareGroupedBatchSelections(
        compositionTieBaseline as unknown as Parameters<
          typeof compareGroupedBatchSelections
        >[0],
        compositionTieVariety as unknown as Parameters<
          typeof compareGroupedBatchSelections
        >[0],
        sessionData,
        tiedRotationPolicy
      )
    ).toBeLessThan(0);
  });
});

describe("grouped no-catch-up crossover selection", () => {
  it.each(
    [SessionType.ELO, SessionType.LADDER, SessionType.RACE].flatMap((type) =>
      ["single", "batch"].flatMap((path) =>
        [1, 3].map((actualMatches) => ({ type, path, actualMatches }))
      )
    )
  )("uses actual crossover participation for $type/$path after $actualMatches games", ({ type, path, actualMatches }) => {
    const regulars = [
      createPlayer("A1", SessionPool.A),
      createPlayer("A2", SessionPool.A),
      createPlayer("B1", SessionPool.B),
      createPlayer("B2", SessionPool.B),
    ].map((player) => ({ ...player, matchesPlayed: 9 }));
    const returningPlayer = {
      ...createPlayer("Returning", SessionPool.A),
      // In a batch, verify that playing once more moves them behind the
      // nine-game band despite still having fewer visible games.
      matchesPlayed: actualMatches + (path === "batch" ? 1 : 0),
      matchmakingMatchesCredit: 9 - actualMatches,
      availableSince: new Date("2026-08-24T00:00:00Z"),
      // Their first priority match has already been played.
      arrivalPriorityAt: null,
    };
    const players = [...regulars, returningPlayer];
    // Four crossovers in fourteen assignments: the next crossover is due.
    // Regulars have three appearances; the returning player has one.
    const matches = Array.from({ length: 14 }, (_, index) => ({
      id: `history-${index}`,
      courtId: "court-1",
      createdAt: new Date("2026-08-22T00:00:00Z"),
      completedAt: new Date("2026-08-22T00:10:00Z"),
      status: MatchStatus.COMPLETED,
      courtGroupType: index < 4 ? CourtGroupType.CROSSOVER : CourtGroupType.SOCIAL,
      poolASeatCount: index < 4 ? 2 : 0,
      poolBSeatCount: index < 4 ? 2 : 4,
      team1User1Id: index < 3 ? "A1" : index === 3 ? "Returning" : "past-1",
      team1User2Id: index < 3 ? "B1" : "past-2",
      team2User1Id: index < 3 ? "A2" : "past-3",
      team2User2Id: index < 3 ? "B2" : "past-4",
      team1Score: 11,
      team2Score: 11,
    }));
    const sessionData = {
      id: "no-catch-up",
      type,
      mode: SessionMode.MEXICANO,
      poolsEnabled: true,
      respectPlayerRest: true,
      courts: [{ id: "court-1" }],
      players,
      matches,
      queuedMatch: null,
      sessionClubs: [],
    } as unknown as GenerateMatchSession;
    const { rankedCandidates } = getRankedCandidates(sessionData, new Set());
    const input = {
      rankedCandidates,
      sessionData,
      playersById: new Map(players.map((player) => [
        player.userId,
        { ...player, elo: 1000, pointDiff: 0 },
      ])),
      rotationHistory: buildRotationHistory([]),
    };
    const selection = path === "single"
      ? selectSingleCourtMatch({ ...input, reshuffleSource: null })
      : selectBatchMatches({ ...input, requestedMatchCount: 1 }).selections[0];

    expect(selection.courtGroupType).toBe(CourtGroupType.CROSSOVER);
    // Single-court ties use actual crossover debt and waiting time. Batches
    // can optimize variety at a tie, but must respect effective game counts.
    expect(new Set(selection.ids)).toEqual(new Set(["A1", "A2", "B1", "B2"]));
  });
});
