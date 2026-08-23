import { describe, expect, it } from "vitest";
import {
  getRankedCandidates,
  selectBatchMatches,
} from "@/app/api/sessions/[code]/generate-match/selection";
import type { GenerateMatchSession } from "@/app/api/sessions/[code]/generate-match/shared";
import { buildRotationHistory } from "@/lib/matchmaking/partitioning";
import {
  CourtGroupType,
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
