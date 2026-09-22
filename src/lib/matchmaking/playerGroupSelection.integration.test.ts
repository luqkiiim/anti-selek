import { describe, expect, it } from "vitest";
import {
  getRankedCandidates,
  selectBatchMatches,
  selectSingleCourtMatch,
} from "@/app/api/sessions/[code]/generate-match/selection";
import type { GenerateMatchSession } from "@/app/api/sessions/[code]/generate-match/shared";
import { buildRotationHistory } from "@/lib/matchmaking/partitioning";
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
