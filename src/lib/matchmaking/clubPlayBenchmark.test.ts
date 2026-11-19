import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { describe, expect, it, vi } from "vitest";
import { rankOpenCourtsForGroupType } from "@/lib/courtGroupRotation";
import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { getStandingPointsForTeam } from "@/lib/sessionStandings";
import {
  MatchStatus, MixedSide, SessionBalanceMetric, SessionCollabFormat, SessionMatchmakingStyle,
  SessionMode, SessionPairingMode, SessionScoringType, SessionStatus, SessionType,
} from "@/types/enums";
import {
  buildMatchmakingState, getRankedCandidates, selectBatchMatchesRespectingSkips,
  selectSingleCourtMatchRespectingSkips,
} from "@/app/api/sessions/[code]/generate-match/selection";
import { GenerateMatchError, type GenerateMatchSession } from "@/app/api/sessions/[code]/generate-match/shared";
import { canAttemptQueueWithinSearchBudget, usesGroupedMixedCapacityBudget } from "@/app/api/sessions/[code]/generate-match/queueBudget";
import { selectAutomaticClubPlayQueueAssignment } from "@/app/api/sessions/[code]/queue-match/shared";
import { calculateNoCatchUpMatchmakingCredit } from "./matchmakingCredit";
import { getDoublesPartitions, isValidPartitionForMode } from "./v3/balance";
import { isBalanceGuardrailAdmissible } from "./v3/balanceGuardrail";
import { getExactPartitionKey } from "./v3/rematch";
import { createMatchmakingSearchBudget, MatchmakingSearchBudgetExceededError } from "./v3/searchBudget";
import type { V3BalanceGuardrail, V3DoublesPartition } from "./v3/types";
import { getBusyPlayerIds } from "./busyFilter";
import { analyzeReplayAdmission, type ReplayDecision } from "./clubPlayReplayAdmission";
import { buildClubPlayDistributionTargets, parseClubPlayDistributionSnapshot } from "./ladder/clubPlayDistribution";
import type { ClubPlaySelectionDiagnostics } from "./ladder/clubPlaySelection";
import { getLevelMatchCategory, LEVEL_MATCH_TYPES } from "./ladder/levelDistribution";
import {
  benchmarkRandom, clubPlayBenchmarkScenarios, makeClubPlayBenchmarkScenario, predictedWinChance,
  type BenchmarkPlayer, type ScenarioId,
} from "./clubPlayBenchmarkFixtures";

// The selection service still runs for all policies. The in-memory clock and
// preloaded club profile ratings remove database and network variability.
vi.mock("@/lib/prisma", () => ({ prisma: { sessionClub: { findMany: async () => [] } } }));
vi.mock("@/lib/sessionCollab", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/sessionCollab")>(),
  getAcceptedSessionClubIds: async (_db: unknown, session: { clubId: string }) => [session.clubId],
}));
vi.mock("@/lib/guestRating", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/guestRating")>(),
  getGuestRatingsByUserId: async (_db: unknown, guests: { userId: string; startingRating: number }[]) =>
    new Map(guests.map((guest) => [guest.userId, guest.startingRating])),
}));

const policies = ["club-play", "level-match", "grouped-points"] as const;
type Policy = typeof policies[number];
type Seat = GenerateMatchSession["players"][number];
type Court = GenerateMatchSession["courts"][number];
type Selection = ReturnType<typeof selectSingleCourtMatchRespectingSkips>["selection"];
type Match = GenerateMatchSession["matches"][number];

const origin = new Date("2026-10-15T00:00:00Z").getTime();
const minuteMs = 60_000;
const clock = (minute: number) => new Date(origin + minute * minuteMs);
const mean = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const max = (values: readonly number[]) => values.length ? Math.max(...values) : null;
const p95 = (values: readonly number[]) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1] : null;
const sides = (values: readonly BenchmarkPlayer[]) => (id: string) => values.find((player) => player.id === id)?.effectiveSide;
const idsOf = ({ team1, team2 }: V3DoublesPartition) => [...team1, ...team2];
const categories = () => ({ UPPER: 0, MIXED: 0, LOWER: 0 });

function replayCandidates(ranked: ReturnType<typeof getRankedCandidates>["rankedCandidates"]) {
  return ranked.map(({ userId, effectiveMatchCount, restTurns, arrivalPriorityAt }) => (
    { userId, effectiveMatchCount, restTurns, arrivalPriorityAt }
  ));
}

function clubPlayReason(selection?: Selection) {
  return selection?.matchmakingReasonJson ? JSON.parse(selection.matchmakingReasonJson) as
    Partial<ClubPlaySelectionDiagnostics> & { source?: string } : null;
}

interface PlayerMetrics {
  started: number;
  completed: number;
  activeMinutes: number;
  missedTurns: number;
  waits: number[];
  longestUnfinishedWait: number;
  backToBack: number;
  own: number;
  mixed: number;
  expectedMixed: number;
  partners: Set<string>;
  opponents: Set<string>;
  opponentGaps: number[];
  similarOpponents: number;
  severe: number;
  wins: number;
  oppositePoolOpposition: number;
  winsAgainstOppositePool: number;
  trueWinForecastError: number[];
}

function playerMetrics(): PlayerMetrics {
  return { started: 0, completed: 0, activeMinutes: 0, missedTurns: 0, waits: [], longestUnfinishedWait: 0,
    backToBack: 0, own: 0, mixed: 0, expectedMixed: 0, partners: new Set(), opponents: new Set(), opponentGaps: [],
    similarOpponents: 0, severe: 0, wins: 0, oppositePoolOpposition: 0, winsAgainstOppositePool: 0, trueWinForecastError: [] };
}

interface Assignment {
  id: string;
  selection: Selection;
  target: ReturnType<ReturnType<typeof buildClubPlayDistributionTargets>>;
  consumedSkipUserIds: string[];
}

interface LiveMatch extends Assignment {
  row: Match;
  finishesAt: number;
  winner: 1 | 2;
  estimatedGap: number;
  actualGap: number;
}

function createSession(policy: Policy, seats: Seat[], courts: Court[], open: boolean, queued: boolean): GenerateMatchSession {
  const grouped = policy === "grouped-points";
  return {
    id: `benchmark-${policy}`, code: "CLUBBENCH", clubId: "synthetic-club", status: SessionStatus.ACTIVE,
    type: grouped ? SessionType.POINTS : policy === "club-play" ? SessionType.CLUB_PLAY : SessionType.RACE,
    matchmakingStyle: grouped ? SessionMatchmakingStyle.BALANCED : policy === "club-play" ? SessionMatchmakingStyle.CLUB_PLAY : SessionMatchmakingStyle.LEVEL_MATCH,
    balanceMetric: grouped ? SessionBalanceMetric.SESSION_POINTS : SessionBalanceMetric.RATING,
    mode: open ? SessionMode.MEXICANO : SessionMode.MIXICANO, pairingMode: open ? SessionPairingMode.OPEN : SessionPairingMode.MIXED,
    scoringType: SessionScoringType.POINTS, collabFormat: SessionCollabFormat.FREE_PLAY,
    poolsEnabled: grouped, respectPlayerRest: true, ratingPolicyVersion: 2, autoQueueEnabled: queued,
    players: seats, courts, matches: [], queuedMatch: null, sessionClubs: [],
  } as unknown as GenerateMatchSession;
}

function makeSeat(player: BenchmarkPlayer, minute = 0): Seat {
  const now = clock(minute);
  return {
    playerId: player.id, userId: player.id, matchesPlayed: 0, matchmakingMatchesCredit: 0,
    sessionPoints: 0, joinedAt: now, ladderEntryAt: now, availableSince: now, arrivalPriorityAt: minute > 0 ? now : null,
    isPaused: false, isGuest: player.isGuest, gender: player.gender, pool: player.pool,
    partnerPreference: player.partnerPreference, mixedSideOverride: player.mixedSideOverride,
    lastPartnerId: null, skipNextMatchAt: null, profileClubId: player.isGuest ? null : "synthetic-club",
    user: { id: player.id, name: player.id, elo: player.rating },
    player: { id: player.id, name: player.id, elo: player.rating },
  } as Seat;
}

function assignmentRow(assignment: Assignment, minute: number) {
  const { partition } = assignment.selection;
  const [a, b, c, d] = idsOf(partition);
  return {
    id: assignment.id, createdAt: clock(minute), isAutomatic: true,
    team1User1Id: a, team1User2Id: b, team2User1Id: c, team2User2Id: d,
    team1Player1Id: a, team1Player2Id: b, team2Player1Id: c, team2Player2Id: d,
    targetPool: "targetPool" in assignment.selection ? assignment.selection.targetPool : null,
    courtGroupType: "courtGroupType" in assignment.selection ? assignment.selection.courtGroupType : null,
    poolASeatCount: "poolASeatCount" in assignment.selection ? assignment.selection.poolASeatCount : null,
    poolBSeatCount: "poolBSeatCount" in assignment.selection ? assignment.selection.poolBSeatCount : null,
    matchmakingReasonJson: assignment.selection.matchmakingReasonJson ?? null,
  };
}

/** Verify whole-batch alternatives using the same seats, so fairness is identical. */
function hasNonSevereBatchWitness(seats: string[], severe: (players: readonly string[]) => boolean,
  legal: (partition: V3DoublesPartition) => boolean, observedGap: (partition: V3DoublesPartition) => number,
  guardrail: V3BalanceGuardrail, memo = new Map<string, number>(), total = 0,
): boolean {
  if (guardrail.allowedTotalBalanceGap !== null && total > guardrail.allowedTotalBalanceGap) return false;
  if (seats.length === 0) return true;
  const key = seats.join("|");
  if ((memo.get(key) ?? Infinity) <= total) return false;
  memo.set(key, total);
  for (let b = 1; b < seats.length - 2; b++) {
    for (let c = b + 1; c < seats.length - 1; c++) {
      for (let d = c + 1; d < seats.length; d++) {
        const quartet: [string, string, string, string] = [seats[0], seats[b], seats[c], seats[d]];
        if (severe(quartet)) continue;
        const gap = Math.min(...getDoublesPartitions(quartet).filter(legal).map(observedGap));
        if (gap > guardrail.allowedMaxBalanceGap) continue;
        if (hasNonSevereBatchWitness(seats.filter((id) => !quartet.includes(id)), severe, legal, observedGap, guardrail, memo, total + gap)) return true;
      }
    }
  }
  return false;
}

async function simulate(scenario: ScenarioId, policy: Policy, seed: number) {
  const { config, players, calibration } = makeClubPlayBenchmarkScenario(scenario, seed);
  let horizon = config.duration ?? 120;
  const late = config.lifecycle ? [...players.slice(-2)] : [];
  const seats = players.filter((player) => !late.includes(player)).map((player) => makeSeat(player));
  const courts = Array.from({ length: config.courts }, (_, index) => ({ id: `c${index + 1}`, isActive: true, currentMatchId: null } as Court));
  const session = createSession(policy, seats, courts, Boolean(config.open), Boolean(config.queued));
  const byId = new Map(players.map((player) => [player.id, player]));
  const metrics = new Map(players.map((player) => [player.id, playerMetrics()]));
  const active = new Map<string, LiveMatch>();
  const courtStarts = new Map(courts.map((court) => [court.id, 0]));
  const removed = new Set<string>();
  const completedPartitions = new Set<string>();
  const actual = categories(), expected = categories();
  const courtRatingSpreads: number[] = [], trueCourtGaps: number[] = [], observedTeamGaps: number[] = [], trueTeamGaps: number[] = [];
  const mixedRankGaps: number[] = [], withinSideGaps: number[] = [], compatibility: number[] = [];
  const latencies: { elapsedMs: number; courts: number; queue: boolean }[] = [];
  const decisions: unknown[] = [];
  const replayDecisions: ReplayDecision[] = [];
  const traceReplay = config.completionLimit !== undefined && config.courts <= 2 && !config.open && !config.lifecycle &&
    policy === "club-play" && Boolean(process.env.CLUB_PLAY_BENCHMARK_OUTPUT);
  let started = 0, completed = 0, backToBack = 0, repeatExact = 0, severeCount = 0, avoidableSevere = 0;
  let crossPool = 0, extremeHighLow = 0, unknownType = 0, unusedCourtMinutes = 0;
  let queue: Assignment | null = null, queueCreated = 0, queueActivated = 0, queueCanceled = 0, queueRevalidatedToDifferentLineup = 0;
  let invalid = 0, fairness = 0, balance = 0, guardrailChecks = 0, exhausted = 0, fallback = 0, failed = 0;
  const failureReasons: Record<string, number> = {};

  const legal = (partition: V3DoublesPartition) => isValidPartitionForMode(partition, byId, session.mode as SessionMode);
  const signedGap = ({ team1, team2 }: V3DoublesPartition, trueSkill: boolean) => (
    team1.reduce((sum, id) => sum + (trueSkill ? byId.get(id)!.trueRating : byId.get(id)!.rating), 0) -
    team2.reduce((sum, id) => sum + (trueSkill ? byId.get(id)!.trueRating : byId.get(id)!.rating), 0)
  ) / 2;
  const observedGap = (partition: V3DoublesPartition) => Math.abs(signedGap(partition, false));
  const severe = (ids: readonly string[]) => {
    const clusters = ids.map((id) => byId.get(id)!.skillCluster);
    return clusters.includes(0) && clusters.includes(2);
  };
  const eligible = (id: string) => seats.some((seat) => seat.userId === id && !seat.isPaused) &&
    ![...active.values()].some((game) => game.selection.ids.includes(id));
  const creditRoster = (seat: Seat) => seats.filter((other) => !other.isPaused && other !== seat &&
    (!session.poolsEnabled || other.pool === seat.pool));

  async function select(openCourts: Court[], minute: number, queued = false, searchBudget?: ReturnType<typeof createMatchmakingSearchBudget>) {
    const start = performance.now();
    let matcherFinished: number | undefined;
    const rng = benchmarkRandom(seed + minute * 101 + openCourts.length * 53 + Number(queued));
    const random = vi.spyOn(Math, "random").mockImplementation(rng);
    try {
      const state = await buildMatchmakingState(session);
      const { rankedCandidates } = getRankedCandidates(session, state.busyPlayerIds);
      if (rankedCandidates.length < 4) return [];
      const requestCount = queued ? 1 : openCourts.length;
      let result: Selection[];
      let consumedSkipUserIds: string[];
      let guardrail: V3BalanceGuardrail | undefined;
      if (requestCount === 1) {
        const selected = selectSingleCourtMatchRespectingSkips({ ...state, rankedCandidates, sessionData: session, reshuffleSource: null, searchBudget });
        result = [selected.selection];
        consumedSkipUserIds = selected.consumedSkipUserIds;
      } else {
        const { selection, consumedSkipUserIds: skipped } = selectBatchMatchesRespectingSkips({
          ...state, rankedCandidates, sessionData: session, requestedMatchCount: requestCount,
          requestedCourtIds: openCourts.map((court) => court.id), randomFn: rng, searchBudget,
        });
        result = selection.selections;
        consumedSkipUserIds = skipped;
        guardrail = "balanceGuardrail" in selection && selection.balanceGuardrail ? selection.balanceGuardrail as V3BalanceGuardrail : undefined;
      }
      matcherFinished = performance.now();
      const first = result[0];
      const club = policy === "club-play" ? clubPlayReason(first) : null;
      const level = first && "levelDiagnostics" in first ? first.levelDiagnostics : undefined;
      const balanced = first?.balancedPolicyDecision;
      if (result.length > requestCount || new Set(result.flatMap((court) => court.ids)).size !== result.length * 4) invalid++;
      if ((policy === "club-play" && club?.baselineCertified !== true) || level?.baselineCertified === false || balanced?.outcome === "no-certified-selection") fairness++;
      if (club?.searchLimitReached || level?.searchLimitReached || balanced?.candidateSearch.searchLimitReached || balanced?.fallbackSearch?.searchLimitReached) exhausted++;
      if ((club?.fallback && club.fallback !== "none") || balanced?.outcome === "production-fallback") fallback++;
      if (first && "clubPlayContext" in first) guardrail ??= first.clubPlayContext?.balanceGuardrail;
      if (first && "levelContext" in first) guardrail ??= first.levelContext?.balanceGuardrail;
      if (club) decisions.push({ minute, queued, completed, types: result.map((choice) => clubPlayReason(choice)?.matchType),
        chosen: result.map((choice) => choice.partition), distribution: club.distribution,
        compatibility: club.compatibility, bestCompatibility: club.bestCompatibility, allowedCompatibility: club.allowedCompatibility,
        certified: club.baselineCertified, exhausted: club.searchLimitReached, fallback: club.fallback,
        available: replayCandidates(rankedCandidates),
      });
      if (traceReplay && first && "clubPlayContext" in first && first.clubPlayContext) {
        replayDecisions.push({ minute, completed, action: queued ? "reserve" : "start", available: replayCandidates(rankedCandidates),
          selected: result.map((choice) => choice.partition), context: first.clubPlayContext });
      }
      if (guardrail) {
        const gaps = result.map((choice) => guardrail!.mode === "RATING" ? observedGap(choice.partition) :
          Math.abs(choice.partition.team1.reduce((sum, id) => sum + (state.playersById.get(id)?.elo ?? 0), 0)
            - choice.partition.team2.reduce((sum, id) => sum + (state.playersById.get(id)?.elo ?? 0), 0)) / 2);
        guardrailChecks++;
        if (!isBalanceGuardrailAdmissible({ maxBalanceGap: Math.max(...gaps), totalBalanceGap: gaps.reduce((sum, gap) => sum + gap, 0) }, guardrail)) balance++;
        if (club && result.some((choice) => severe(choice.ids)) && hasNonSevereBatchWitness(
          result.flatMap((choice) => choice.ids).sort(), severe, legal, observedGap, guardrail,
        )) avoidableSevere += result.filter((choice) => severe(choice.ids)).length;
      }
      const targetFor = buildClubPlayDistributionTargets(seats);
      return result.map((selection, index) => {
        const reason = clubPlayReason(selection);
        if (policy === "club-play" && reason?.source !== "club-play") invalid++;
        const snapshot = parseClubPlayDistributionSnapshot(reason?.clubPlayMatchType, selection.partition);
        const target = config.open ? undefined : snapshot ?? targetFor(selection.partition);
        if (policy === "club-play" && !config.open && !snapshot) invalid++;
        return { id: `${minute}-${queued ? "queue" : openCourts.length}-${index}`, selection, target, consumedSkipUserIds };
      });
    } catch (error) {
      if (!(error instanceof GenerateMatchError) && !(error instanceof MatchmakingSearchBudgetExceededError)) throw error;
      if (error instanceof MatchmakingSearchBudgetExceededError || /search|computation budget/i.test(error.message)) exhausted++;
      failureReasons[error.message] = (failureReasons[error.message] ?? 0) + 1;
      failed++;
      return [];
    } finally {
      random.mockRestore();
      latencies.push({ elapsedMs: (matcherFinished ?? performance.now()) - start, courts: queued ? 1 : openCourts.length, queue: queued });
    }
  }

  function launch(assignment: Assignment, court: Court, minute: number) {
    const { ids, partition } = assignment.selection;
    const partitionIds = idsOf(partition);
    if (!court.isActive || court.currentMatchId || !legal(partition) || new Set(partitionIds).size !== 4 ||
      partitionIds.some((id) => !ids.includes(id) || !eligible(id))) {
      invalid++;
      return false;
    }
    const startNumber = courtStarts.get(court.id)!;
    courtStarts.set(court.id, startNumber + 1);
    const random = benchmarkRandom(seed + startNumber * 104_729 + Number(court.id.slice(1)) * 1_000_003);
    random(); // Warm the seeded generator before the independently drawn duration and result.
    const matchMinutes = config.fixedGameMinutes ?? 8 + Math.floor(random() * 3);
    const estimatedGap = signedGap(partition, false), actualGap = signedGap(partition, true);
    const winner = random() < predictedWinChance(actualGap) ? 1 : 2;
    const row = { ...assignmentRow(assignment, minute), courtId: court.id, status: MatchStatus.IN_PROGRESS } as unknown as Match;
    active.set(court.id, { ...assignment, row, finishesAt: minute + matchMinutes, winner, estimatedGap, actualGap });
    court.currentMatchId = row.id;
    session.matches.push(row);
    started++;
    for (const id of ids) {
      const player = seats.find((seat) => seat.userId === id)!;
      const result = metrics.get(id)!;
      const wait = (clock(minute).getTime() - player.availableSince.getTime()) / minuteMs;
      if (wait === 0 && result.started > 0) {
        result.backToBack++;
        backToBack++;
      }
      result.started++;
      result.waits.push(wait);
      player.arrivalPriorityAt = null;
    }
    for (const player of seats) if (assignment.consumedSkipUserIds.includes(player.userId)) player.skipNextMatchAt = null;
    return true;
  }

  function finish(game: LiveMatch, court: Court, minute: number) {
    const { partition, ids } = game.selection;
    const type = getLevelMatchCategory(partition, sides(players));
    if (type) actual[type]++;
    else unknownType++;
    if (game.target) for (const category of LEVEL_MATCH_TYPES) expected[category] += game.target.target[category];
    const ratings = ids.map((id) => byId.get(id)!.rating);
    courtRatingSpreads.push(Math.max(...ratings) - Math.min(...ratings));
    observedTeamGaps.push(Math.abs(game.estimatedGap));
    trueTeamGaps.push(Math.abs(game.actualGap));
    const diag = policy === "club-play" ? clubPlayReason(game.selection) :
      "levelDiagnostics" in game.selection ? game.selection.levelDiagnostics : undefined;
    if (diag?.compatibility != null) compatibility.push(diag.compatibility);
    const courtPlayers = ids.map((id) => byId.get(id)!);
    const clusteringRating = (player: BenchmarkPlayer) => type === "MIXED" ? player.mixedComparableRating : player.trueRating;
    const trueRatings = courtPlayers.map(clusteringRating);
    trueCourtGaps.push(Math.max(...trueRatings) - Math.min(...trueRatings));
    if (type === "MIXED") {
      // Mid-ranks in the actual participating reference cohort, including busy players.
      const sideRanks = [MixedSide.UPPER, MixedSide.LOWER].map((side) => {
        const roster = players.filter((player) => player.effectiveSide === side && seats.some((seat) => seat.userId === player.id && !seat.isPaused));
        const played = courtPlayers.filter((player) => player.effectiveSide === side);
        withinSideGaps.push(Math.abs(played[0].rating - played[1].rating));
        return played.map((player) => (roster.filter((p) => p.rating < player.rating).length + 0.5 * roster.filter((p) => p.rating === player.rating).length)
          / Math.max(1, roster.length)).sort((a, b) => a - b);
      });
      mixedRankGaps.push(Math.max(Math.abs(sideRanks[0][0] - sideRanks[1][0]), Math.abs(sideRanks[0][1] - sideRanks[1][1])));
    }
    const exact = getExactPartitionKey(partition);
    repeatExact += Number(completedPartitions.has(exact));
    completedPartitions.add(exact);
    crossPool += Number(new Set(courtPlayers.map((player) => player.pool)).size > 1);
    severeCount += Number(severe(ids));
    extremeHighLow += Number([partition.team1, partition.team2].some(severe));
    const forecastError = Math.abs(predictedWinChance(game.estimatedGap) - predictedWinChance(game.actualGap));
    for (const [teamIndex, team] of [partition.team1, partition.team2].entries()) {
      const opponents = teamIndex === 0 ? partition.team2 : partition.team1;
      const won = game.winner === teamIndex + 1;
      for (const id of team) {
        const result = metrics.get(id)!;
        const player = seats.find((seat) => seat.userId === id)!;
        const ownPlayer = byId.get(id)!;
        const partner = team.find((candidate) => candidate !== id)!;
        result.completed++;
        result.own += Number(type === ownPlayer.effectiveSide && type !== null);
        result.mixed += Number(type === "MIXED");
        result.expectedMixed += game.target?.mixedTargetByPlayer[id] ?? 0;
        result.partners.add(partner);
        result.severe += Number(severe(ids) && ownPlayer.skillCluster !== 1);
        result.wins += Number(won);
        const facedOppositePool = opponents.some((opponent) => byId.get(opponent)!.pool !== ownPlayer.pool);
        result.oppositePoolOpposition += Number(facedOppositePool);
        result.winsAgainstOppositePool += Number(won && facedOppositePool);
        result.trueWinForecastError.push(forecastError);
        for (const opponent of opponents) {
          const other = byId.get(opponent)!;
          const gap = Math.abs(clusteringRating(ownPlayer) - clusteringRating(other));
          result.opponents.add(opponent);
          result.opponentGaps.push(gap);
          // Diagnostic only. Wide-roster similarities use the planted clusters.
          result.similarOpponents += Number(ownPlayer.skillCluster !== null ? ownPlayer.skillCluster === other.skillCluster : gap <= 100);
        }
        player.matchesPlayed++;
        player.availableSince = clock(minute);
        player.lastPartnerId = partner;
        player.sessionPoints += getStandingPointsForTeam(game.winner, teamIndex === 0 ? 1 : 2);
      }
    }
    Object.assign(game.row, {
      status: MatchStatus.COMPLETED, completedAt: clock(minute), winnerTeam: game.winner,
      team1Score: game.winner === 1 ? 21 : 16, team2Score: game.winner === 2 ? 21 : 16,
    });
    active.delete(court.id);
    court.currentMatchId = null;
    completed++;
  }

  const waitToPause = (players: Seat[], minute: number) => {
    for (const seat of players) {
      if (eligible(seat.userId)) {
        const result = metrics.get(seat.userId)!;
        result.longestUnfinishedWait = Math.max(result.longestUnfinishedWait, (clock(minute).getTime() - seat.availableSince.getTime()) / minuteMs);
      }
      seat.isPaused = true;
    }
  };
  for (let minute = 0; minute <= horizon; minute++) {
    let changed = minute === 0;
    for (const court of courts) {
      if (completed === config.completionLimit) break;
      const game = active.get(court.id);
      if (game?.finishesAt === minute) { finish(game, court, minute); changed = true; }
    }
    if (completed === config.completionLimit) {
      horizon = minute;
      break;
    }
    if (config.lifecycle) {
      if (minute === 18) {
        for (const player of late) {
          const seat = makeSeat(player, minute);
          seat.matchmakingMatchesCredit = calculateNoCatchUpMatchmakingCredit({ player: seat, activePlayers: creditRoster(seat) });
          seats.push(seat);
        }
        changed = true;
      }
      if (minute === 42 || minute === 63) {
        courts[2].isActive = minute === 63;
        session.courts = courts.filter((court) => court.isActive);
        changed = true;
      }
      if (minute === 49 || minute === 97) {
        const player = seats[minute === 49 ? 0 : 1];
        waitToPause([player], minute);
        if (minute === 97) removed.add(player.userId);
        changed = true;
      }
      if (minute === 72) {
        const player = seats[0];
        player.matchmakingMatchesCredit = calculateNoCatchUpMatchmakingCredit({ player, activePlayers: creditRoster(player) });
        player.availableSince = player.ladderEntryAt = player.arrivalPriorityAt = clock(minute);
        player.isPaused = false;
        changed = true;
      }
    }
    if (minute === horizon) break;
    if (changed) {
      let open = courts.filter((court) => court.isActive && !court.currentMatchId);
      const needsReplacement = queue && queue.selection.ids.some((id) => !eligible(id));
      if (queue && (needsReplacement || open.length)) {
        let toLaunch = needsReplacement ? null : queue;
        if (policy === "club-play" && open.length) {
          const start = performance.now();
          try {
            const { chosen, consumedSkipUserIds } = await selectAutomaticClubPlayQueueAssignment(session);
            if (traceReplay && "clubPlayContext" in chosen && chosen.clubPlayContext) {
              const { rankedCandidates } = getRankedCandidates(session, getBusyPlayerIds(session.matches));
              replayDecisions.push({ minute, completed, action: "activate", available: replayCandidates(rankedCandidates),
                selected: [chosen.partition], context: chosen.clubPlayContext });
            }
            const target = parseClubPlayDistributionSnapshot(clubPlayReason(chosen)?.clubPlayMatchType, chosen.partition);
            if (!config.open && !target) invalid++;
            toLaunch = { ...queue, selection: chosen, consumedSkipUserIds, target: target ?? undefined };
            if (getExactPartitionKey(chosen.partition) !== getExactPartitionKey(queue.selection.partition)) queueRevalidatedToDifferentLineup++;
          } catch (error) {
            if (!(error instanceof GenerateMatchError) && !(error instanceof MatchmakingSearchBudgetExceededError)) throw error;
            toLaunch = null;
          } finally {
            latencies.push({ elapsedMs: performance.now() - start, courts: 1, queue: true });
          }
        }
        session.queuedMatch = null;
        if (toLaunch && launch(toLaunch, open[0], minute)) queueActivated++;
        else queueCanceled++;
        queue = null;
        open = open.filter((court) => !court.currentMatchId);
      }
      const available = seats.filter((seat) => eligible(seat.userId));
      const maxCourts = Math.min(open.length, Math.floor(available.length / 4));
      const budget = maxCourts > 0 && (policy === "club-play" || usesGroupedMixedCapacityBudget({
        poolsEnabled: session.poolsEnabled, sessionMode: session.mode as SessionMode, sessionType: session.type as SessionType,
        requestedMatchCount: maxCourts, eligiblePlayerCount: available.length,
      })) ? createMatchmakingSearchBudget() : undefined;
      const usedSeats = new Set<string>();
      // The host can resubmit a smaller request if a full batch was not feasible.
      for (let count = maxCourts; count >= 1; count--) {
        const chosen = await select(open.slice(0, count), minute, false, budget);
        if (!chosen.length) continue;
        let remainingCourts = open.slice(0, count);
        for (const assignment of chosen) {
          const group = "courtGroupType" in assignment.selection ? assignment.selection.courtGroupType : null;
          const court = chosen.length === count ? remainingCourts[0] : rankOpenCourtsForGroupType(remainingCourts, session.matches, group)[0];
          if (launch(assignment, court, minute)) for (const id of assignment.selection.ids) usedSeats.add(id);
          remainingCourts = remainingCourts.filter((candidate) => candidate.id !== court.id);
        }
        break;
      }
      if (maxCourts > 0) for (const seat of available) if (!usedSeats.has(seat.userId)) metrics.get(seat.userId)!.missedTurns++;
      if (config.queued && !queue && courts.every((court) => !court.isActive || court.currentMatchId) &&
        seats.filter((seat) => eligible(seat.userId)).length >= 4 && canAttemptQueueWithinSearchBudget(budget)) {
        const [assignment] = await select([], minute, true, budget);
        if (assignment) {
          queue = assignment;
          queueCreated++;
          session.queuedMatch = assignmentRow(queue, minute) as unknown as GenerateMatchSession["queuedMatch"];
        }
      }
    }
    for (const seat of seats) if (!seat.isPaused) metrics.get(seat.userId)!.activeMinutes++;
    unusedCourtMinutes += courts.filter((court) => court.isActive && !court.currentMatchId).length;
  }
  waitToPause(seats.filter((seat) => !seat.isPaused), horizon);

  const sideCounts = new Map([MixedSide.UPPER, MixedSide.LOWER].map((side) => [side, players.filter((player) => player.effectiveSide === side).length]));
  const canFormCourt = (side: MixedSide | null) => config.open ? players.length >= 4 : Boolean(side &&
    (sideCounts.get(side)! >= 4 || (sideCounts.get(MixedSide.UPPER)! >= 2 && sideCounts.get(MixedSide.LOWER)! >= 2)));
  const individual = players.map((player) => {
    const result = metrics.get(player.id)!;
    return { id: player.id, segment: player.skillSegment, side: player.effectiveSide, rating: player.rating, trueRating: player.trueRating,
      started: result.started, completed: result.completed, activeMinutes: result.activeMinutes, arrivedLate: late.includes(player), leftEarly: removed.has(player.id),
      noCatchUpCredit: seats.find((seat) => seat.userId === player.id)?.matchmakingMatchesCredit ?? 0,
      structurallyEligible: canFormCourt(player.effectiveSide),
      own: result.own, mixed: result.mixed, expectedMixed: result.expectedMixed, backToBack: result.backToBack, missedTurns: result.missedTurns,
      meanWait: mean(result.waits), maxWait: Math.max(max(result.waits) ?? 0, result.longestUnfinishedWait),
      similarOpponentShare: result.opponentGaps.length ? result.similarOpponents / result.opponentGaps.length : null,
      meanOpponentGap: mean(result.opponentGaps), maxOpponentGap: max(result.opponentGaps), severeMatches: result.severe,
      wins: result.wins, oppositePoolOpposition: result.oppositePoolOpposition, winsAgainstOppositePool: result.winsAgainstOppositePool,
      partners: result.partners.size, opponents: result.opponents.size, forecastError: mean(result.trueWinForecastError) };
  });
  const segments = Object.fromEntries((["weakest", "middle", "strongest"] as const).map((segment) => {
    const members = individual.filter((player) => player.segment === segment);
    return [segment, {
      meanCompleted: mean(members.map((p) => p.completed)), meanOpponentGap: mean(members.flatMap((p) => p.meanOpponentGap ?? [])),
      similarOpponentShare: mean(members.flatMap((p) => p.similarOpponentShare ?? [])), worstOpponentGap: max(members.flatMap((p) => p.maxOpponentGap ?? [])),
      worstWait: max(members.map((p) => p.maxWait)), worstOwnSideShare: members.filter((p) => p.own + p.mixed > 0)
        .reduce<number | null>((low, p) => low === null ? p.own / (p.own + p.mixed) : Math.min(low, p.own / (p.own + p.mixed)), null),
      severeMatches: members.reduce((sum, p) => sum + p.severeMatches, 0),
    }];
  }));
  const equallyEligible = individual.filter((player) => player.activeMinutes === horizon && player.structurallyEligible);
  const spread = equallyEligible.length ? Math.max(...equallyEligible.map((p) => p.completed)) - Math.min(...equallyEligible.map((p) => p.completed)) : null;
  const expectedCount = Object.values(expected).reduce((sum, count) => sum + count, 0);
  return { scenario, policy, seed, horizon, activePlayers: players.length, completed, started, unfinished: active.size, unusedCourtMinutes,
    queue: { created: queueCreated, activated: queueActivated, canceled: queueCanceled,
      revalidatedToDifferentLineup: queueRevalidatedToDifferentLineup, waitingAtHorizon: Number(Boolean(queue)) },
    fairness: { spread, equallyEligible: equallyEligible.length, violations: fairness, backToBack,
      maxWait: max(individual.filter((p) => p.structurallyEligible).map((p) => p.maxWait)), p95Wait: p95([...metrics.values()].flatMap((p) => p.waits)),
      zeroStarts: individual.filter((p) => p.started === 0).map((p) => p.id),
      structurallyIneligible: individual.filter((p) => !p.structurallyEligible).map((p) => p.id),
      starvation: individual.filter((p) => p.started === 0 && p.missedTurns > 0 && p.structurallyEligible).map((p) => p.id),
    },
    quality: { meanRatingSpread: mean(courtRatingSpreads), p95RatingSpread: p95(courtRatingSpreads), meanLatentSpread: mean(trueCourtGaps),
      maxLatentSpread: max(trueCourtGaps), meanMixedRankGap: mean(mixedRankGaps), meanMixedWithinSideGap: mean(withinSideGaps),
      meanEngineCompatibility: mean(compatibility), severe: severeCount, avoidableSevereSameSeatsAtSelection: avoidableSevere, repeatExact, crossPool },
    balance: { meanObservedGap: mean(observedTeamGaps), p95ObservedGap: p95(observedTeamGaps), meanLatentGap: mean(trueTeamGaps),
      violations: balance, guardrailChecks, extremeHighLow },
    distribution: { actual, expected, unknown: unknownType, playersWithOwnMajority: individual.filter((p) => p.own > p.mixed).length,
      totalVariation: expectedCount > 0 && completed > 0 ? LEVEL_MATCH_TYPES.reduce((sum, type) => sum + Math.abs(actual[type] / completed - expected[type] / expectedCount), 0) / 2 : null },
    operations: { invalid, failed, exhausted, fallback, failureReasons, calls: latencies.length,
      p95Ms: p95(latencies.map((sample) => sample.elapsedMs)), p95ByCourtCount: [1, 2, 3].map((count) => p95(latencies.filter((sample) => sample.courts === count && !sample.queue).map((sample) => sample.elapsedMs))),
      p95QueueMs: p95(latencies.filter((sample) => sample.queue).map((sample) => sample.elapsedMs)) },
    calibration: calibration && { ...calibration, focalOutcome: individual.find((p) => p.id === calibration.focal) }, segments, individual, decisions,
    ...(traceReplay ? { replayAdmission: replayDecisions.map((decision) => analyzeReplayAdmission(players, decision)) } : {}) };
}

function assertHardInvariants(row: Awaited<ReturnType<typeof simulate>>) {
  expect(row.operations.invalid).toBe(0);
  expect(row.fairness.violations).toBe(0);
  expect(row.balance.violations).toBe(0);
  expect(row.individual.reduce((sum, player) => sum + player.completed, 0)).toBe(4 * row.completed);
  expect(row.individual.reduce((sum, player) => sum + player.started, 0)).toBe(4 * row.started);
  expect(row.completed + row.unfinished).toBe(row.started);
  expect(row.queue.created).toBe(row.queue.activated + row.queue.canceled + row.queue.waitingAtHorizon);
}

/** Symmetric, single-court oracle for tied rosters. Omitting rest can only make more type paths feasible. */
function fewestMixedUnderCountFairness(upper: number, lower: number, games: number) {
  const sort = (values: number[]) => values.sort((a, b) => a - b);
  const compare = (a: number[], b: number[]) => a.reduce((result, value, index) => result || value - b[index], 0);
  const initial = { higher: Array<number>(upper).fill(0), lower: Array<number>(lower).fill(0), mixed: 0 };
  let states = new Map([[JSON.stringify([initial.higher, initial.lower]), initial]]);
  for (let game = 0; game < games; game++) {
    const next = new Map<string, typeof initial>();
    for (const state of states.values()) {
      const choices = [0, 2, 4].filter((count) => count <= upper && 4 - count <= lower).map((count) => ({
        count, selectedCounts: sort([...state.higher.slice(0, count), ...state.lower.slice(0, 4 - count)]),
      }));
      choices.sort((a, b) => compare(a.selectedCounts, b.selectedCounts));
      for (const { count, selectedCounts } of choices) {
        if (compare(choices[0].selectedCounts, selectedCounts) !== 0) break;
        const higher = sort(state.higher.map((value, index) => value + Number(index < count)));
        const lower = sort(state.lower.map((value, index) => value + Number(index < 4 - count)));
        const key = JSON.stringify([higher, lower]);
        const mixed = state.mixed + Number(count === 2);
        if (mixed < (next.get(key)?.mixed ?? Infinity)) next.set(key, { higher, lower, mixed });
      }
    }
    states = next;
  }
  return Math.min(...[...states.values()].map(({ mixed }) => mixed));
}

describe("Club Play session outcomes", () => {
  it("repairs the doubles mix when promoting automatic reservations on two courts", async () => {
    for (const seed of [1, 4_729, 104_729]) {
      const row = await simulate("offset-queued-20", "club-play", seed);
      assertHardInvariants(row);
      expect(row.completed).toBe(20);
      expect(row.queue.activated).toBeGreaterThan(0);
      expect(row.distribution.actual.MIXED).toBeLessThan(row.completed / 2);
    }
  });

  it("leaves room for own-side play when most ratings are tied and outliers are present", async () => {
    for (const seed of [1, 4_729, 104_729]) {
      const row = await simulate("outliers-20", "club-play", seed);
      assertHardInvariants(row);
      expect(row.completed).toBe(20);
      expect(row.fairness.spread).toBeLessThanOrEqual(1);
      expect(row.distribution.actual.MIXED).toBeLessThanOrEqual(row.completed / 2);
    }
  });

  it("respects effective-side inputs, including overrides", () => {
    const { players } = makeClubPlayBenchmarkScenario("overrides-outliers", 1);
    expect(players.some((player) => player.mixedSideOverride !== null)).toBe(true);
    expect(players.map(getEffectiveMixedSide)).toEqual(players.map((player) => player.effectiveSide));
  });

  it("reaches the fairest feasible mix and distributes exposure evenly in the balanced 21-match fixture", async () => {
    const row = await simulate("balanced-21", "club-play", 1);
    assertHardInvariants(row);
    expect(row.completed).toBe(21);
    expect(row.fairness.spread).toBe(0);
    expect(row.distribution.actual.MIXED).toBe(fewestMixedUnderCountFairness(7, 7, row.completed));
    expect(row.individual.every((player) => player.own >= player.mixed)).toBe(true);
  }, 40_000);

  it("gives most players more own-side games when the fair rotation has that room", async () => {
    const row = await simulate("balanced-24", "club-play", 1);
    assertHardInvariants(row);
    expect(row.completed).toBe(24);
    expect(row.fairness.spread).toBe(0);
    expect(row.distribution.playersWithOwnMajority).toBeGreaterThan(8);
    expect(row.distribution.actual.MIXED).toBeGreaterThan(0);
  }, 40_000);

  it("allows mixed play across offset rating cohorts and preserves three-court commitments", async () => {
    const offset = await simulate("offset", "club-play", 1);
    assertHardInvariants(offset);
    expect(offset.distribution.actual.MIXED).toBeGreaterThan(0);
    expect(offset.quality.meanMixedWithinSideGap).toBeLessThan(offset.quality.meanRatingSpread!);
    const session = await simulate("three-court-24", "club-play", 1);
    assertHardInvariants(session);
    expect(session.completed).toBeGreaterThanOrEqual(30);
    expect(session.queue.activated).toBeGreaterThan(0);
    expect(session.fairness.starvation).toEqual([]);
  }, 60_000);
});

describe.skipIf(!process.env.CLUB_PLAY_BENCHMARK_OUTPUT)("Club Play paired benchmark", () => {
  it("runs the same seeded attendance and court conditions for each format", async () => {
    vi.stubEnv("LEVEL_MATCH_3_ENABLED", "0");
    vi.stubEnv("BALANCED_RECURRENCE_CANDIDATE_ENABLED", "1");
    vi.stubEnv("BALANCED_MATCH_TYPE_DISTRIBUTION_ENABLED", "0");
    const cases = (process.env.CLUB_PLAY_BENCHMARK_CASES ?? Object.keys(clubPlayBenchmarkScenarios).join(",")).split(",") as ScenarioId[];
    const seeds = (process.env.CLUB_PLAY_BENCHMARK_SEEDS ?? "1,4729,104729").split(",").map(Number);
    const formats = (process.env.CLUB_PLAY_BENCHMARK_POLICIES ?? policies.join(",")).split(",") as Policy[];
    if (cases.some((scenario) => !Object.hasOwn(clubPlayBenchmarkScenarios, scenario)) || seeds.some((seed) => !Number.isSafeInteger(seed)) ||
      formats.some((policy) => !policies.includes(policy))) throw new Error("Invalid Club Play benchmark cases, seeds or policies");
    const rows = [];
    const out = process.env.CLUB_PLAY_BENCHMARK_OUTPUT!;
    mkdirSync(path.dirname(out), { recursive: true });
    for (const scenario of cases) for (const seed of seeds) for (const policy of formats) {
      const row = await simulate(scenario, policy, seed);
      rows.push(row);
      console.log(`${scenario} / ${seed} / ${policy}: ${row.completed} completed, spread=${row.fairness.spread}, p95=${row.operations.p95Ms?.toFixed(1)}ms`);
      writeFileSync(out, JSON.stringify({ version: 1, node: process.version,
        revision: process.env.CLUB_PLAY_BENCHMARK_REVISION, dirty: process.env.CLUB_PLAY_BENCHMARK_DIRTY === "true",
        cases, seeds, formats, rows }, null, 2));
      if (policy === "club-play") {
        assertHardInvariants(row);
        for (const decision of row.replayAdmission ?? []) expect(decision.fairnessAgrees).toBe(true);
      }
    }
  }, 900_000);
});
