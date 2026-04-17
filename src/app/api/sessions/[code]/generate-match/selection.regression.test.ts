import { describe, expect, it } from "vitest";
import {
  MatchStatus,
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionPool,
  SessionStatus,
  SessionType,
} from "@/types/enums";
import {
  buildMatchmakingState,
  getRankedCandidates,
  selectSingleCourtMatch,
} from "./selection";
import type { GenerateMatchSession } from "./shared";

function createSessionPlayer(
  userId: string,
  options: {
    gender?: PlayerGender;
    partnerPreference?: PartnerPreference;
    matchesPlayed?: number;
    availableSince?: Date;
    joinedAt?: Date;
  } = {}
) {
  return {
    userId,
    sessionPoints: 0,
    isPaused: false,
    isGuest: false,
    gender: options.gender ?? PlayerGender.MALE,
    partnerPreference:
      options.partnerPreference ?? PartnerPreference.OPEN,
    lastPartnerId: null,
    matchesPlayed: options.matchesPlayed ?? 0,
    matchmakingMatchesCredit: 0,
    joinedAt: options.joinedAt ?? new Date("2026-04-04T00:00:00Z"),
    availableSince:
      options.availableSince ?? new Date("2026-04-04T00:00:00Z"),
    inactiveSeconds: 0,
    pool: SessionPool.A,
    user: {
      id: userId,
      name: userId,
      elo: 1000,
    },
  } as GenerateMatchSession["players"][number];
}

function createMatch(
  id: string,
  options: {
    status: MatchStatus;
    team1: [string, string];
    team2: [string, string];
    createdAt: Date;
    completedAt?: Date;
    team1Score?: number;
    team2Score?: number;
    winnerTeam?: 1 | 2;
  }
) {
  return {
    id,
    sessionId: "session-1",
    courtId: `court-${id}`,
    status: options.status,
    team1User1Id: options.team1[0],
    team1User2Id: options.team1[1],
    team2User1Id: options.team2[0],
    team2User2Id: options.team2[1],
    team1Score: options.team1Score ?? null,
    team2Score: options.team2Score ?? null,
    winnerTeam: options.winnerTeam ?? null,
    createdAt: options.createdAt,
    completedAt: options.completedAt ?? null,
  } as GenerateMatchSession["matches"][number];
}

function createSessionData(
  overrides: Partial<GenerateMatchSession> = {}
): GenerateMatchSession {
  return {
    id: "session-1",
    code: "session-1",
    communityId: null,
    name: "Race Regression",
    type: SessionType.RACE,
    mode: SessionMode.MIXICANO,
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
    queuedMatch: null,
    ...overrides,
  } as unknown as GenerateMatchSession;
}

describe("generate-match race regressions", () => {
  it("creates a new Mixicano race match after the mixed court finishes while a men's court is still active", async () => {
    const waitingSince = new Date("2026-04-04T00:00:00Z");
    const mixedFinishedAt = new Date("2026-04-04T00:20:00Z");
    const mixedAvailableSince = new Date("2026-04-04T00:21:00Z");

    const players = [
      createSessionPlayer("M1"),
      createSessionPlayer("M2"),
      createSessionPlayer("M3"),
      createSessionPlayer("M4"),
      createSessionPlayer("M5", {
        matchesPlayed: 1,
        availableSince: mixedAvailableSince,
      }),
      createSessionPlayer("M6", {
        matchesPlayed: 1,
        availableSince: mixedAvailableSince,
      }),
      createSessionPlayer("M7", {
        availableSince: waitingSince,
      }),
      createSessionPlayer("F1", {
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
        matchesPlayed: 1,
        availableSince: mixedAvailableSince,
      }),
      createSessionPlayer("F2", {
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
        matchesPlayed: 1,
        availableSince: mixedAvailableSince,
      }),
      createSessionPlayer("F3", {
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
        availableSince: waitingSince,
      }),
      createSessionPlayer("F4", {
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
        availableSince: waitingSince,
      }),
      createSessionPlayer("F5", {
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
        availableSince: waitingSince,
      }),
    ];

    const sessionData = createSessionData({
      players,
      matches: [
        createMatch("mixed-completed", {
          status: MatchStatus.COMPLETED,
          team1: ["M5", "F1"],
          team2: ["M6", "F2"],
          createdAt: new Date("2026-04-04T00:10:00Z"),
          completedAt: mixedFinishedAt,
          team1Score: 21,
          team2Score: 18,
          winnerTeam: 1,
        }),
        createMatch("mens-active", {
          status: MatchStatus.IN_PROGRESS,
          team1: ["M1", "M2"],
          team2: ["M3", "M4"],
          createdAt: new Date("2026-04-04T00:15:00Z"),
        }),
      ],
    });

    const { busyPlayerIds, playersById, rotationHistory } =
      await buildMatchmakingState(sessionData);
    const { availableCandidates, rankedCandidates } = getRankedCandidates(
      sessionData,
      busyPlayerIds
    );

    expect(availableCandidates).toHaveLength(8);

    const selection = selectSingleCourtMatch({
      rankedCandidates,
      playersById,
      sessionData,
      rotationHistory,
      reshuffleSource: null,
    });

    const completedMixedIds = new Set(["M5", "M6", "F1", "F2"]);
    const selectedCompletedMixedCount = selection.ids.filter((userId) =>
      completedMixedIds.has(userId)
    ).length;
    const selectedWaitingCount = selection.ids.filter((userId) => {
      const player = players.find((candidate) => candidate.userId === userId);
      return (player?.matchesPlayed ?? 0) === 0;
    }).length;

    expect(selection.ids).toHaveLength(4);
    expect(selectedCompletedMixedCount).toBe(1);
    expect(selectedWaitingCount).toBe(3);
  });
});
