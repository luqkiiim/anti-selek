import {
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionType,
} from "../../../types/enums";
import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { buildRestTurnsByUserId } from "@/lib/matchmaking/restTurns";
import { buildBalancedMixedRotationObligations } from "./balancedMixedRotation";
import { buildBalancedMixedBatchSelectionOverride, buildBalancedMixedSingleSelectionOverride } from "./balancedMixedRotation";
import { findBestBatchSelectionV3 } from "./batch";
import { findBestSingleCourtSelectionV3 } from "./singleCourt";
import type { MatchmakerV3Player, V3CompletedMatch, V3DoublesPartition } from "./types";

const START_TIME = new Date("2026-10-01T09:00:00.000Z").getTime();
const MATCH_DURATIONS_MINUTES = [
  15, 18, 18, 17, 16, 14, 15, 15, 17, 13,
  16, 14, 18, 15, 12, 17, 13, 16, 14, 15,
] as const;
const MATCH_DURATION_SCALE = 0.75;
const COURT_COUNT = 2;
const TOTAL_MATCHES = 20;

export interface BalancedMixedExposureMetrics {
  sessionType: SessionType;
  seed: number;
  totalMatches: number;
  scheduledMatches: number;
  completedMatches: number;
  elapsedSessionMinutes: number;
  matchCountsByPlayer: Record<string, number>;
  matchCountSpread: number;
  uniqueSharedCourtRelationships: number;
  possibleSharedCourtRelationships: number;
  repeatedSharedCourtRelationshipEncounters: number;
  repeatedSharedCourtRelationshipPairs: number;
  sharedCourtEncounterFrequencyLoad: number;
  uniquePartnerRelationships: number;
  repeatedPartnerRelationshipEncounters: number;
  repeatedPartnerRelationshipPairs: number;
  partnerEncounterFrequencyLoad: number;
  uniqueOpponentRelationships: number;
  repeatedOpponentRelationshipEncounters: number;
  repeatedOpponentRelationshipPairs: number;
  opponentEncounterFrequencyLoad: number;
  exactRematchEncounters: number;
  mixedMatches: number;
  mensDoublesMatches: number;
  womensDoublesMatches: number;
  invalidMixicanoMatches: number;
  averageBalanceGap: number;
  worstBalanceGap: number;
  averagePointDiffGap: number;
  worstPointDiffGap: number;
  maximumOutstandingMatchCount: number;
  decisionsWithOutstandingMatches: number;
  decisionsWithTwoFreeCourts: number;
  batchSearchLimitReachedDecisions: number;
  batchSearchAttempts: number;
  batchExploredBranches: number;
  maxBatchSearchBranchesPerDecision: number;
}

interface ExposurePlayer extends MatchmakerV3Player {
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  pointDiff: number;
  joinedAt: Date;
  isBusy: boolean;
  isPaused: boolean;
  lastPartnerId: string | null;
}

interface ScheduledMatch extends V3CompletedMatch {
  courtId: number;
  matchNumber: number;
  createdAt: Date;
  scheduledAt: Date;
  finishAt: Date;
  balanceGap: number;
  pointDiffGap: number;
  matchmakingReasonJson: string | null;
}

function createSeededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
}

function createPlayers(seed: number, sessionType: SessionType): ExposurePlayer[] {
  const fixtureRandom = createSeededRandom(seed + 104729);
  const joinedAt = new Date(START_TIME);
  return Array.from({ length: 14 }, (_value, index) => {
    const gender = index < 7 ? PlayerGender.MALE : PlayerGender.FEMALE;
    const ratingRoll = fixtureRandom();
    fixtureRandom();
    return {
      userId: "P" + String(index + 1).padStart(2, "0"),
      gender,
      partnerPreference:
        gender === PlayerGender.FEMALE
          ? PartnerPreference.FEMALE_FLEX
          : PartnerPreference.OPEN,
      matchesPlayed: 0,
      matchmakingBaseline: 0,
      availableSince: joinedAt,
      restTurns: 0,
      strength:
        sessionType === SessionType.ELO
          ? 900 + Math.round(ratingRoll * 200)
          : 0,
      pointDiff: 0,
      isBusy: false,
      isPaused: false,
      lastPartnerId: null,
      joinedAt,
      arrivalPriorityAt: null,
    };
  });
}

interface DeterministicPointsResult {
  winnerTeam: 1 | 2;
  team1Score: number;
  team2Score: number;
}

function createPointsResults(seed: number): DeterministicPointsResult[] {
  const outcomeRandom = createSeededRandom(seed + 209759);
  return Array.from({ length: TOTAL_MATCHES }, () => {
    const winnerTeam = outcomeRandom() < 0.5 ? 1 : 2;
    const margin = 1 + Math.floor(outcomeRandom() * 7);
    return {
      winnerTeam,
      team1Score: winnerTeam === 1 ? 21 : 21 - margin,
      team2Score: winnerTeam === 2 ? 21 : 21 - margin,
    };
  });
}

function pairKey(first: string, second: string) {
  return first < second ? first + "|" + second : second + "|" + first;
}

function getCourtPairs(match: Pick<V3DoublesPartition, "team1" | "team2">) {
  const ids = [...match.team1, ...match.team2];
  const pairs: string[] = [];
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) {
      pairs.push(pairKey(ids[left]!, ids[right]!));
    }
  }
  return pairs;
}

function getPartnerPairs(match: Pick<V3DoublesPartition, "team1" | "team2">) {
  return [
    pairKey(match.team1[0], match.team1[1]),
    pairKey(match.team2[0], match.team2[1]),
  ];
}

function getOpponentPairs(match: Pick<V3DoublesPartition, "team1" | "team2">) {
  return match.team1.flatMap((first) =>
    match.team2.map((second) => pairKey(first, second))
  );
}

function countRelationships(matches: ScheduledMatch[], getPairs: (match: ScheduledMatch) => string[]) {
  const counts = new Map<string, number>();
  for (const match of matches) {
    for (const pair of getPairs(match)) {
      counts.set(pair, (counts.get(pair) ?? 0) + 1);
    }
  }
  return counts;
}

function summarizeRelationshipCounts(counts: Map<string, number>) {
  let repeatedEncounters = 0;
  let repeatedPairs = 0;
  let frequencyLoad = 0;
  for (const count of counts.values()) {
    if (count > 1) {
      repeatedEncounters += count - 1;
      repeatedPairs += 1;
      frequencyLoad += (count * (count - 1)) / 2;
    }
  }
  return {
    unique: counts.size,
    repeatedEncounters,
    repeatedPairs,
    frequencyLoad,
  };
}

function exactPartitionKey(match: Pick<V3DoublesPartition, "team1" | "team2">) {
  return [
    pairKey(match.team1[0], match.team1[1]),
    pairKey(match.team2[0], match.team2[1]),
  ]
    .sort()
    .join("||");
}

function classifyMatch(
  match: Pick<V3DoublesPartition, "team1" | "team2">,
  sideByUserId: Map<string, string | null>
): "MIXED" | "MENS" | "WOMENS" | "INVALID" {
  const ids = [...match.team1, ...match.team2];
  const sides = ids.map((id) => sideByUserId.get(id));
  if (sides.some((side) => side !== "UPPER" && side !== "LOWER")) {
    return "INVALID";
  }
  const team1Sides = match.team1.map((id) => sideByUserId.get(id));
  const team2Sides = match.team2.map((id) => sideByUserId.get(id));
  if (
    team1Sides.includes("UPPER") &&
    team1Sides.includes("LOWER") &&
    team2Sides.includes("UPPER") &&
    team2Sides.includes("LOWER")
  ) {
    return "MIXED";
  }
  if (sides.every((side) => side === "UPPER")) return "MENS";
  if (sides.every((side) => side === "LOWER")) return "WOMENS";
  return "INVALID";
}

function getReasonJson(
  selection: {
    partition: V3DoublesPartition;
    balancedMixedRotation?: unknown;
  },
  sessionType: SessionType
) {
  return selection.balancedMixedRotation
    ? JSON.stringify({
        version: 1,
        source: "v3",
        sessionType,
        sessionMode: SessionMode.MIXICANO,
        selectedUserIds: [...selection.partition.team1, ...selection.partition.team2],
        team1UserIds: selection.partition.team1,
        team2UserIds: selection.partition.team2,
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
    : null;
}

function computeMetrics({
  players,
  completed,
  scheduledMatches,
  sessionType,
  decisionsWithOutstandingMatches,
  maximumOutstandingMatchCount,
  decisionsWithTwoFreeCourts,
  batchSearchLimitReachedDecisions,
  batchSearchAttempts,
  batchExploredBranches,
  maxBatchSearchBranchesPerDecision,
  seed,
}: {
  players: ExposurePlayer[];
  completed: ScheduledMatch[];
  scheduledMatches: number;
  sessionType: SessionType;
  decisionsWithOutstandingMatches: number;
  maximumOutstandingMatchCount: number;
  decisionsWithTwoFreeCourts: number;
  batchSearchLimitReachedDecisions: number;
  batchSearchAttempts: number;
  batchExploredBranches: number;
  maxBatchSearchBranchesPerDecision: number;
  seed: number;
}): BalancedMixedExposureMetrics {
  const shared = summarizeRelationshipCounts(
    countRelationships(completed, getCourtPairs)
  );
  const partners = summarizeRelationshipCounts(
    countRelationships(completed, getPartnerPairs)
  );
  const opponents = summarizeRelationshipCounts(
    countRelationships(completed, getOpponentPairs)
  );
  const exactCounts = new Map<string, number>();
  for (const match of completed) {
    const key = exactPartitionKey(match);
    exactCounts.set(key, (exactCounts.get(key) ?? 0) + 1);
  }
  const exactRematchEncounters = [...exactCounts.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0
  );
  const counts = Object.fromEntries(
    players.map((player) => [player.userId, player.matchesPlayed])
  );
  const countValues = Object.values(counts);
  const categories = new Map<string, number>();
  const sideByUserId = new Map(
    players.map((player) => [
      player.userId,
      getEffectiveMixedSide(player),
    ])
  );
  for (const match of completed) {
    const category = classifyMatch(match, sideByUserId);
    categories.set(category, (categories.get(category) ?? 0) + 1);
  }
  const balanceGaps = completed.map((match) => match.balanceGap);
  const pointDiffGaps = completed.map((match) => match.pointDiffGap);
  const finalCompletionTime = Math.max(
    ...completed.map((match) => match.completedAt?.getTime() ?? START_TIME)
  );

  return {
    sessionType,
    seed,
    totalMatches: TOTAL_MATCHES,
    scheduledMatches,
    completedMatches: completed.length,
    elapsedSessionMinutes: (finalCompletionTime - START_TIME) / 60_000,
    matchCountsByPlayer: counts,
    matchCountSpread:
      countValues.length > 0
        ? Math.max(...countValues) - Math.min(...countValues)
        : 0,
    uniqueSharedCourtRelationships: shared.unique,
    possibleSharedCourtRelationships: 91,
    repeatedSharedCourtRelationshipEncounters: shared.repeatedEncounters,
    repeatedSharedCourtRelationshipPairs: shared.repeatedPairs,
    sharedCourtEncounterFrequencyLoad: shared.frequencyLoad,
    uniquePartnerRelationships: partners.unique,
    repeatedPartnerRelationshipEncounters: partners.repeatedEncounters,
    repeatedPartnerRelationshipPairs: partners.repeatedPairs,
    partnerEncounterFrequencyLoad: partners.frequencyLoad,
    uniqueOpponentRelationships: opponents.unique,
    repeatedOpponentRelationshipEncounters: opponents.repeatedEncounters,
    repeatedOpponentRelationshipPairs: opponents.repeatedPairs,
    opponentEncounterFrequencyLoad: opponents.frequencyLoad,
    exactRematchEncounters,
    mixedMatches: categories.get("MIXED") ?? 0,
    mensDoublesMatches: categories.get("MENS") ?? 0,
    womensDoublesMatches: categories.get("WOMENS") ?? 0,
    invalidMixicanoMatches: categories.get("INVALID") ?? 0,
    averageBalanceGap:
      balanceGaps.reduce((sum, gap) => sum + gap, 0) / balanceGaps.length,
    worstBalanceGap: Math.max(...balanceGaps),
    averagePointDiffGap:
      pointDiffGaps.reduce((sum, gap) => sum + gap, 0) / pointDiffGaps.length,
    worstPointDiffGap: Math.max(...pointDiffGaps),
    maximumOutstandingMatchCount,
    decisionsWithOutstandingMatches,
    decisionsWithTwoFreeCourts,
    batchSearchLimitReachedDecisions,
    batchSearchAttempts,
    batchExploredBranches,
    maxBatchSearchBranchesPerDecision,
  };
}

export function simulateBalancedMixedExposure(
  sessionType: SessionType,
  seed = 4729
): BalancedMixedExposureMetrics {
  const players = createPlayers(seed, sessionType);
  const pointsResults = createPointsResults(seed);
  const completed: ScheduledMatch[] = [];
  const pending: ScheduledMatch[] = [];
  const randomFn = createSeededRandom(seed);
  const sideByUserId = new Map(
    players.map((player) => [player.userId, getEffectiveMixedSide(player)])
  );
  let now = START_TIME;
  let scheduledMatches = 0;
  let decisionsWithOutstandingMatches = 0;
  let maximumOutstandingMatchCount = 0;
  let decisionsWithTwoFreeCourts = 0;
  let batchSearchLimitReachedDecisions = 0;
  let batchSearchAttempts = 0;
  let batchExploredBranches = 0;
  let maxBatchSearchBranchesPerDecision = 0;

  const buildObligations = () =>
    buildBalancedMixedRotationObligations({
      players: players.map((player) => ({
        userId: player.userId,
        availableSince: player.availableSince,
        isPaused: player.isPaused,
      })),
      events: [...completed, ...pending].map((match) => ({
        createdAt: match.createdAt,
        userIds: [...match.team1, ...match.team2],
        matchmakingReasonJson: match.matchmakingReasonJson,
      })),
    });

  const outstandingCounts = () => {
    const counts = new Map<string, number>();
    for (const match of pending) {
      for (const userId of [...match.team1, ...match.team2]) {
        counts.set(userId, (counts.get(userId) ?? 0) + 1);
      }
    }
    return counts;
  };

  const assertProjectedSpread = (selectedIds: string[] = []) => {
    const selected = new Set(selectedIds);
    const projectedCounts = players.map(
      (player) =>
        Math.max(player.matchesPlayed, player.matchmakingBaseline) +
        (outstandingCounts().get(player.userId) ?? 0) +
        Number(selected.has(player.userId))
    );
    return Math.max(...projectedCounts) - Math.min(...projectedCounts);
  };

  const buildMixedHistory = () => [
    ...completed.map(({ team1, team2 }) => ({ team1, team2 })),
    ...pending.map(({ team1, team2 }) => ({ team1, team2 })),
  ];

  const scheduleOpenCourts = () => {
    const busyCourtIds = new Set(pending.map((match) => match.courtId));
    const openCourtIds = Array.from({ length: COURT_COUNT }, (_value, courtId) => courtId)
      .filter((courtId) => !busyCourtIds.has(courtId));
    const courtSlots = Math.min(openCourtIds.length, TOTAL_MATCHES - scheduledMatches);
    if (courtSlots === 0) return;

    const history = buildMixedHistory();
    const countsOutstanding = outstandingCounts();
    if (countsOutstanding.size > 0) {
      decisionsWithOutstandingMatches += 1;
      maximumOutstandingMatchCount = Math.max(
        maximumOutstandingMatchCount,
        Math.max(...countsOutstanding.values())
      );
    }
    if (courtSlots > 1) decisionsWithTwoFreeCourts += 1;
    const timestamp = new Date(now).toISOString();
    const pendingObligations = buildObligations();
    const selections =
      courtSlots > 1
        ? (() => {
            const override = buildBalancedMixedBatchSelectionOverride({
              players,
              mixedHistoryMatches: history,
              completedMatches: completed,
              sessionMode: SessionMode.MIXICANO,
              sessionType,
              respectPlayerRest: true,
              outstandingMatchCountByUserId: countsOutstanding,
              pendingObligations,
              timestamp,
            });
            const result = findBestBatchSelectionV3(players, {
              courtCount: courtSlots,
              sessionMode: SessionMode.MIXICANO,
              sessionType,
              completedMatches: completed,
              mixedHistoryMatches: history,
              selectionOverride: override,
              randomFn,
            });
            batchSearchAttempts += result.debug.searchAttemptCount;
            batchExploredBranches += result.debug.exploredBranches;
            maxBatchSearchBranchesPerDecision = Math.max(
              maxBatchSearchBranchesPerDecision,
              result.debug.exploredBranches
            );
            if (result.debug.searchLimitReached) {
              batchSearchLimitReachedDecisions += 1;
            }
            if (!result.selection) {
              throw new Error(
                "No Balanced Mixed batch for " + sessionType + " at " + timestamp
              );
            }
            return result.selection.selections;
          })()
        : (() => {
            const override = buildBalancedMixedSingleSelectionOverride({
              players,
              mixedHistoryMatches: history,
              completedMatches: completed,
              sessionMode: SessionMode.MIXICANO,
              sessionType,
              respectPlayerRest: true,
              outstandingMatchCountByUserId: countsOutstanding,
              pendingObligations,
              timestamp,
            });
            const result = findBestSingleCourtSelectionV3(players, {
              sessionMode: SessionMode.MIXICANO,
              sessionType,
              completedMatches: completed,
              mixedHistoryMatches: history,
              selectionOverride: override,
              randomFn,
            });
            if (!result.selection) {
              throw new Error(
                "No Balanced Mixed single court selection for " +
                  sessionType +
                  " at " +
                  timestamp
              );
            }
            return [result.selection];
          })();

    const selectedIds = selections.flatMap((selection) => selection.ids);
    if (new Set(selectedIds).size !== selectedIds.length) {
      throw new Error("A player appeared on both courts in a batch");
    }
    const preexistingSpread = assertProjectedSpread();
    if (preexistingSpread <= 1 && assertProjectedSpread(selectedIds) > 1) {
      throw new Error("A Balanced Mixed decision exceeded the one match spread");
    }
    const courtTypeCounts = new Map<string, number>();
    for (const selection of selections) {
      const category = classifyMatch(selection.partition, sideByUserId);
      if (category === "INVALID") {
        throw new Error("The matcher produced an illegal MIXICANO partition");
      }
      courtTypeCounts.set(
        category,
        (courtTypeCounts.get(category) ?? 0) + 1
      );
    }

    for (const [index, selection] of selections.entries()) {
      const matchNumber = scheduledMatches;
      const createdAt = new Date(now);
      const match: ScheduledMatch = {
        ...selection.partition,
        courtId: openCourtIds[index]!,
        matchNumber,
        createdAt,
        scheduledAt: createdAt,
        finishAt: new Date(
          now + MATCH_DURATIONS_MINUTES[matchNumber]! * MATCH_DURATION_SCALE * 60_000
        ),
        balanceGap: selection.balanceGap,
        pointDiffGap: selection.pointDiffGap,
        matchmakingReasonJson: getReasonJson(selection, sessionType),
      };
      for (const userId of [...match.team1, ...match.team2]) {
        const player = players.find((candidate) => candidate.userId === userId)!;
        player.isBusy = true;
      }
      pending.push(match);
      scheduledMatches += 1;
    }

    const afterScheduleSpread = assertProjectedSpread();
    if (afterScheduleSpread > 1) {
      throw new Error("Projected match count spread exceeded one after scheduling");
    }
  };

  scheduleOpenCourts();

  while (completed.length < TOTAL_MATCHES) {
    if (pending.length === 0) {
      throw new Error("Simulation stalled before all matches completed");
    }
    const nextFinishTime = Math.min(
      ...pending.map((match) => match.finishAt.getTime())
    );
    now = nextFinishTime;
    const finishing = pending
      .filter((match) => match.finishAt.getTime() === nextFinishTime)
      .sort((left, right) => left.courtId - right.courtId);
    const finishingNumbers = new Set(finishing.map((match) => match.matchNumber));

    for (const match of finishing) {
      if (sessionType === SessionType.POINTS) {
        const result = pointsResults[match.matchNumber]!;
        const pointDiff = result.team1Score - result.team2Score;
        for (const userId of match.team1) {
          const player = players.find((candidate) => candidate.userId === userId)!;
          if (result.winnerTeam === 1) player.strength += 3;
          player.pointDiff += pointDiff;
        }
        for (const userId of match.team2) {
          const player = players.find((candidate) => candidate.userId === userId)!;
          if (result.winnerTeam === 2) player.strength += 3;
          player.pointDiff -= pointDiff;
        }
      }
      const finishedIds = new Set([...match.team1, ...match.team2]);
      match.completedAt = new Date(nextFinishTime);
      completed.push(match);
      for (const player of players) {
        if (finishedIds.has(player.userId)) {
          player.matchesPlayed += 1;
          player.matchmakingBaseline += 1;
          player.isBusy = false;
          player.availableSince = new Date(nextFinishTime);
        }
      }
    }
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      if (finishingNumbers.has(pending[index]!.matchNumber)) pending.splice(index, 1);
    }

    const restTurns = buildRestTurnsByUserId(players, completed);
    for (const player of players) {
      player.restTurns = restTurns.get(player.userId) ?? 0;
    }
    if (scheduledMatches < TOTAL_MATCHES) scheduleOpenCourts();
  }

  if (scheduledMatches !== TOTAL_MATCHES || completed.length !== TOTAL_MATCHES) {
    throw new Error("Simulation did not schedule and complete exactly 20 matches");
  }

  return computeMetrics({
    players,
    completed,
    scheduledMatches,
    sessionType,
    decisionsWithOutstandingMatches,
    maximumOutstandingMatchCount,
    decisionsWithTwoFreeCourts,
    batchSearchLimitReachedDecisions,
    batchSearchAttempts,
    batchExploredBranches,
    maxBatchSearchBranchesPerDecision,
    seed,
  });
}
