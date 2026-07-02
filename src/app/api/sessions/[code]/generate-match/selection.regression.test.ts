import { describe, expect, it } from "vitest";
import {
  MatchStatus,
  PartnerPreference,
  PlayerGender,
  SessionCollabFormat,
  SessionMode,
  SessionPool,
  SessionStatus,
  SessionType,
} from "@/types/enums";
import { getExactPartitionKey } from "@/lib/matchmaking/v3/rematch";
import {
  buildMatchmakingState,
  getRankedCandidates,
  selectBatchMatches,
  selectReplacementMatch,
  selectSingleCourtMatch,
} from "./selection";
import type { GenerateMatchSession } from "./shared";

function createSessionPlayer(
  userId: string,
  options: {
    gender?: PlayerGender;
    partnerPreference?: PartnerPreference;
    matchesPlayed?: number;
    sessionPoints?: number;
    availableSince?: Date;
    joinedAt?: Date;
    representingClubId?: string | null;
  } = {}
) {
  return {
    userId,
    sessionPoints: options.sessionPoints ?? 0,
    isPaused: false,
    isGuest: false,
    representingClubId: options.representingClubId ?? null,
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

function createInterclubLinks() {
  return [
    {
      id: "session-club-host",
      sessionId: "session-1",
      clubId: "community-1",
      role: "HOST",
      status: "ACCEPTED",
      requestedById: null,
      reviewedById: null,
      reviewedAt: null,
      createdAt: new Date("2026-04-04T00:00:00Z"),
      updatedAt: new Date("2026-04-04T00:00:00Z"),
      club: { id: "community-1", name: "Club A" },
    },
    {
      id: "session-club-partner",
      sessionId: "session-1",
      clubId: "community-2",
      role: "PARTNER",
      status: "ACCEPTED",
      requestedById: null,
      reviewedById: null,
      reviewedAt: null,
      createdAt: new Date("2026-04-04T00:00:01Z"),
      updatedAt: new Date("2026-04-04T00:00:01Z"),
      club: { id: "community-2", name: "Club B" },
    },
  ] as unknown as GenerateMatchSession["sessionClubs"];
}

function createSessionData(
  overrides: Partial<GenerateMatchSession> = {}
): GenerateMatchSession {
  return {
    id: "session-1",
    code: "session-1",
    clubId: null,
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

function createSequenceRandom(values: number[]) {
  let index = 0;

  return () => values[index++] ?? 0;
}

function getSelectedBatchIds(selection: ReturnType<typeof selectBatchMatches>) {
  return new Set(
    selection.selections.flatMap((courtSelection) => courtSelection.ids)
  );
}

function getInterclubReason(selection: { matchmakingReasonJson?: string | null }) {
  return JSON.parse(selection.matchmakingReasonJson ?? "{}") as {
    balanceGap?: number;
    team1ClubId?: string;
    team2ClubId?: string;
  };
}

function expectStrictInterclubSides(
  selection: {
    partition: { team1: [string, string]; team2: [string, string] };
    team1ClubId?: string | null;
    team2ClubId?: string | null;
  },
  clubByUserId: Map<string, string>
) {
  expect(selection.team1ClubId).toBe("community-1");
  expect(selection.team2ClubId).toBe("community-2");
  expect(selection.partition.team1.map((id) => clubByUserId.get(id))).toEqual([
    "community-1",
    "community-1",
  ]);
  expect(selection.partition.team2.map((id) => clubByUserId.get(id))).toEqual([
    "community-2",
    "community-2",
  ]);
}

function getClubAPairLayout(selection: ReturnType<typeof selectBatchMatches>) {
  return selection.selections
    .map((courtSelection) =>
      [...courtSelection.partition.team1].sort().join("+")
    )
    .sort()
    .join("|");
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

describe("generate-match points batch regressions", () => {
  it("can recreate a different equally fair opening batch after an unscored batch is undone", async () => {
    const players = Array.from({ length: 10 }, (_, index) =>
      createSessionPlayer(String.fromCharCode(65 + index))
    );
    const sessionData = createSessionData({
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      players,
      matches: [],
    });
    const { busyPlayerIds, playersById, rotationHistory } =
      await buildMatchmakingState(sessionData);
    const { rankedCandidates } = getRankedCandidates(sessionData, busyPlayerIds);

    const firstBatch = selectBatchMatches({
      rankedCandidates,
      playersById,
      sessionData,
      rotationHistory,
      requestedMatchCount: 2,
      randomFn: createSequenceRandom([
        0.9, 0.8, 0.7, 0.6, 0.1, 0.2, 0.3, 0.4, 0.5, 0,
      ]),
    });
    const recreatedBatch = selectBatchMatches({
      rankedCandidates,
      playersById,
      sessionData,
      rotationHistory,
      requestedMatchCount: 2,
      randomFn: createSequenceRandom([
        0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.9, 0.8,
      ]),
    });

    expect(getSelectedBatchIds(firstBatch)).toEqual(
      new Set(["C", "D", "E", "F", "G", "H", "I", "J"])
    );
    expect(getSelectedBatchIds(recreatedBatch)).toEqual(
      new Set(["A", "B", "C", "D", "E", "F", "G", "H"])
    );
    expect(getSelectedBatchIds(firstBatch)).not.toEqual(
      getSelectedBatchIds(recreatedBatch)
    );
  });
});

describe("generate-match interclub points batch regressions", () => {
  it("uses random tie-breaks for equal session-points club-vs-club batches", async () => {
    const clubAPlayers = Array.from({ length: 5 }, (_, index) =>
      createSessionPlayer(`A${index + 1}`, {
        representingClubId: "community-1",
      })
    );
    const clubBPlayers = Array.from({ length: 5 }, (_, index) =>
      createSessionPlayer(`B${index + 1}`, {
        representingClubId: "community-2",
      })
    );
    const sessionData = createSessionData({
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      collabFormat: SessionCollabFormat.INTERCLUB,
      sessionClubs: createInterclubLinks(),
      players: [...clubAPlayers, ...clubBPlayers],
      matches: [],
    });
    const { busyPlayerIds, playersById, rotationHistory } =
      await buildMatchmakingState(sessionData);
    const { rankedCandidates } = getRankedCandidates(sessionData, busyPlayerIds);

    const firstBatch = selectBatchMatches({
      rankedCandidates,
      playersById,
      sessionData,
      rotationHistory,
      requestedMatchCount: 2,
      randomFn: createSequenceRandom([
        0.9, 0.8, 0.1, 0.2, 0.3, 0.9, 0.8, 0.1, 0.2, 0.3,
      ]),
    });
    const secondBatch = selectBatchMatches({
      rankedCandidates,
      playersById,
      sessionData,
      rotationHistory,
      requestedMatchCount: 2,
      randomFn: createSequenceRandom([
        0.1, 0.2, 0.3, 0.8, 0.9, 0.1, 0.2, 0.3, 0.8, 0.9,
      ]),
    });

    const firstBatchIds = getSelectedBatchIds(firstBatch);
    const secondBatchIds = getSelectedBatchIds(secondBatch);

    expect(firstBatchIds.size).toBe(8);
    expect(secondBatchIds.size).toBe(8);
    expect([...firstBatchIds].filter((id) => id.startsWith("A"))).toHaveLength(4);
    expect([...firstBatchIds].filter((id) => id.startsWith("B"))).toHaveLength(4);
    expect([...secondBatchIds].filter((id) => id.startsWith("A"))).toHaveLength(4);
    expect([...secondBatchIds].filter((id) => id.startsWith("B"))).toHaveLength(4);
    expect(firstBatchIds).not.toEqual(secondBatchIds);

    for (const selection of firstBatch.selections) {
      expect(selection.team1ClubId).toBe("community-1");
      expect(selection.team2ClubId).toBe("community-2");
    }
  });

  it("randomizes equal 3-court interclub partner layouts for the same selected players", async () => {
    const clubAPlayers = Array.from({ length: 6 }, (_, index) =>
      createSessionPlayer(`A${index + 1}`, {
        representingClubId: "community-1",
      })
    );
    const clubBPlayers = Array.from({ length: 6 }, (_, index) =>
      createSessionPlayer(`B${index + 1}`, {
        representingClubId: "community-2",
      })
    );
    const players = [...clubAPlayers, ...clubBPlayers];
    const clubByUserId = new Map(
      players.map((player) => [player.userId, player.representingClubId!])
    );
    const sessionData = createSessionData({
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      collabFormat: SessionCollabFormat.INTERCLUB,
      sessionClubs: createInterclubLinks(),
      players,
      matches: [],
    });
    const { busyPlayerIds, playersById, rotationHistory } =
      await buildMatchmakingState(sessionData);
    const { rankedCandidates } = getRankedCandidates(sessionData, busyPlayerIds);

    const firstBatch = selectBatchMatches({
      rankedCandidates,
      playersById,
      sessionData,
      rotationHistory,
      requestedMatchCount: 3,
      randomFn: createSequenceRandom([
        0.01, 0.02, 0.03, 0.04, 0.05, 0.06,
        0.11, 0.12, 0.13, 0.14, 0.15, 0.16,
      ]),
    });
    const secondBatch = selectBatchMatches({
      rankedCandidates,
      playersById,
      sessionData,
      rotationHistory,
      requestedMatchCount: 3,
      randomFn: createSequenceRandom([
        0.011, 0.022, 0.037, 0.049, 0.058, 0.089,
        0.118, 0.129, 0.133, 0.157, 0.171, 0.199,
      ]),
    });

    expect(getSelectedBatchIds(firstBatch)).toEqual(
      new Set(players.map((player) => player.userId))
    );
    expect(getSelectedBatchIds(secondBatch)).toEqual(
      new Set(players.map((player) => player.userId))
    );
    expect(getClubAPairLayout(firstBatch)).not.toBe(
      getClubAPairLayout(secondBatch)
    );

    for (const selection of [
      ...firstBatch.selections,
      ...secondBatch.selections,
    ]) {
      expectStrictInterclubSides(selection, clubByUserId);
    }
  });

  it("keeps lower-match-count players ahead of random club-vs-club variation", async () => {
    const clubAPlayers = [
      ...Array.from({ length: 4 }, (_, index) =>
        createSessionPlayer(`A${index + 1}`, {
          representingClubId: "community-1",
        })
      ),
      createSessionPlayer("A5", {
        matchesPlayed: 1,
        representingClubId: "community-1",
      }),
    ];
    const clubBPlayers = [
      ...Array.from({ length: 4 }, (_, index) =>
        createSessionPlayer(`B${index + 1}`, {
          representingClubId: "community-2",
        })
      ),
      createSessionPlayer("B5", {
        matchesPlayed: 1,
        representingClubId: "community-2",
      }),
    ];
    const sessionData = createSessionData({
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      collabFormat: SessionCollabFormat.INTERCLUB,
      sessionClubs: createInterclubLinks(),
      players: [...clubAPlayers, ...clubBPlayers],
      matches: [],
    });
    const { busyPlayerIds, playersById, rotationHistory } =
      await buildMatchmakingState(sessionData);
    const { rankedCandidates } = getRankedCandidates(sessionData, busyPlayerIds);

    const batch = selectBatchMatches({
      rankedCandidates,
      playersById,
      sessionData,
      rotationHistory,
      requestedMatchCount: 2,
      randomFn: createSequenceRandom([
        0.9, 0.8, 0.7, 0.6, 0, 0.9, 0.8, 0.7, 0.6, 0,
      ]),
    });

    expect(getSelectedBatchIds(batch)).toEqual(
      new Set(["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"])
    );
  });

  it("uses global batch balance instead of greedy first-court club-vs-club picks", async () => {
    const clubAPlayers = [
      createSessionPlayer("A1", {
        representingClubId: "community-1",
        sessionPoints: 0,
      }),
      createSessionPlayer("A2", {
        representingClubId: "community-1",
        sessionPoints: 0,
      }),
      createSessionPlayer("A3", {
        representingClubId: "community-1",
        sessionPoints: 10,
      }),
      createSessionPlayer("A4", {
        representingClubId: "community-1",
        sessionPoints: 10,
      }),
    ];
    const clubBPlayers = [
      createSessionPlayer("B1", {
        representingClubId: "community-2",
        sessionPoints: 10,
      }),
      createSessionPlayer("B2", {
        representingClubId: "community-2",
        sessionPoints: 10,
      }),
      createSessionPlayer("B3", {
        representingClubId: "community-2",
        sessionPoints: 0,
      }),
      createSessionPlayer("B4", {
        representingClubId: "community-2",
        sessionPoints: 0,
      }),
    ];
    const sessionData = createSessionData({
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      collabFormat: SessionCollabFormat.INTERCLUB,
      sessionClubs: createInterclubLinks(),
      players: [...clubAPlayers, ...clubBPlayers],
      matches: [],
    });
    const { busyPlayerIds, playersById, rotationHistory } =
      await buildMatchmakingState(sessionData);
    const { rankedCandidates } = getRankedCandidates(sessionData, busyPlayerIds);

    const batch = selectBatchMatches({
      rankedCandidates,
      playersById,
      sessionData,
      rotationHistory,
      requestedMatchCount: 2,
      randomFn: () => 0,
    });

    expect(
      batch.selections.map((selection) => getInterclubReason(selection).balanceGap)
    ).toEqual([0, 0]);
  });

  it("avoids repeated interclub partners when alternatives are inside the points balance window", async () => {
    const players = [
      createSessionPlayer("A1", { representingClubId: "community-1" }),
      createSessionPlayer("A2", { representingClubId: "community-1" }),
      createSessionPlayer("A3", { representingClubId: "community-1" }),
      createSessionPlayer("B1", { representingClubId: "community-2" }),
      createSessionPlayer("B2", { representingClubId: "community-2" }),
      createSessionPlayer("B3", { representingClubId: "community-2" }),
    ];
    const sessionData = createSessionData({
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      collabFormat: SessionCollabFormat.INTERCLUB,
      sessionClubs: createInterclubLinks(),
      players,
      matches: [
        createMatch("repeat", {
          status: MatchStatus.COMPLETED,
          team1: ["A1", "A2"],
          team2: ["B1", "B2"],
          createdAt: new Date("2026-04-04T00:00:00Z"),
          completedAt: new Date("2026-04-04T00:10:00Z"),
          team1Score: 21,
          team2Score: 18,
          winnerTeam: 1,
        }),
      ],
    });
    const { busyPlayerIds, playersById, rotationHistory } =
      await buildMatchmakingState(sessionData);
    const { rankedCandidates } = getRankedCandidates(sessionData, busyPlayerIds);

    const selection = selectSingleCourtMatch({
      rankedCandidates,
      playersById,
      sessionData,
      rotationHistory,
      reshuffleSource: null,
    });

    expect(getExactPartitionKey(selection.partition)).not.toBe(
      getExactPartitionKey({
        team1: ["A1", "A2"],
        team2: ["B1", "B2"],
      })
    );
  });

  it("keeps interclub points balance ahead of fresh variety outside the safe window", async () => {
    const players = [
      createSessionPlayer("A1", {
        representingClubId: "community-1",
        sessionPoints: 10,
      }),
      createSessionPlayer("A2", {
        representingClubId: "community-1",
        sessionPoints: 10,
      }),
      createSessionPlayer("A3", {
        representingClubId: "community-1",
        sessionPoints: 30,
      }),
      createSessionPlayer("B1", {
        representingClubId: "community-2",
        sessionPoints: 10,
      }),
      createSessionPlayer("B2", {
        representingClubId: "community-2",
        sessionPoints: 10,
      }),
    ];
    const sessionData = createSessionData({
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      collabFormat: SessionCollabFormat.INTERCLUB,
      sessionClubs: createInterclubLinks(),
      players,
      matches: [
        createMatch("repeat", {
          status: MatchStatus.COMPLETED,
          team1: ["A1", "A2"],
          team2: ["B1", "B2"],
          createdAt: new Date("2026-04-04T00:00:00Z"),
          completedAt: new Date("2026-04-04T00:10:00Z"),
          team1Score: 21,
          team2Score: 18,
          winnerTeam: 1,
        }),
      ],
    });
    const { busyPlayerIds, playersById, rotationHistory } =
      await buildMatchmakingState(sessionData);
    const { rankedCandidates } = getRankedCandidates(sessionData, busyPlayerIds);

    const selection = selectSingleCourtMatch({
      rankedCandidates,
      playersById,
      sessionData,
      rotationHistory,
      reshuffleSource: null,
    });

    expect(getExactPartitionKey(selection.partition)).toBe(
      getExactPartitionKey({
        team1: ["A1", "A2"],
        team2: ["B1", "B2"],
      })
    );
    expect(getInterclubReason(selection).balanceGap).toBe(0);
  });

  it("keeps Mixicano interclub teams on strict club sides", async () => {
    const players = [
      createSessionPlayer("A-M", {
        representingClubId: "community-1",
        gender: PlayerGender.MALE,
      }),
      createSessionPlayer("A-F", {
        representingClubId: "community-1",
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      }),
      createSessionPlayer("B-M", {
        representingClubId: "community-2",
        gender: PlayerGender.MALE,
      }),
      createSessionPlayer("B-F", {
        representingClubId: "community-2",
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
      }),
    ];
    const clubByUserId = new Map(
      players.map((player) => [player.userId, player.representingClubId!])
    );
    const sessionData = createSessionData({
      type: SessionType.POINTS,
      mode: SessionMode.MIXICANO,
      collabFormat: SessionCollabFormat.INTERCLUB,
      sessionClubs: createInterclubLinks(),
      players,
      matches: [],
    });
    const { busyPlayerIds, playersById, rotationHistory } =
      await buildMatchmakingState(sessionData);
    const { rankedCandidates } = getRankedCandidates(sessionData, busyPlayerIds);

    const selection = selectSingleCourtMatch({
      rankedCandidates,
      playersById,
      sessionData,
      rotationHistory,
      reshuffleSource: null,
    });

    expectStrictInterclubSides(selection, clubByUserId);
  });

  it("uses a dual-club player's assigned representing club", async () => {
    const players = [
      createSessionPlayer("A1", { representingClubId: "community-1" }),
      createSessionPlayer("A2", { representingClubId: "community-1" }),
      createSessionPlayer("Dual", { representingClubId: "community-2" }),
      createSessionPlayer("B2", { representingClubId: "community-2" }),
    ];
    const clubByUserId = new Map(
      players.map((player) => [player.userId, player.representingClubId!])
    );
    const sessionData = createSessionData({
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      collabFormat: SessionCollabFormat.INTERCLUB,
      sessionClubs: createInterclubLinks(),
      players,
      matches: [],
    });
    const { busyPlayerIds, playersById, rotationHistory } =
      await buildMatchmakingState(sessionData);
    const { rankedCandidates } = getRankedCandidates(sessionData, busyPlayerIds);

    const selection = selectSingleCourtMatch({
      rankedCandidates,
      playersById,
      sessionData,
      rotationHistory,
      reshuffleSource: null,
    });

    expectStrictInterclubSides(selection, clubByUserId);
    expect(selection.partition.team2).toContain("Dual");
  });

  it("preserves strict club sides when replacing an interclub player", async () => {
    const players = [
      createSessionPlayer("A1", { representingClubId: "community-1" }),
      createSessionPlayer("A2", { representingClubId: "community-1" }),
      createSessionPlayer("B1", { representingClubId: "community-2" }),
      createSessionPlayer("B2", { representingClubId: "community-2" }),
      createSessionPlayer("B3", { representingClubId: "community-2" }),
    ];
    const clubByUserId = new Map(
      players.map((player) => [player.userId, player.representingClubId!])
    );
    const sessionData = createSessionData({
      type: SessionType.POINTS,
      mode: SessionMode.MEXICANO,
      collabFormat: SessionCollabFormat.INTERCLUB,
      sessionClubs: createInterclubLinks(),
      players,
      matches: [],
    });
    const { busyPlayerIds, playersById } = await buildMatchmakingState(sessionData);
    const { rankedCandidates } = getRankedCandidates(sessionData, busyPlayerIds);

    const selection = selectReplacementMatch({
      rankedCandidates,
      playersById,
      sessionData,
      retainedUserIds: ["A1", "A2", "B1"],
      excludedUserIds: ["A1", "A2", "B1", "B2"],
    });

    expectStrictInterclubSides(selection, clubByUserId);
    expect(selection.partition.team2).toContain("B3");
  });
});
