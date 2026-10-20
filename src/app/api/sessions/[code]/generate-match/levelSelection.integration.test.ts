import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withLegacySportingAliases } from "@/lib/sportingIdentity";
import * as levelEngine from "@/lib/matchmaking/ladder/levelSelection";
import { getExactPartitionKey } from "@/lib/matchmaking/v3/rematch";
import { createMatchmakingSearchBudget } from "@/lib/matchmaking/v3/searchBudget";
import {
  CourtGroupType,
  MatchStatus,
  PartnerPreference,
  PlayerGender,
  SessionBalanceMetric,
  SessionCrossoverFrequency,
  SessionMode,
  SessionPool,
  SessionStatus,
  SessionType,
} from "@/types/enums";
import {
  buildMatchmakingState,
  getRankedCandidates,
  selectBatchMatches,
  selectReplacementMatch,
  selectSingleCourtMatch,
} from "./selection";
import { GenerateMatchError, type GenerateMatchSession } from "./shared";

const joinedAt = new Date("2026-10-01T00:00:00Z");
const completedAt = new Date("2026-10-01T00:10:00Z");
const availableSince = new Date("2026-10-01T00:20:00Z");

function player(
  userId: string,
  rating = 1000,
  overrides: Partial<GenerateMatchSession["players"][number]> = {}
): GenerateMatchSession["players"][number] {
  return withLegacySportingAliases({
    playerId: userId,
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    mixedSideOverride: null,
    pool: SessionPool.A,
    matchesPlayed: 2,
    matchmakingMatchesCredit: 0,
    sessionPoints: 500,
    isPaused: false,
    isGuest: false,
    lastPartnerPlayerId: null,
    representingClubId: null,
    availableSince,
    joinedAt,
    ladderEntryAt: joinedAt,
    arrivalPriorityAt: null,
    inactiveSeconds: 0,
    player: { id: userId, name: userId, elo: rating, ownerUserId: `account-${userId}` },
    ...overrides,
  }) as GenerateMatchSession["players"][number];
}

function session(overrides: Partial<GenerateMatchSession> = {}): GenerateMatchSession {
  return {
    id: "level-session",
    code: "LEVEL",
    clubId: null,
    type: SessionType.RACE,
    balanceMetric: SessionBalanceMetric.RATING,
    mode: SessionMode.MEXICANO,
    status: SessionStatus.ACTIVE,
    respectPlayerRest: true,
    poolsEnabled: false,
    crossoverFrequency: SessionCrossoverFrequency.OCCASIONAL,
    courts: [{ id: "court-1" }, { id: "court-2" }],
    sessionClubs: [],
    players: [],
    matches: [],
    queuedMatch: null,
    ...overrides,
  } as unknown as GenerateMatchSession;
}

function completedMatch(
  ids: [string, string, string, string],
  overrides: Partial<GenerateMatchSession["matches"][number]> = {}
): GenerateMatchSession["matches"][number] {
  return withLegacySportingAliases({
    id: "history",
    sessionId: "level-session",
    courtId: "court-1",
    status: MatchStatus.COMPLETED,
    team1Player1Id: ids[0],
    team1Player2Id: ids[1],
    team2Player1Id: ids[2],
    team2Player2Id: ids[3],
    team1Score: 21,
    team2Score: 15,
    completedAt,
    createdAt: joinedAt,
    ...overrides,
  }) as GenerateMatchSession["matches"][number];
}

async function inputs(data: GenerateMatchSession) {
  const state = await buildMatchmakingState(data);
  const { rankedCandidates } = getRankedCandidates(data, state.busyPlayerIds);
  return { ...state, rankedCandidates, sessionData: data };
}

describe("Level generation adapters with the real selector", () => {
  beforeEach(() => vi.spyOn(Math, "random").mockReturnValue(0.25));
  afterEach(() => vi.restoreAllMocks());

  it("uses the series winner for session points even when the winner scores fewer rallies", async () => {
    const data = session({
      balanceMetric: SessionBalanceMetric.SESSION_POINTS,
      players: [player("A"), player("B"), player("C"), player("D")],
      matches: [completedMatch(["A", "B", "C", "D"], {
        scoringFormat: "BEST_OF_THREE",
        winnerTeam: 1,
        team1Score: 43,
        team2Score: 59,
        gameScoresJson: JSON.stringify([
          { team1Score: 21, team2Score: 19 },
          { team1Score: 1, team2Score: 21 },
          { team1Score: 21, team2Score: 19 },
        ]),
      })],
    });
    const state = await inputs(data);
    const spy = vi.spyOn(levelEngine, "findBestLevelBatchSelection");
    selectSingleCourtMatch({ ...state, reshuffleSource: null });
    expect(spy.mock.calls[0][0].map(({ userId, strength }) => [userId, strength])).toEqual([
      ["A", 3], ["B", 3], ["C", 0], ["D", 0],
    ]);
  });

  it("optimizes grouped courts together with one shared balance baseline", async () => {
    const data = session({
      poolsEnabled: true,
      crossoverFrequency: SessionCrossoverFrequency.FREQUENT,
      players: Array.from({ length: 8 }, (_, index) => player(`p${index}`, 1000 + 10 * index,
        { pool: index < 4 ? SessionPool.A : SessionPool.B })),
    });
    const state = await inputs(data);
    const spy = vi.spyOn(levelEngine, "findBestLevelBatchSelection");
    const result = selectBatchMatches({ ...state, requestedMatchCount: 2, randomFn: () => 0.25 });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1].schedules!.length).toBeGreaterThan(1);
    expect(spy.mock.calls[0][1].schedules!.every((schedule) => schedule.courts.length === 2)).toBe(true);
    expect(result.selections).toHaveLength(2);
    expect(new Set(result.selections.flatMap((selection) => selection.ids)).size).toBe(8);
    // A locally compact first court leaves a 70-point spread on the other court.
    // The complete assignment can keep both spreads at 50.
    expect(result.selections.map((selection) => JSON.parse(selection.matchmakingReasonJson!).levelSpread)).toEqual([50, 50]);
    for (const selection of result.selections) {
      expect(selection.courtGroupType).toBe(CourtGroupType.CROSSOVER);
      expect(selection.poolASeatCount).toBe(2);
      expect(selection.poolBSeatCount).toBe(2);
      for (const team of [selection.partition.team1, selection.partition.team2]) {
        expect(new Set(team.map((id) => data.players.find((entry) => entry.userId === id)!.pool)).size).toBe(2);
      }
      expect(JSON.parse(selection.matchmakingReasonJson!)).toMatchObject({
        version: 1,
        source: "level",
        sessionType: SessionType.RACE,
        metric: SessionBalanceMetric.RATING,
        selectedUserIds: selection.ids,
        bestBalanceGap: 0,
        allowedBalanceGap: 30,
        baselineCertified: true,
      });
    }
    const coreSelections = spy.mock.results[0].value.selection.selections;
    expect(coreSelections[0].levelContext).toBe(coreSelections[1].levelContext);
  });

  it.each([false, true])("compares every eligible replacement while retaining three players (groups=%s)", async (poolsEnabled) => {
    const data = session({
      poolsEnabled,
      players: [
        player("first-bad", 1150, { pool: SessionPool.B }),
        player("excluded", 1030, { pool: SessionPool.B }),
        player("later-good", 1040, { pool: SessionPool.B }),
        player("r1", 1000), player("r2", 1010),
        player("r3", 1020, { pool: SessionPool.B }),
      ],
    });
    const state = await inputs(data);
    const selected = selectReplacementMatch({
      ...state,
      retainedUserIds: ["r1", "r2", "r3"],
      excludedUserIds: ["excluded"],
      requiredCourtGroupType: poolsEnabled ? CourtGroupType.CROSSOVER : undefined,
    });
    expect([...selected.ids].sort()).toEqual(["later-good", "r1", "r2", "r3"]);
    if (poolsEnabled) expect(selected.courtGroupType).toBe(CourtGroupType.CROSSOVER);

    expect(() => selectReplacementMatch({
      ...state,
      rankedCandidates: state.rankedCandidates.filter((candidate) => candidate.userId !== "r3"),
      retainedUserIds: ["r1", "r2", "r3"],
    })).toThrow("The retained players are no longer available");
  });

  it.each([false, true])("keeps the original balance envelope for reshuffle exclusions (groups=%s)", async (poolsEnabled) => {
    const data = session({
      poolsEnabled,
      players: [1000, 1100, 1200, 1300].map((rating, index) => player(`p${index}`, rating,
        { pool: index < 2 ? SessionPool.A : SessionPool.B })),
    });
    const state = await inputs(data);
    const options = { ...state, requiredCourtGroupType: poolsEnabled ? CourtGroupType.CROSSOVER : undefined };
    const original = selectSingleCourtMatch({ ...options, reshuffleSource: null });
    const spy = vi.spyOn(levelEngine, "findBestLevelBatchSelection");

    expect(() => selectSingleCourtMatch({
      ...options,
      reshuffleSource: { ids: original.ids, partition: original.partition },
    })).toThrow(GenerateMatchError);
    expect(spy).toHaveBeenCalledTimes(3);
    const originalContext = spy.mock.results[0].value.selection.selections[0].levelContext;
    expect(originalContext.balanceGuardrail.allowedMaxBalanceGap).toBe(30);
    expect(spy.mock.calls[1][1].selectionContext).toBe(originalContext);
    expect(spy.mock.calls[2][1].selectionContext).toBe(originalContext);
    expect(spy.mock.calls[1][1].excludedQuartetKeys!.has([...original.ids].sort().join("|"))).toBe(true);
    expect(spy.mock.calls[2][1].excludedPartitionKey).toBe(getExactPartitionKey(original.partition));
  });

  it("does not put a per-group rest tier ahead of Level quality", async () => {
    const data = session({
      poolsEnabled: true,
      players: [
        player("rested-outlier", 1200, { availableSince: joinedAt }),
        player("a1"), player("a2"),
        player("b1", 1000, { pool: SessionPool.B }),
        player("b2", 1000, { pool: SessionPool.B }),
        player("b3", 1000, { pool: SessionPool.B }),
      ],
      matches: [completedMatch(["history1", "history2", "history3", "history4"])],
    });
    const state = await inputs(data);
    expect(state.rankedCandidates[0].userId).toBe("rested-outlier");
    expect(state.rankedCandidates[0].restTurns).toBe(1);
    const selection = selectSingleCourtMatch({
      ...state,
      reshuffleSource: null,
      requiredCourtGroupType: CourtGroupType.CROSSOVER,
    });
    expect(selection.ids).not.toContain("rested-outlier");
    expect(JSON.parse(selection.matchmakingReasonJson!).levelSpread).toBe(0);
  });

  it("keeps configured group scheduling independent of physical-court repeat history", async () => {
    const data = session({
      poolsEnabled: true,
      players: Array.from({ length: 8 }, (_, index) => player(`p${index}`, 1000,
        { pool: index < 4 ? SessionPool.A : SessionPool.B })),
      matches: [
        completedMatch(["p0", "p1", "p2", "p3"], {
          id: "previous-a", courtId: "court-1", courtGroupType: CourtGroupType.COMPETITIVE,
          poolASeatCount: 4, poolBSeatCount: 0,
        }),
        completedMatch(["p4", "p5", "p6", "p7"], {
          id: "previous-b", courtId: "court-2", courtGroupType: CourtGroupType.SOCIAL,
          poolASeatCount: 0, poolBSeatCount: 4,
        }),
      ],
    });
    const state = await inputs(data);
    const forward = selectBatchMatches({ ...state, requestedMatchCount: 2, requestedCourtIds: ["court-1", "court-2"] });
    const reverse = selectBatchMatches({ ...state, requestedMatchCount: 2, requestedCourtIds: ["court-2", "court-1"] });
    expect(forward.selections.map((selection) => selection.courtGroupType)).toEqual([
      CourtGroupType.COMPETITIVE, CourtGroupType.SOCIAL,
    ]);
    expect(reverse.selections.map((selection) => selection.courtGroupType)).toEqual(
      forward.selections.map((selection) => selection.courtGroupType)
    );
    expect(reverse.selections.map((selection) => getExactPartitionKey(selection.partition))).toEqual(
      forward.selections.map((selection) => getExactPartitionKey(selection.partition))
    );
  });

  it("passes the same request budget through a retained-player replacement", async () => {
    const data = session({ players: ["a", "b", "c", "d"].map((id) => player(id)) });
    const state = await inputs(data);
    const searchBudget = createMatchmakingSearchBudget({ maxMs: 5_000 });
    const spy = vi.spyOn(levelEngine, "findBestLevelBatchSelection");
    selectReplacementMatch({ ...state, retainedUserIds: ["a", "b", "c"], searchBudget });
    expect(spy.mock.calls[0][1].searchBudget).toBe(searchBudget);
  });
});
