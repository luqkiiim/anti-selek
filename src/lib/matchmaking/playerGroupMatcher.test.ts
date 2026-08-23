import { describe, expect, it } from "vitest";
import {
  CourtGroupType,
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionPool,
  SessionType,
} from "@/types/enums";
import { getPlayerGroupSelectionConstraints } from "./playerGroupPlanner";
import {
  findBestSingleCourtSelectionV3,
  type MatchmakerV3Player,
} from "./v3";
import {
  findBestSingleCourtSelectionLadder,
  type MatchmakerLadderPlayer,
} from "./ladder";

const crossoverComposition = {
  courtGroupType: CourtGroupType.CROSSOVER,
  poolASeatCount: 2,
  poolBSeatCount: 2,
} as const;

function createV3Player(
  userId: string,
  pool: SessionPool,
  gender: PlayerGender,
  strength: number
): MatchmakerV3Player {
  return {
    userId,
    pool,
    gender,
    strength,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-08-23T00:00:00Z"),
    isBusy: false,
    isPaused: false,
    partnerPreference: PartnerPreference.OPEN,
  };
}

function createLadderPlayer(
  userId: string,
  pool: SessionPool,
  gender: PlayerGender,
  strength: number
): MatchmakerLadderPlayer {
  return {
    userId,
    pool,
    gender,
    strength,
    wins: 0,
    losses: 0,
    pointDiff: 0,
    ladderScore: 0,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-08-23T00:00:00Z"),
    isBusy: false,
    isPaused: false,
    partnerPreference: PartnerPreference.OPEN,
  };
}

function expectMixedGroupTeams(
  partition: { team1: [string, string]; team2: [string, string] },
  poolsById: ReadonlyMap<string, SessionPool>,
  gendersById: ReadonlyMap<string, PlayerGender>
) {
  for (const team of [partition.team1, partition.team2]) {
    expect(poolsById.get(team[0])).not.toBe(poolsById.get(team[1]));
    expect(gendersById.get(team[0])).not.toBe(gendersById.get(team[1]));
  }
}

describe("Competitive/Social constraints in real matchmakers", () => {
  it("combines Crossover and gender-Mixed constraints in the standard matcher", () => {
    const players = [
      createV3Player("A-m", SessionPool.A, PlayerGender.MALE, 1400),
      createV3Player("A-f", SessionPool.A, PlayerGender.FEMALE, 1200),
      createV3Player("B-m", SessionPool.B, PlayerGender.MALE, 1300),
      createV3Player("B-f", SessionPool.B, PlayerGender.FEMALE, 1100),
    ];
    const result = findBestSingleCourtSelectionV3(players, {
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.ELO,
      randomFn: () => 0,
      selectionConstraints:
        getPlayerGroupSelectionConstraints(crossoverComposition),
    });

    expect(result.selection).not.toBeNull();
    expectMixedGroupTeams(
      result.selection!.partition,
      new Map(
        players.map((player) => [player.userId, player.pool as SessionPool])
      ),
      new Map(players.map((player) => [player.userId, player.gender as PlayerGender]))
    );
  });

  it("combines Crossover and gender-Mixed constraints in Level Match", () => {
    const players = [
      createLadderPlayer("A-m", SessionPool.A, PlayerGender.MALE, 1400),
      createLadderPlayer("A-f", SessionPool.A, PlayerGender.FEMALE, 1200),
      createLadderPlayer("B-m", SessionPool.B, PlayerGender.MALE, 1300),
      createLadderPlayer("B-f", SessionPool.B, PlayerGender.FEMALE, 1100),
    ];
    const result = findBestSingleCourtSelectionLadder(players, {
      sessionMode: SessionMode.MIXICANO,
      randomFn: () => 0,
      selectionConstraints:
        getPlayerGroupSelectionConstraints(crossoverComposition),
    });

    expect(result.selection).not.toBeNull();
    expectMixedGroupTeams(
      result.selection!.partition,
      new Map(
        players.map((player) => [player.userId, player.pool as SessionPool])
      ),
      new Map(players.map((player) => [player.userId, player.gender as PlayerGender]))
    );
  });

  it("never emits a malformed Crossover when Mixed constraints are infeasible", () => {
    const players = [
      createV3Player("A1", SessionPool.A, PlayerGender.UNSPECIFIED, 1400),
      createV3Player("A2", SessionPool.A, PlayerGender.UNSPECIFIED, 1200),
      createV3Player("B1", SessionPool.B, PlayerGender.UNSPECIFIED, 1300),
      createV3Player("B2", SessionPool.B, PlayerGender.UNSPECIFIED, 1100),
    ];
    const result = findBestSingleCourtSelectionV3(players, {
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.ELO,
      randomFn: () => 0,
      selectionConstraints:
        getPlayerGroupSelectionConstraints(crossoverComposition),
    });

    expect(result.selection).toBeNull();
  });
});
