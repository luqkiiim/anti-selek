import { expect, it } from "vitest";
import {
  PartnerPreference,
  MixedSide,
  PlayerGender,
  SessionMode,
  SessionType,
} from "../../../types/enums";
import { isMixedPartitionForSides } from "./mixedVariety";
import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { findBestBatchSelectionV3 } from "./batch";
import { findBestSingleCourtSelectionV3 } from "./singleCourt";
import { buildRestTurnsByUserId } from "@/lib/matchmaking/restTurns";
import {
  buildBalancedMixedBatchSelectionOverride,
  buildBalancedMixedRotationObligations,
  buildBalancedMixedSingleSelectionOverride,
} from "./balancedMixedRotation";

it.each([
  { sessionType: SessionType.POINTS, totalMatches: 21, upperCount: 7, lowerCount: 7 },
  { sessionType: SessionType.ELO, totalMatches: 21, upperCount: 7, lowerCount: 7 },
  { sessionType: SessionType.POINTS, totalMatches: 20, upperCount: 7, lowerCount: 7 },
  { sessionType: SessionType.ELO, totalMatches: 20, upperCount: 7, lowerCount: 7 },
  { sessionType: SessionType.POINTS, totalMatches: 19, upperCount: 7, lowerCount: 7 },
  { sessionType: SessionType.ELO, totalMatches: 19, upperCount: 7, lowerCount: 7 },
  { sessionType: SessionType.POINTS, totalMatches: 84, upperCount: 7, lowerCount: 7 },
  { sessionType: SessionType.ELO, totalMatches: 84, upperCount: 7, lowerCount: 7 },
  { sessionType: SessionType.POINTS, totalMatches: 21, upperCount: 10, lowerCount: 4 },
  { sessionType: SessionType.ELO, totalMatches: 21, upperCount: 10, lowerCount: 4 },
  { sessionType: SessionType.POINTS, totalMatches: 21, upperCount: 4, lowerCount: 10 },
  { sessionType: SessionType.ELO, totalMatches: 21, upperCount: 4, lowerCount: 10 },
  { sessionType: SessionType.POINTS, totalMatches: 21, upperCount: 12, lowerCount: 2 },
  { sessionType: SessionType.ELO, totalMatches: 21, upperCount: 12, lowerCount: 2 },
  { sessionType: SessionType.POINTS, totalMatches: 6, upperCount: 7, lowerCount: 7, simultaneous: true, sideOverrides: true },
].flatMap((fixture) =>
  fixture.upperCount === 7 && fixture.lowerCount === 7 && [20, 21, 84].includes(fixture.totalMatches)
    ? [4729, 1777, 9265].map((seed) => ({ ...fixture, seed }))
    : [{ ...fixture, seed: 4729 }]
))(
  "uses persisted obligations for $sessionType across $totalMatches asynchronous Balanced Mixed matches with $upperCount upper and $lowerCount lower players (seed $seed)",
  ({ sessionType, totalMatches, upperCount, lowerCount, simultaneous = false, sideOverrides = false, seed: randomSeed = 4729 }) => {
  const players = [
    ...Array.from({ length: upperCount }, (_, i) => {
      const moveToLower = sideOverrides && i < 2;
      return {
        userId: `U${i + 1}`,
        gender: PlayerGender.MALE,
        partnerPreference: moveToLower
          ? PartnerPreference.FEMALE_FLEX
          : PartnerPreference.OPEN,
        mixedSideOverride: moveToLower ? MixedSide.LOWER : null,
      };
    }),
    ...Array.from({ length: lowerCount }, (_, i) => {
      const moveToUpper = sideOverrides && i < 2;
      return {
        userId: `L${i + 1}`,
        gender: PlayerGender.FEMALE,
        partnerPreference: moveToUpper
          ? PartnerPreference.OPEN
          : PartnerPreference.FEMALE_FLEX,
        mixedSideOverride: moveToUpper ? MixedSide.UPPER : null,
      };
    }),
  ].map((player) => ({
    ...player,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-09-30T00:00:00Z"),
    strength: 1000,
    pointDiff: 0,
    restTurns: 0,
    isBusy: false,
    isPaused: false,
  }));
  const sideByUserId = new Map(players.map((player) => [
    player.userId,
    getEffectiveMixedSide(player),
  ]));
  if (sideOverrides) {
    expect(sideByUserId.get("U1")).toBe(MixedSide.LOWER);
    expect(sideByUserId.get("U2")).toBe(MixedSide.LOWER);
    expect(sideByUserId.get("L1")).toBe(MixedSide.UPPER);
    expect(sideByUserId.get("L2")).toBe(MixedSide.UPPER);
  }
  const completed = [] as Array<{ team1: [string, string]; team2: [string, string]; completedAt: Date; createdAt: Date; matchmakingReasonJson: string | null; team1Score: number; team2Score: number }>;
  const committed = [] as Array<{ team1: [string, string]; team2: [string, string]; courtId: number; createdAt: Date; matchmakingReasonJson: string | null }>;
  const buildObligations = () =>
    buildBalancedMixedRotationObligations({
      players: players.map((player) => ({
        userId: player.userId,
        availableSince: player.availableSince,
        isPaused: player.isPaused,
      })),
      events: [...completed, ...committed].map((match) => ({
        createdAt: match.createdAt,
        userIds: [...match.team1, ...match.team2],
        matchmakingReasonJson: match.matchmakingReasonJson,
      })),
    });
  const outstandingCounts = () => {
    const counts = new Map<string, number>();
    for (const match of committed) {
      for (const userId of [...match.team1, ...match.team2]) {
        counts.set(userId, (counts.get(userId) ?? 0) + 1);
      }
    }
    return counts;
  };
  const baseTime = new Date("2026-09-30T00:00:00Z").getTime();
  const evolveStrengths = totalMatches > 21;
  let seed = randomSeed;
  const randomFn = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  const addCommitment = (selection: { partition: { team1: [string, string]; team2: [string, string] }; balancedMixedRotation?: unknown }, courtId: number, createdAt: Date) => {
    const match = selection.partition;
    for (const id of [...match.team1, ...match.team2]) {
      const player = players.find((candidate) => candidate.userId === id)!;
      player.isBusy = true;
    }
    committed.push({
      team1: match.team1,
      team2: match.team2,
      courtId,
      createdAt,
      matchmakingReasonJson: selection.balancedMixedRotation
        ? JSON.stringify({
            version: 1,
            source: "v3",
            sessionType,
            sessionMode: SessionMode.MIXICANO,
            selectedUserIds: [...match.team1, ...match.team2],
            team1UserIds: match.team1,
            team2UserIds: match.team2,
            summary: [],
            balancedMixedRotation: selection.balancedMixedRotation,
            metrics: {
              fairnessBand: 0,
              selectedMatchCounts: [0, 0, 0, 0],
              balanceGap: 0,
              partnerRepeatPenalty: 0,
              opponentRepeatPenalty: 0,
              exactRematchPenalty: 0,
              restTurnRange: 0,
              minimumRestTurns: 0,
              totalRestTurns: 0,
              mixedMode: true,
            },
          })
      : null,
    });
  };
  const assertProjectedGameCountSpread = () => {
    const counts = players.map(
      (player) =>
        player.matchesPlayed + (outstandingCounts().get(player.userId) ?? 0)
    );
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  };
  const assertOneBatchDecision = (
    selections: Array<{ balancedMixedRotation?: { decisionId: string; obligationOwner: boolean } }>
  ) => {
    const metadata = selections.map((selection) => selection.balancedMixedRotation);
    expect(metadata.every(Boolean)).toBe(true);
    expect(new Set(metadata.map((item) => item?.decisionId)).size).toBe(1);
    expect(metadata.filter((item) => item?.obligationOwner)).toHaveLength(1);
  };
  const completeMatch = (
    finished: (typeof committed)[number],
    now: Date
  ) => {
    const winner = randomFn() < 0.5 ? 1 : 2;
    const team1Score = winner === 1 ? 21 : 15;
    const team2Score = winner === 2 ? 21 : 15;
    const team1Average = finished.team1.reduce(
      (sum, id) => sum + players.find((player) => player.userId === id)!.strength,
      0
    ) / 2;
    const team2Average = finished.team2.reduce(
      (sum, id) => sum + players.find((player) => player.userId === id)!.strength,
      0
    ) / 2;
    const expectedTeam1 = 1 / (1 + 10 ** ((team2Average - team1Average) / 400));
    const eloDelta = 16 * (winner === 1 ? 1 - expectedTeam1 : -expectedTeam1);
    if (evolveStrengths) {
      for (const id of finished.team1) {
        const player = players.find((candidate) => candidate.userId === id)!;
        if (sessionType === SessionType.POINTS && winner === 1) player.strength += 3;
        if (sessionType === SessionType.ELO) player.strength += eloDelta;
        player.pointDiff += team1Score - team2Score;
      }
      for (const id of finished.team2) {
        const player = players.find((candidate) => candidate.userId === id)!;
        if (sessionType === SessionType.POINTS && winner === 2) player.strength += 3;
        if (sessionType === SessionType.ELO) player.strength -= eloDelta;
        player.pointDiff += team2Score - team1Score;
      }
    }
    completed.push({
      team1: finished.team1,
      team2: finished.team2,
      completedAt: now,
      createdAt: finished.createdAt,
      matchmakingReasonJson: finished.matchmakingReasonJson,
      team1Score,
      team2Score,
    });
    const finishedIds = new Set([...finished.team1, ...finished.team2]);
    for (const player of players) {
      if (finishedIds.has(player.userId)) {
        player.matchesPlayed += 1;
        player.matchmakingBaseline += 1;
        player.isBusy = false;
        player.availableSince = now;
      }
    }
  };
  const initialBatch = findBestBatchSelectionV3(players, {
    courtCount: 2,
    sessionMode: SessionMode.MIXICANO,
    sessionType,
    completedMatches: completed,
    mixedHistoryMatches: committed,
    selectionOverride: buildBalancedMixedBatchSelectionOverride({
        players,
        mixedHistoryMatches: committed,
        sessionMode: SessionMode.MIXICANO,
        sessionType,
        respectPlayerRest: true,
        outstandingMatchCountByUserId: outstandingCounts(),
        pendingObligations: buildObligations(),
        timestamp: new Date(baseTime).toISOString(),
      }),
    randomFn,
    searchLimits: { maxBranches: 20_000, maxMs: 1_000 },
  }).selection!;
  if (simultaneous) assertOneBatchDecision(initialBatch.selections);
  for (const [index, selection] of initialBatch.selections.entries()) {
    addCommitment(selection, index, new Date(baseTime));
  }
  assertProjectedGameCountSpread();
  let totalScheduled = committed.length;
  let completedIndex = 0;
  while (completed.length < totalScheduled) {
    const finishCount = simultaneous ? Math.min(2, committed.length) : 1;
    const finishedGroup = committed.splice(0, finishCount);
    const now = new Date(baseTime + (completedIndex + 1) * 60_000);
    for (const finished of finishedGroup) {
      completeMatch(finished, now);
      completedIndex += 1;
    }
    const restTurns = buildRestTurnsByUserId(players, completed);
    for (const player of players) {
      player.restTurns = restTurns.get(player.userId) ?? 0;
    }
    if (totalScheduled >= totalMatches) continue;

    const mixedHistory = [
      ...completed.map(({ team1, team2 }) => ({ team1, team2 })),
      ...committed.map(({ team1, team2 }) => ({ team1, team2 })),
    ];
    if (simultaneous) {
      const courtCount = Math.min(2, totalMatches - totalScheduled);
      const nextBatch = findBestBatchSelectionV3(players, {
        courtCount,
        sessionMode: SessionMode.MIXICANO,
        sessionType,
        completedMatches: completed,
        mixedHistoryMatches: mixedHistory,
        selectionOverride: buildBalancedMixedBatchSelectionOverride({
          players,
          mixedHistoryMatches: mixedHistory,
          completedMatches: completed,
          sessionMode: SessionMode.MIXICANO,
          sessionType,
          respectPlayerRest: true,
          outstandingMatchCountByUserId: outstandingCounts(),
          pendingObligations: buildObligations(),
          timestamp: now.toISOString(),
        }),
        randomFn,
        searchLimits: { maxBranches: 20_000, maxMs: 1_000 },
      }).selection!;
      assertOneBatchDecision(nextBatch.selections);
      for (const [index, selection] of nextBatch.selections.entries()) {
        addCommitment(selection, finishedGroup[index]?.courtId ?? index, now);
      }
      assertProjectedGameCountSpread();
      totalScheduled += nextBatch.selections.length;
      continue;
    }
    const finished = finishedGroup[0]!;
    const next = findBestSingleCourtSelectionV3(players, {
      sessionMode: SessionMode.MIXICANO,
      sessionType,
      completedMatches: completed,
      mixedHistoryMatches: mixedHistory,
      selectionOverride: buildBalancedMixedSingleSelectionOverride({
        players,
        mixedHistoryMatches: mixedHistory,
        completedMatches: completed,
        sessionMode: SessionMode.MIXICANO,
        sessionType,
        respectPlayerRest: true,
        outstandingMatchCountByUserId: outstandingCounts(),
        pendingObligations: buildObligations(),
        timestamp: now.toISOString(),
      }),
      randomFn,
    }).selection!;
    addCommitment(next, finished.courtId, now);
    assertProjectedGameCountSpread();
    totalScheduled += 1;
  }
  const categories = completed.map((match) => {
    if (isMixedPartitionForSides(match, sideByUserId)) return "M";
    const allUpper = [...match.team1, ...match.team2].every(
      (id) => sideByUserId.get(id) === "UPPER"
    );
    if (allUpper) return "U";
    const allLower = [...match.team1, ...match.team2].every(
      (id) => sideByUserId.get(id) === "LOWER"
    );
    return allLower ? "L" : "INVALID";
  });
  const mixedCount = categories.filter((category) => category === "M").length;
  const gameCounts = players.map((player) => player.matchesPlayed);
  expect(categories).not.toContain("INVALID");
  const balancedSideTarget = Math.min(upperCount, lowerCount) < 4
    ? (upperCount > lowerCount ? lowerCount / upperCount : upperCount / lowerCount)
    : Math.min(upperCount, lowerCount) / (upperCount + lowerCount);
  const expectedMixedCount =
    (balancedSideTarget * 2 * Math.max(upperCount, lowerCount) * totalMatches) /
    (upperCount + lowerCount);
  if (simultaneous) {
    expect(categories).toContain("M");
  } else if (upperCount === lowerCount && totalMatches >= 20) {
    expect(categories).toContain("M");
  } else {
    expect(mixedCount).toBeGreaterThanOrEqual(Math.floor(expectedMixedCount - 3));
    expect(mixedCount).toBeLessThanOrEqual(Math.ceil(expectedMixedCount + 3));
  }
  if (!simultaneous && upperCount >= 4) expect(categories).toContain("U");
  if (!simultaneous && lowerCount >= 4) expect(categories).toContain("L");
  if (!simultaneous && upperCount >= 4 && lowerCount >= 4 && totalMatches === 20) {
    expect(categories).toContain("M");
    expect(categories).toContain("U");
    expect(categories).toContain("L");
  }
  if (!simultaneous && Math.min(upperCount, lowerCount) < 4) {
    expect(categories).not.toContain(upperCount < 4 ? "U" : "L");
  }
  expect(Math.max(...gameCounts) - Math.min(...gameCounts)).toBeLessThanOrEqual(1);
  if (totalMatches === 20 && upperCount === 7 && lowerCount === 7) {
    expect(gameCounts.filter((count) => count === 6)).toHaveLength(10);
    expect(gameCounts.filter((count) => count === 5)).toHaveLength(4);
  }
  if (totalMatches === 21 && upperCount === 7 && lowerCount === 7) {
    expect(gameCounts.every((count) => count === 6)).toBe(true);
  }
  if (totalMatches === 84 && upperCount === 7 && lowerCount === 7) {
    expect(gameCounts.every((count) => count === 24)).toBe(true);
  }
  }, 30_000);
