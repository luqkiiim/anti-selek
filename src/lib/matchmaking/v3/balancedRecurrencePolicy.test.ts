import { describe, expect, it } from "vitest";
import { SessionMode, SessionType } from "../../../types/enums";
import { findBestBalancedRecurrenceSelection } from "./balancedRecurrence";
import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  SocialHistoryMatch,
  V3DoublesPartition,
  V3SelectionConstraints,
} from "./types";
import type { BalancedRecurrenceOptions } from "./balancedRecurrence";

type Side = "UPPER" | "LOWER";
type MatchType = "MIXED" | "OWN_SIDE";
type Facet = "courtmates" | "partners" | "opponents" | "matchType";

interface TestPlayer extends MatchmakerV3Player {
  side: Side;
}

interface TypeRow {
  appearances: number;
  window: Array<MatchType | null>;
  experiencedTypes: Set<MatchType>;
  feasibleTypes: Set<MatchType>;
  eligible: boolean;
}

interface OracleContext {
  playersById: Map<string, TestPlayer>;
  feasibleTypesByPlayer: Map<string, Set<MatchType>>;
  typeRows: Map<string, TypeRow>;
  opportunities: Map<string, Map<Facet, Set<string>>>;
  seenExposures: Set<string>;
  eligiblePlayerCount: number;
  coverageDenominator: bigint;
  coverageWeights: Map<string, Map<Facet, bigint>>;
  rollingTypeDenominator: bigint;
}

interface ScoredLayout {
  partition: V3DoublesPartition;
  matchType: MatchType;
  rollingTypeUnits: bigint;
  relationshipCoverageUnits: bigint;
  replayCount: number;
  balanceGap: number;
}

function makePlayer(
  userId: string,
  side: Side,
  overrides: Partial<Pick<TestPlayer,
    "matchesPlayed" | "matchmakingBaseline" | "strength" | "pointDiff" |
    "restTurns" | "isBusy" | "isPaused" | "availableSince" | "arrivalPriorityAt"
  >> = {}
): TestPlayer {
  const matchesPlayed = overrides.matchesPlayed ?? 40;
  return {
    userId,
    side,
    matchesPlayed,
    matchmakingBaseline: overrides.matchmakingBaseline ?? matchesPlayed,
    strength: overrides.strength ?? 1000,
    pointDiff: overrides.pointDiff ?? 0,
    restTurns: overrides.restTurns ?? 1,
    availableSince: overrides.availableSince ?? new Date("2026-01-01T00:00:00.000Z"),
    arrivalPriorityAt: overrides.arrivalPriorityAt ?? new Date("2026-01-01T00:00:00.000Z"),
    gender: side === "UPPER" ? "MALE" : "FEMALE",
    mixedSideOverride: side,
    isBusy: overrides.isBusy,
    isPaused: overrides.isPaused,
  };
}

function quartetKey(ids: readonly string[]): string {
  return [...ids].sort().join("|");
}

function partitionKey(partition: V3DoublesPartition): string {
  const teamKey = (team: readonly string[]) => [...team].sort().join("+");
  return [teamKey(partition.team1), teamKey(partition.team2)].sort().join("/");
}

function classifyType(
  partition: V3DoublesPartition,
  playersById: ReadonlyMap<string, TestPlayer>
): MatchType | null {
  const teamSides = [partition.team1, partition.team2].map((team) =>
    team.map((id) => playersById.get(id)?.side ?? null)
  );
  const sides = teamSides.flat();
  if (sides.some((side) => side === null)) return null;
  if (sides.every((side) => side === "UPPER") || sides.every((side) => side === "LOWER")) {
    return "OWN_SIDE";
  }
  return teamSides.every((team) => team[0] !== team[1]) ? "MIXED" : null;
}

function combinations<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  const visit = (start: number, picked: T[]) => {
    if (picked.length === size) {
      result.push([...picked]);
      return;
    }
    for (let index = start; index <= values.length - (size - picked.length); index += 1) {
      picked.push(values[index]!);
      visit(index + 1, picked);
      picked.pop();
    }
  };
  visit(0, []);
  return result;
}

/** Exhaustive MIXICANO team splits; a quartet is legal only when all same-side or both teams mixed. */
function legalPartitionsForQuartet(
  ids: readonly string[],
  playersById: ReadonlyMap<string, TestPlayer>
): V3DoublesPartition[] {
  const [a, b, c, d] = [...ids].sort();
  if (!a || !b || !c || !d) return [];
  const splits: V3DoublesPartition[] = [
    { team1: [a, b], team2: [c, d] },
    { team1: [a, c], team2: [b, d] },
    { team1: [a, d], team2: [b, c] },
  ];
  return splits.filter((partition) => classifyType(partition, playersById) !== null);
}

function legalStructuralPartitions(players: readonly TestPlayer[]): V3DoublesPartition[] {
  const byId = new Map(players.map((player) => [player.userId, player]));
  return combinations(players.map((player) => player.userId), 4)
    .flatMap((ids) => legalPartitionsForQuartet(ids, byId));
}

function partitionEdges(partition: V3DoublesPartition): Record<Facet, Array<[string, string] | string>> {
  const ids = [...partition.team1, ...partition.team2];
  const courtmates: Array<[string, string]> = [];
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) {
      courtmates.push([ids[left]!, ids[right]!]);
    }
  }
  const partners: Array<[string, string]> = [
    [partition.team1[0], partition.team1[1]],
    [partition.team2[0], partition.team2[1]],
  ];
  const opponents: Array<[string, string]> = [];
  for (const left of partition.team1) for (const right of partition.team2) opponents.push([left, right]);
  return { courtmates, partners, opponents, matchType: [] };
}

function matchTypeFromHistory(
  match: SocialHistoryMatch,
  playersById: ReadonlyMap<string, TestPlayer>
): MatchType | null {
  const snapshot = match.socialVariety?.courtType;
  if (snapshot === "MIXED") return "MIXED";
  if (snapshot === "UPPER" || snapshot === "LOWER") return "OWN_SIDE";
  if (snapshot === null) return null;
  return classifyType({ team1: match.team1, team2: match.team2 }, playersById);
}

function uniqueCompletedHistory(history: readonly SocialHistoryMatch[]): SocialHistoryMatch[] {
  const seen = new Set<string>();
  const unique = history.filter((match) => {
    if (!match.id) return true;
    if (seen.has(match.id)) return false;
    seen.add(match.id);
    return true;
  });
  const indexed = unique.map((match, index) => ({
    match,
    index,
    completedAt: match.completedAt instanceof Date ? match.completedAt.getTime() : null,
  }));
  // Match the rolling-window contract: sort only a fully dated history. If
  // even one timestamp is absent or invalid, preserve the supplied completion
  // order for the entire history rather than mixing chronology and input order.
  if (indexed.every(({ completedAt }) => completedAt !== null && Number.isFinite(completedAt))) {
    indexed.sort((left, right) =>
      left.completedAt! - right.completedAt! || left.index - right.index
    );
  }
  return indexed.map(({ match }) => match);
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < BigInt(0) ? -left : left;
  let b = right < BigInt(0) ? -right : right;
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  return a;
}

function lcm(left: bigint, right: bigint): bigint {
  return left === BigInt(0) || right === BigInt(0)
    ? BigInt(0)
    : left / gcd(left, right) * right;
}

function emptyFacets(): Map<Facet, Set<string>> {
  return new Map([
    ["courtmates", new Set<string>()],
    ["partners", new Set<string>()],
    ["opponents", new Set<string>()],
    ["matchType", new Set<string>()],
  ]);
}

function exposureKey(userId: string, facet: Facet, value: string): string {
  return JSON.stringify([userId, facet, value]);
}

function addPartitionExposures(
  partition: V3DoublesPartition,
  courtType: MatchType | null,
  opportunities: Map<string, Map<Facet, Set<string>>>,
  seen: Set<string>
): void {
  const visitPair = (facet: Exclude<Facet, "matchType">, left: string, right: string) => {
    const leftOpportunities = opportunities.get(left)?.get(facet);
    const rightOpportunities = opportunities.get(right)?.get(facet);
    if (leftOpportunities?.has(right)) seen.add(exposureKey(left, facet, right));
    if (rightOpportunities?.has(left)) seen.add(exposureKey(right, facet, left));
  };
  for (const facet of ["courtmates", "partners", "opponents"] as const) {
    for (const edge of partitionEdges(partition)[facet] as Array<[string, string]>) {
      visitPair(facet, edge[0], edge[1]);
    }
  }
  if (courtType) {
    for (const id of [...partition.team1, ...partition.team2]) {
      if (opportunities.get(id)?.get("matchType")?.has(courtType)) {
        seen.add(exposureKey(id, "matchType", courtType));
      }
    }
  }
}

function buildOracleContext(
  players: readonly TestPlayer[],
  completedHistory: readonly SocialHistoryMatch[],
  exposureHistory: readonly SocialHistoryMatch[] = completedHistory,
  coverageOpportunityPartitions?: readonly V3DoublesPartition[]
): OracleContext {
  const playersById = new Map(players.map((player) => [player.userId, player]));
  const opportunities = new Map(players.map((player) => [player.userId, emptyFacets()]));
  const feasibleTypesByPlayer = new Map(players.map((player) => [player.userId, new Set<MatchType>()]));
  const structuralPartitions = legalStructuralPartitions(players);
  for (const partition of structuralPartitions) {
    const type = classifyType(partition, playersById);
    if (!type) continue;
    const ids = [...partition.team1, ...partition.team2];
    for (const id of ids) feasibleTypesByPlayer.get(id)!.add(type);
  }
  for (const partition of coverageOpportunityPartitions ?? structuralPartitions) {
    const type = classifyType(partition, playersById);
    if (!type) continue;
    const ids = [...partition.team1, ...partition.team2];
    for (const id of ids) opportunities.get(id)!.get("matchType")!.add(type);
    for (const facet of ["courtmates", "partners", "opponents"] as const) {
      for (const [left, right] of partitionEdges(partition)[facet] as Array<[string, string]>) {
        opportunities.get(left)!.get(facet)!.add(right);
        opportunities.get(right)!.get(facet)!.add(left);
      }
    }
  }
  const orderedCompleted = uniqueCompletedHistory(completedHistory);
  const typeRows = new Map<string, TypeRow>();
  for (const player of players) {
    const appearances = orderedCompleted.filter((match) => match.team1.includes(player.userId) || match.team2.includes(player.userId));
    const feasibleTypes = feasibleTypesByPlayer.get(player.userId)!;
    const experiencedTypes = new Set(appearances
      .map((match) => matchTypeFromHistory(match, playersById))
      .filter((type): type is MatchType => type !== null && feasibleTypes.has(type)));
    typeRows.set(player.userId, {
      appearances: appearances.length,
      window: appearances.slice(-6).map((match) => matchTypeFromHistory(match, playersById)),
      experiencedTypes,
      feasibleTypes,
      eligible: feasibleTypes.size > 0 && [...feasibleTypes].every((type) => experiencedTypes.has(type)),
    });
  }

  const eligiblePlayerCount = [...opportunities.values()].filter((facets) =>
    [...facets.values()].some((values) => values.size > 0)
  ).length;
  const coverageTerms: bigint[] = [];
  const feasibleFacets = new Map<string, Facet[]>();
  for (const [userId, facets] of opportunities) {
    const names = (["courtmates", "partners", "opponents", "matchType"] as const)
      .filter((facet) => facets.get(facet)!.size > 0);
    feasibleFacets.set(userId, names);
    for (const facet of names) {
      coverageTerms.push(BigInt(eligiblePlayerCount * names.length * facets.get(facet)!.size));
    }
  }
  const coverageDenominator = coverageTerms.reduce(lcm, BigInt(1));
  const coverageWeights = new Map<string, Map<Facet, bigint>>();
  for (const [userId, facets] of opportunities) {
    const names = feasibleFacets.get(userId)!;
    const weights = new Map<Facet, bigint>();
    for (const facet of names) {
      const term = BigInt(eligiblePlayerCount * names.length * facets.get(facet)!.size);
      weights.set(facet, coverageDenominator / term);
    }
    coverageWeights.set(userId, weights);
  }

  const seenExposures = new Set<string>();
  for (const match of uniqueCompletedHistory(exposureHistory)) {
    const partition = { team1: match.team1, team2: match.team2 };
    addPartitionExposures(partition, matchTypeFromHistory(match, playersById), opportunities, seenExposures);
  }
  const rollingSizes = [...feasibleTypesByPlayer.values()].map((types) => types.size).filter((size) => size > 0);
  const rollingTypeDenominator = rollingSizes.reduce((current, size) => lcm(current, BigInt(size)), BigInt(1));
  return {
    playersById,
    feasibleTypesByPlayer,
    typeRows,
    opportunities,
    seenExposures,
    eligiblePlayerCount,
    coverageDenominator,
    coverageWeights,
    rollingTypeDenominator,
  };
}

function independentRollingTypeUnits(
  partitions: readonly V3DoublesPartition[],
  context: OracleContext
): bigint {
  let units = BigInt(0);
  const seenPlayerIds = new Set<string>();
  for (const partition of partitions) {
    const type = classifyType(partition, context.playersById);
    if (!type) continue;
    for (const userId of [...partition.team1, ...partition.team2]) {
      if (seenPlayerIds.has(userId)) throw new Error("Independent oracle expects disjoint court assignments.");
      seenPlayerIds.add(userId);
      const row = context.typeRows.get(userId)!;
      if (!row.eligible) continue;
      const before = new Set(row.window.filter((value): value is MatchType => value !== null && row.feasibleTypes.has(value))).size;
      const after = new Set([...row.window, type].slice(-6)
        .filter((value): value is MatchType => value !== null && row.feasibleTypes.has(value))).size;
      units += BigInt(after - before) * (context.rollingTypeDenominator / BigInt(row.feasibleTypes.size));
    }
  }
  return units;
}

function independentFirstExposureUnits(
  partitions: readonly V3DoublesPartition[],
  context: OracleContext
): bigint {
  const seen = new Set(context.seenExposures);
  let units = BigInt(0);
  for (const partition of partitions) {
    const type = classifyType(partition, context.playersById);
    if (!type) continue;
    const candidateExposures = new Set<string>();
    const addPair = (facet: Exclude<Facet, "matchType">, left: string, right: string) => {
      for (const [userId, peerId] of [[left, right], [right, left]] as const) {
        const key = exposureKey(userId, facet, peerId);
        if (context.opportunities.get(userId)?.get(facet)?.has(peerId)) candidateExposures.add(key);
      }
    };
    for (const facet of ["courtmates", "partners", "opponents"] as const) {
      for (const [left, right] of partitionEdges(partition)[facet] as Array<[string, string]>) addPair(facet, left, right);
    }
    for (const userId of [...partition.team1, ...partition.team2]) {
      if (context.opportunities.get(userId)?.get("matchType")?.has(type)) {
        candidateExposures.add(exposureKey(userId, "matchType", type));
      }
    }
    for (const key of candidateExposures) {
      if (seen.has(key)) continue;
      seen.add(key);
      const [userId, facet] = JSON.parse(key) as [string, Facet, string];
      units += context.coverageWeights.get(userId)?.get(facet) ?? BigInt(0);
    }
  }
  return units;
}

function matchWithType(
  id: string,
  partition: V3DoublesPartition,
  playersById: ReadonlyMap<string, TestPlayer>,
  completedAt: Date
): SocialHistoryMatch {
  const type = classifyType(partition, playersById);
  const effectiveSideByUserId = Object.fromEntries([...partition.team1, ...partition.team2]
    .map((userId) => [userId, playersById.get(userId)?.side ?? null]));
  const onlySide = new Set(Object.values(effectiveSideByUserId)).size === 1
    ? Object.values(effectiveSideByUserId)[0]
    : null;
  return {
    id,
    team1: partition.team1,
    team2: partition.team2,
    completedAt,
    socialVariety: {
      version: 1,
      basis: "EFFECTIVE_MIXED_SIDE",
      courtType: type === "MIXED" ? "MIXED" : onlySide,
      effectiveSideByUserId,
    },
  };
}

const UPPER_IDS = ["U1", "U2", "U3", "U4"] as const;
const LOWER_IDS = ["L1", "L2", "L3", "L4"] as const;
const OWN_QUARTET = [...UPPER_IDS];
const MIXED_QUARTET = ["U1", "U2", "L1", "L2"];
const MIXED_DOUBLE_REST_QUARTET = ["U1", "U2", "L1", "L3"];

function standardPlayers(overrides: Partial<Record<string, Partial<TestPlayer>>> = {}): TestPlayer[] {
  return [...UPPER_IDS.map((id) => makePlayer(id, "UPPER", overrides[id])),
    ...LOWER_IDS.map((id) => makePlayer(id, "LOWER", overrides[id]))];
}

function saturatingHistory(players: readonly TestPlayer[]): SocialHistoryMatch[] {
  const byId = new Map(players.map((player) => [player.userId, player]));
  const history = structuralExposureHistory(players);
  const append = (partition: V3DoublesPartition) => {
    const index = history.length;
    history.push(matchWithType(`recent-${index}`, partition, byId,
      new Date(Date.UTC(2026, 0, 1, 0, 0, index + 1))));
  };
  const upperOwn = legalPartitionsForQuartet(UPPER_IDS, byId)[0]!;
  const lowerOwn = legalPartitionsForQuartet(LOWER_IDS, byId)[0]!;
  for (let index = 0; index < 6; index += 1) {
    append(upperOwn);
    append(lowerOwn);
  }
  return history;
}

function structuralExposureHistory(players: readonly TestPlayer[]): SocialHistoryMatch[] {
  const byId = new Map(players.map((player) => [player.userId, player]));
  return legalStructuralPartitions(players).map((partition, index) =>
    matchWithType(`structural-${index}`, partition, byId,
      new Date(Date.UTC(2025, 11, 1, 0, 0, index + 1)))
  );
}

function historyWithRecentTypeWindows(
  players: readonly TestPlayer[],
  mixedMatchCountPerSide: number,
  ownMatchCountPerSide: number
): SocialHistoryMatch[] {
  const byId = new Map(players.map((player) => [player.userId, player]));
  const history = structuralExposureHistory(players);
  const mixedA = legalPartitionsForQuartet(MIXED_QUARTET, byId).find((partition) =>
    classifyType(partition, byId) === "MIXED"
  )!;
  const mixedBQuartet = ["U3", "U4", "L3", "L4"];
  const mixedB = legalPartitionsForQuartet(mixedBQuartet, byId).find((partition) =>
    classifyType(partition, byId) === "MIXED"
  )!;
  const upperOwn = legalPartitionsForQuartet(UPPER_IDS, byId)[0]!;
  const lowerOwn = legalPartitionsForQuartet(LOWER_IDS, byId)[0]!;
  const append = (id: string, partition: V3DoublesPartition) => {
    history.push(matchWithType(id, partition, byId,
      new Date(Date.UTC(2026, 0, 1, 0, 0, history.length + 1))));
  };
  for (let index = 0; index < mixedMatchCountPerSide; index += 1) {
    append(`recent-mixed-a-${index}`, mixedA);
    append(`recent-mixed-b-${index}`, mixedB);
  }
  for (let index = 0; index < ownMatchCountPerSide; index += 1) {
    append(`recent-own-upper-${index}`, upperOwn);
    append(`recent-own-lower-${index}`, lowerOwn);
  }
  return history;
}

function shortCompletedHistoryWithBothTypes(players: readonly TestPlayer[]): SocialHistoryMatch[] {
  const byId = new Map(players.map((player) => [player.userId, player]));
  const upperOwn = legalPartitionsForQuartet(UPPER_IDS, byId)[0]!;
  const lowerOwn = legalPartitionsForQuartet(LOWER_IDS, byId)[0]!;
  const mixedA = legalPartitionsForQuartet(MIXED_QUARTET, byId).find((partition) =>
    classifyType(partition, byId) === "MIXED"
  )!;
  const mixedB = legalPartitionsForQuartet(["U3", "U4", "L3", "L4"], byId).find((partition) =>
    classifyType(partition, byId) === "MIXED"
  )!;
  return [upperOwn, lowerOwn, mixedA, mixedB].map((partition, index) =>
    matchWithType(`short-both-types-${index}`, partition, byId,
      new Date(Date.UTC(2026, 0, 1, 0, 0, index + 1)))
  );
}

function allowQuartets(quartets: readonly (readonly string[])[]): V3SelectionConstraints<ActiveMatchmakerV3Player<TestPlayer>> {
  const allowed = new Set(quartets.map(quartetKey));
  return {
    isQuartetAllowed: (players: [ActiveMatchmakerV3Player<TestPlayer>, ActiveMatchmakerV3Player<TestPlayer>,
      ActiveMatchmakerV3Player<TestPlayer>, ActiveMatchmakerV3Player<TestPlayer>]) =>
      allowed.has(quartetKey(players.map((player) => player.userId))),
  };
}

interface RecurrenceFixture {
  players: TestPlayer[];
  completed: SocialHistoryMatch[];
  socialHistory: SocialHistoryMatch[];
  quartets: string[][];
}

function completeFixture(
  players: TestPlayer[],
  history: SocialHistoryMatch[],
  quartets: readonly (readonly string[])[] = [OWN_QUARTET, MIXED_QUARTET]
): RecurrenceFixture {
  return { players, completed: history, socialHistory: history, quartets: quartets.map((quartet) => [...quartet]) };
}

function recurrenceOptions(
  fixture: RecurrenceFixture,
  sessionType: SessionType.POINTS | SessionType.ELO,
  overrides: Partial<BalancedRecurrenceOptions<TestPlayer>> = {}
): BalancedRecurrenceOptions<TestPlayer> {
  return {
    courtCount: 1,
    sessionMode: SessionMode.MIXICANO,
    sessionType,
    recurrencePolicy: "strict-replay-rescue",
    selectionConstraints: allowQuartets(fixture.quartets),
    completedMatches: fixture.completed,
    socialHistoryMatches: fixture.socialHistory,
    randomFn: makeDeterministicRandom(4729),
    pairingRandomMode: "combined",
    ...overrides,
  };
}

function strictRecurrenceOptions(
  fixture: RecurrenceFixture,
  sessionType: SessionType.POINTS | SessionType.ELO,
  overrides: Partial<BalancedRecurrenceOptions<TestPlayer>> = {}
): BalancedRecurrenceOptions<TestPlayer> {
  return recurrenceOptions(fixture, sessionType, overrides);
}


function selectedPartition(result: { selection: { selections: Array<{ partition: V3DoublesPartition }> } | null }): V3DoublesPartition {
  const selections = result.selection?.selections;
  if (!selections || selections.length !== 1) throw new Error("Expected one independent one-court assignment.");
  return selections[0]!.partition;
}

function independentRotationClass(
  partition: V3DoublesPartition,
  players: readonly TestPlayer[],
  scheduleRank = 0
) {
  const ids = new Set([...partition.team1, ...partition.team2]);
  const selected = players.filter((player) => ids.has(player.userId));
  const fairnessCounts = selected.map((player) => Math.max(player.matchesPlayed, player.matchmakingBaseline))
    .sort((left, right) => left - right);
  const arrivals = selected.map((player) => player.arrivalPriorityAt instanceof Date
    ? player.arrivalPriorityAt.getTime()
    : player.arrivalPriorityAt == null ? null : new Date(player.arrivalPriorityAt).getTime())
    .filter((value): value is number => value !== null)
    .sort((left, right) => left - right);
  const fairness = [...fairnessCounts, -arrivals.length, ...arrivals];
  while (fairness.length < selected.length * 2 + 1) fairness.push(Number.POSITIVE_INFINITY);
  const available = players.filter((player) => !player.isBusy && !player.isPaused);
  const idealGap = Math.max(0, Math.ceil((available.length - 4) / 4));
  const leftOut = available.filter((player) =>
    (player.restTurns ?? 0) > idealGap && !ids.has(player.userId)
  ).map((player) => player.restTurns ?? 0);
  const starvation = [leftOut.length, Math.max(0, ...leftOut), leftOut.reduce((sum, value) => sum + value, 0)];
  return { fairness, scheduleRank, starvation };
}

function compareLex(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a < b ? -1 : 1;
  }
  return 0;
}

function historyWithOwnCompletions(
  players: readonly TestPlayer[],
  appearancesPerSide: number
): SocialHistoryMatch[] {
  const byId = new Map(players.map((player) => [player.userId, player]));
  const history = structuralExposureHistory(players);
  const upperOwn = legalPartitionsForQuartet(UPPER_IDS, byId)[0]!;
  const lowerOwn = legalPartitionsForQuartet(LOWER_IDS, byId)[0]!;
  for (let index = 0; index < appearancesPerSide; index += 1) {
    history.push(matchWithType(`completed-upper-${index}`, upperOwn, byId,
      new Date(Date.UTC(2026, 0, 1, 0, 0, history.length + 1))));
    history.push(matchWithType(`completed-lower-${index}`, lowerOwn, byId,
      new Date(Date.UTC(2026, 0, 1, 0, 0, history.length + 1))));
  }
  return history;
}

function optionsForSchedule(
  fixture: RecurrenceFixture,
  sessionType: SessionType.POINTS | SessionType.ELO,
  schedules: NonNullable<BalancedRecurrenceOptions<TestPlayer>["schedules"]>
): BalancedRecurrenceOptions<TestPlayer> {
  return recurrenceOptions(fixture, sessionType, { schedules });
}

function layoutName(partition: V3DoublesPartition): string {
  return `${quartetKey([...partition.team1, ...partition.team2])}:${partitionKey(partition)}`;
}

function bestStrengthGap(layouts: readonly ScoredLayout[]): number {
  return Math.min(...layouts.map((layout) => layout.balanceGap));
}

function withQueueOnlyHistory(
  history: readonly SocialHistoryMatch[],
  players: readonly TestPlayer[]
): SocialHistoryMatch[] {
  const byId = new Map(players.map((player) => [player.userId, player]));
  const partition = legalPartitionsForQuartet(MIXED_QUARTET, byId).find((item) =>
    classifyType(item, byId) === "MIXED"
  )!;
  const queue = matchWithType("queue-only-sixth", partition, byId, new Date("2026-02-01T00:00:00.000Z"));
  return [...history, queue];
}

function enumerateCandidatePartitions(
  players: readonly TestPlayer[],
  quartets: readonly (readonly string[])[]
): V3DoublesPartition[] {
  const byId = new Map(players.map((player) => [player.userId, player]));
  return quartets.flatMap((quartet) => legalPartitionsForQuartet(quartet, byId));
}

function scoreLayout(
  partition: V3DoublesPartition,
  context: OracleContext
): ScoredLayout {
  const matchType = classifyType(partition, context.playersById);
  if (!matchType) throw new Error("Cannot score an illegal independent layout.");
  return {
    partition,
    matchType,
    rollingTypeUnits: independentRollingTypeUnits([partition], context),
    relationshipCoverageUnits: independentFirstExposureUnits([partition], context),
    replayCount: [...partition.team1, ...partition.team2]
      .filter((userId) => (context.playersById.get(userId)?.restTurns ?? 0) === 0).length,
    balanceGap: Math.abs(
      (context.playersById.get(partition.team1[0])!.strength + context.playersById.get(partition.team1[1])!.strength) / 2 -
      (context.playersById.get(partition.team2[0])!.strength + context.playersById.get(partition.team2[1])!.strength) / 2
    ),
  };
}

function strictReplayFrontierOracle(rows: readonly ScoredLayout[]) {
  if (!rows.length) throw new Error("Strict-rescue oracle needs at least one legal candidate.");
  const rmin = Math.min(...rows.map((row) => row.replayCount));
  const atRmin = rows.filter((row) => row.replayCount === rmin);
  const bestCoverageAtRmin = atRmin.reduce((best, row) =>
    row.relationshipCoverageUnits > best ? row.relationshipCoverageUnits : best,
  atRmin[0]!.relationshipCoverageUnits);
  const bestTAtRminUnits = atRmin.reduce((best, row) =>
    row.rollingTypeUnits > best ? row.rollingTypeUnits : best,
  atRmin[0]!.rollingTypeUnits);
  const reasonsFor = (row: ScoredLayout): Array<"replay-minimum" | "first-exposure" | "recurrence"> => {
    if (row.replayCount === rmin) return ["replay-minimum"];
    if (row.replayCount !== rmin + 1) return [];
    return [
      ...(row.relationshipCoverageUnits > bestCoverageAtRmin ? ["first-exposure" as const] : []),
      ...(row.rollingTypeUnits > bestTAtRminUnits ? ["recurrence" as const] : []),
    ];
  };
  return {
    rmin,
    atRmin,
    bestCoverageAtRmin,
    bestTAtRminUnits,
    reasonsFor,
    admitted: rows.filter((row) => reasonsFor(row).length > 0),
  };
}

function completedHistoryForCoverageTie(players: readonly TestPlayer[]): SocialHistoryMatch[] {
  const byId = new Map(players.map((player) => [player.userId, player]));
  const upperOwns = legalPartitionsForQuartet(UPPER_IDS, byId);
  const lowerOwns = legalPartitionsForQuartet(LOWER_IDS, byId);
  const mixedA = legalPartitionsForQuartet(["U1", "U3", "L1", "L3"], byId).find((partition) =>
    classifyType(partition, byId) === "MIXED"
  )!;
  const mixedB = legalPartitionsForQuartet(["U2", "U4", "L2", "L4"], byId).find((partition) =>
    classifyType(partition, byId) === "MIXED"
  )!;
  const history: SocialHistoryMatch[] = [];
  const append = (partition: V3DoublesPartition) => {
    const index = history.length;
    history.push(matchWithType(`coverage-tie-${index}`, partition, byId,
      new Date(Date.UTC(2026, 2, 1, 0, 0, index + 1))));
  };
  // Saturate every own-side partition, then give each player a 3:3 recent
  // window using non-target mixed quartets; the target cross-relations remain
  // unseen under the candidate-constrained coverage vocabulary.
  for (const partition of upperOwns) append(partition);
  for (const partition of lowerOwns) append(partition);
  for (let index = 0; index < 3; index += 1) append(mixedA);
  for (let index = 0; index < 3; index += 1) append(mixedB);
  return history;
}

function completedHistoryForBothReasons(players: readonly TestPlayer[]): SocialHistoryMatch[] {
  const byId = new Map(players.map((player) => [player.userId, player]));
  const upperOwns = legalPartitionsForQuartet(UPPER_IDS, byId);
  const lowerOwns = legalPartitionsForQuartet(LOWER_IDS, byId);
  const lowerOwn = lowerOwns[0]!;
  const mixedA = legalPartitionsForQuartet(["U1", "U3", "L1", "L3"], byId).find((partition) =>
    classifyType(partition, byId) === "MIXED"
  )!;
  const mixedB = legalPartitionsForQuartet(["U2", "U4", "L2", "L4"], byId).find((partition) =>
    classifyType(partition, byId) === "MIXED"
  )!;
  const history: SocialHistoryMatch[] = [];
  const append = (partition: V3DoublesPartition) => {
    const index = history.length;
    history.push(matchWithType(`both-reasons-${index}`, partition, byId,
      new Date(Date.UTC(2026, 3, 1, 0, 0, index + 1))));
  };
  for (const partition of upperOwns) append(partition);
  for (const partition of lowerOwns) append(partition);
  append(mixedA);
  append(mixedB);
  // Put only own-side matches in each player's six-entry tail, while retaining
  // complete lifetime exposure to both feasible types.
  for (let index = 0; index < 6; index += 1) {
    append(upperOwns[index % upperOwns.length]!);
    append(lowerOwn);
  }
  return history;
}

function makeDeterministicRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}


describe("independent MIXICANO recurrence policy oracle", () => {
  it("enumerates every legal 4U/4L structural layout and saturates the legacy first-exposure baseline", () => {
    const players = standardPlayers();
    const byId = new Map(players.map((player) => [player.userId, player]));
    const structural = legalStructuralPartitions(players);
    expect(structural).toHaveLength(78);
    expect(new Set(structural.map((partition) => classifyType(partition, byId)))).toEqual(
      new Set(["MIXED", "OWN_SIDE"])
    );

    const candidatePartitions = enumerateCandidatePartitions(players, [OWN_QUARTET, MIXED_QUARTET]);
    expect(candidatePartitions).toHaveLength(5);
    expect(candidatePartitions.filter((partition) => classifyType(partition, byId) === "OWN_SIDE"))
      .toHaveLength(3);
    expect(candidatePartitions.filter((partition) => classifyType(partition, byId) === "MIXED"))
      .toHaveLength(2);

    const history = saturatingHistory(players);
    const context = buildOracleContext(players, history);
    expect([...context.feasibleTypesByPlayer.values()].every((types) =>
      types.has("MIXED") && types.has("OWN_SIDE")
    )).toBe(true);
    expect(candidatePartitions.every((partition) =>
      independentFirstExposureUnits([partition], context) === BigInt(0)
    )).toBe(true);
  });

  it("keeps five-to-one and three-to-three windows equally complete, with signed expiry preserved", () => {
    const complete51: Array<MatchType | null> = ["MIXED", "OWN_SIDE", "OWN_SIDE", "OWN_SIDE", "OWN_SIDE", "OWN_SIDE"];
    const complete33: Array<MatchType | null> = ["MIXED", "OWN_SIDE", "MIXED", "OWN_SIDE", "MIXED", "OWN_SIDE"];
    const feasible = new Set<MatchType>(["MIXED", "OWN_SIDE"]);
    const coverage = (window: readonly (MatchType | null)[]) =>
      new Set(window.filter((type): type is MatchType => type !== null && feasible.has(type))).size / feasible.size;
    const change = (window: readonly (MatchType | null)[], candidate: MatchType) =>
      coverage([...window, candidate].slice(-6)) - coverage(window);

    expect(coverage(complete51)).toBe(1);
    expect(coverage(complete33)).toBe(1);
    expect(change(complete51, "OWN_SIDE")).toBe(-0.5);
    expect(change(complete51, "MIXED")).toBe(0);
    expect(change(complete33, "OWN_SIDE")).toBe(0);
    expect(change(complete33, "MIXED")).toBe(0);
  });

  it("requires completed lifetime exposure to every feasible type; counters and queue history do not count", () => {
    const players = standardPlayers(Object.fromEntries([...UPPER_IDS, ...LOWER_IDS].map((id) =>
      [id, { matchesPlayed: 100, matchmakingBaseline: 100 }]
    )));
    const byId = new Map(players.map((player) => [player.userId, player]));
    const own = legalPartitionsForQuartet(OWN_QUARTET, byId)[0]!;
    const onlyFiveCompleted = Array.from({ length: 5 }, (_, index) =>
      matchWithType(`completed-${index}`, own, byId, new Date(Date.UTC(2026, 0, 1, 0, 0, index + 1)))
    );
    const duplicateOfFirst = { ...onlyFiveCompleted[0]!, completedAt: new Date("2026-01-01T00:01:00.000Z") };
    const reservationNotYetCompleted = matchWithType(
      "queued-only-sixth", legalPartitionsForQuartet(MIXED_QUARTET, byId)[0]!, byId,
      new Date("2026-01-01T00:02:00.000Z")
    );
    const oracle = buildOracleContext(
      players,
      [...onlyFiveCompleted, duplicateOfFirst],
      [...onlyFiveCompleted, duplicateOfFirst, reservationNotYetCompleted]
    );

    for (const id of [...UPPER_IDS, ...LOWER_IDS]) {
      const appearsInCompletedHistory = OWN_QUARTET.some((userId) => userId === id);
      expect(oracle.typeRows.get(id)?.appearances).toBe(appearsInCompletedHistory ? 5 : 0);
      expect(oracle.typeRows.get(id)?.eligible).toBe(false);
    }
    expect(oracle.eligiblePlayerCount).toBe(8);
  });

  it.each([SessionType.POINTS, SessionType.ELO] as const)(
    "%s makes players recurrence-eligible below six appearances after both feasible types were completed",
    (sessionType) => {
      const players = standardPlayers(Object.fromEntries([...UPPER_IDS, ...LOWER_IDS].map((id) =>
        [id, { matchesPlayed: 100, matchmakingBaseline: 100 }]
      )));
      const completed = shortCompletedHistoryWithBothTypes(players);
      const fixture = completeFixture(players, completed, [OWN_QUARTET, MIXED_QUARTET]);
      const oracle = buildOracleContext(players, completed, completed,
        enumerateCandidatePartitions(players, fixture.quartets));
      expect([...oracle.typeRows.values()].every((row) => row.appearances === 2 && row.eligible)).toBe(true);
      expect([...oracle.typeRows.values()].every((row) =>
        row.experiencedTypes.size === 2 && row.window.length === 2
      )).toBe(true);
      expect(enumerateCandidatePartitions(players, fixture.quartets).every((partition) =>
        independentRollingTypeUnits([partition], oracle) === BigInt(0)
      )).toBe(true);

      const result = findBestBalancedRecurrenceSelection(players, recurrenceOptions(fixture, sessionType));
      expect(result.recurrenceCertified).toBe(true);
      expect(result.matureTypeEligiblePlayerCount).toBe(8);
      expect(result.firstExposureCompletePlayerCount).toBe(8);
      expect(result.chosenMatureDeltaT).toBe(0);
      expect(result.matureRecurrencePlayers).toHaveLength(4);
      expect(result.matureRecurrencePlayers.every((row) =>
        row.firstExposureCompleteBefore && row.completedAppearancesBefore === 2 &&
        row.beforeT === 1 && row.afterT === 1 && row.deltaT === 0
      )).toBe(true);
    }
  );

  it("does not invent recurrence benefit for a structurally one-type roster", () => {
    const players = UPPER_IDS.map((id) => makePlayer(id, "UPPER"));
    const byId = new Map(players.map((player) => [player.userId, player]));
    const onlyOwnSide = legalStructuralPartitions(players);
    expect(onlyOwnSide.length).toBe(3);
    const own = onlyOwnSide[0]!;
    const history = Array.from({ length: 6 }, (_, index) =>
      matchWithType(`one-type-${index}`, own, byId, new Date(Date.UTC(2026, 0, 1, 0, 0, index + 1)))
    );
    const context = buildOracleContext(players, history);
    expect([...context.feasibleTypesByPlayer.values()].every((types) =>
      types.size === 1 && types.has("OWN_SIDE")
    )).toBe(true);
    expect([...context.typeRows.values()].every((row) => row.eligible)).toBe(true);
    expect(independentRollingTypeUnits([own], context)).toBe(BigInt(0));
  });
});

describe("Balanced recurrence policy exactness", () => {
  it.each([SessionType.POINTS, SessionType.ELO] as const)(
    "%s ignores queued exposure when a player has not completed every feasible type",
    (sessionType) => {
      const players = standardPlayers(Object.fromEntries([...UPPER_IDS, ...LOWER_IDS].map((id) =>
        [id, { matchesPlayed: 100, matchmakingBaseline: 100 }]
      )));
      const socialHistory = withQueueOnlyHistory(historyWithOwnCompletions(players, 6), players);
      const fiveCompleted = socialHistory.filter((match) =>
        match.id?.startsWith("completed-upper-") || match.id?.startsWith("completed-lower-")
      ).filter((match) => {
        const id = match.id ?? "";
        return Number(id.slice(id.lastIndexOf("-") + 1)) < 5;
      });
      const duplicateId = { ...fiveCompleted[0]!, completedAt: new Date("2026-03-01T00:00:00.000Z") };
      const fixture: RecurrenceFixture = {
        players,
        completed: [...fiveCompleted, duplicateId],
        socialHistory,
        quartets: [OWN_QUARTET, MIXED_QUARTET],
      };
      const oracle = buildOracleContext(players, fixture.completed, fixture.socialHistory,
        enumerateCandidatePartitions(players, fixture.quartets));
      expect([...oracle.typeRows.values()].every((row) => row.appearances === 5 && !row.eligible)).toBe(true);
      expect(enumerateCandidatePartitions(players, fixture.quartets).every((partition) =>
        independentRollingTypeUnits([partition], oracle) === BigInt(0)
      )).toBe(true);

      const result = findBestBalancedRecurrenceSelection(players, recurrenceOptions(fixture, sessionType));
      expect(result.selection).not.toBeNull();
      expect(result.recurrenceCertified).toBe(true);
      expect(result.matureTypeEligiblePlayerCount).toBe(0);
      expect(result.chosenMatureDeltaT).toBe(0);
      expect(result.chosenMatureDeltaTUnits).toBe("0");
      expect(result.matureRecurrencePlayers).toEqual([]);
      expect(result.replayCertified).toBe(true);
      expect(result.coverageGateCertified).toBe(true);
      expect(result.balanceCertified).toBe(true);
    }
  );

  it.each([SessionType.POINTS, SessionType.ELO] as const)(
    "%s does not make six same-type-only completed appearances recurrence-eligible",
    (sessionType) => {
      const players = standardPlayers(Object.fromEntries([...UPPER_IDS, ...LOWER_IDS].map((id) =>
        [id, { matchesPlayed: 100, matchmakingBaseline: 100 }]
      )));
      const socialHistory = withQueueOnlyHistory(historyWithOwnCompletions(players, 7), players);
      const sixOwnCompleted = socialHistory.filter((match) =>
        match.id?.startsWith("completed-upper-") || match.id?.startsWith("completed-lower-")
      ).filter((match) => Number(match.id!.slice(match.id!.lastIndexOf("-") + 1)) < 6);
      const fixture: RecurrenceFixture = {
        players,
        completed: sixOwnCompleted,
        socialHistory,
        quartets: [OWN_QUARTET, MIXED_QUARTET],
      };
      const oracle = buildOracleContext(players, fixture.completed, fixture.socialHistory,
        enumerateCandidatePartitions(players, fixture.quartets));
      expect([...oracle.typeRows.values()].every((row) =>
        row.appearances === 6 && row.feasibleTypes.size === 2 &&
        row.experiencedTypes.size === 1 && row.experiencedTypes.has("OWN_SIDE") && !row.eligible
      )).toBe(true);

      const result = findBestBalancedRecurrenceSelection(players, recurrenceOptions(fixture, sessionType));
      expect(result.selection).not.toBeNull();
      expect(result.recurrenceCertified).toBe(true);
      expect(result.matureTypeEligiblePlayerCount).toBe(0);
      expect(result.chosenMatureDeltaT).toBe(0);
      expect(result.matureRecurrencePlayers).toEqual([]);
    }
  );

  it("retains signed rolling-T losses when a mature candidate evicts a unique type from its six-match window", () => {
    const players = standardPlayers();
    const history = historyWithRecentTypeWindows(players, 1, 5);
    const fixture = completeFixture(players, history, [OWN_QUARTET]);
    const oracle = buildOracleContext(players, fixture.completed, fixture.socialHistory,
      enumerateCandidatePartitions(players, fixture.quartets));
    const own = enumerateCandidatePartitions(players, [OWN_QUARTET]);
    expect(own).toHaveLength(3);
    expect(own.every((partition) => independentRollingTypeUnits([partition], oracle) === BigInt(-4))).toBe(true);
    expect(own.every((partition) => independentFirstExposureUnits([partition], oracle) === BigInt(0))).toBe(true);

    const result = findBestBalancedRecurrenceSelection(
      players,
      recurrenceOptions(fixture, SessionType.POINTS)
    );
    expect(classifyType(selectedPartition(result), oracle.playersById)).toBe("OWN_SIDE");
    expect(result.recurrenceCertified).toBe(true);
    expect(result.chosenMatureDeltaT).toBe(-2);
    expect(result.chosenMatureDeltaTUnits).toBe("-4");
    expect(result.matureDeltaTDenominator).toBe("2");
    expect(result.matureRecurrencePlayers).toHaveLength(4);
    expect(result.matureRecurrencePlayers.every((row) =>
      row.beforeT === 1 && row.afterT === 0.5 && row.deltaT === -0.5 &&
      row.beforeRecentMatchTypes[0] === "MIXED" && row.afterRecentMatchTypes.every((type) => type === "OWN_SIDE")
    )).toBe(true);
  });

  it("treats both 5:1 and 3:3 as complete and assigns no T preference on ties", () => {
    const fiveToOnePlayers = standardPlayers();
    const fiveToOneHistory = historyWithRecentTypeWindows(fiveToOnePlayers, 1, 5);
    const fiveToOneFixture = completeFixture(fiveToOnePlayers, fiveToOneHistory);
    const fiveToOneOracle = buildOracleContext(fiveToOnePlayers, fiveToOneHistory, fiveToOneHistory,
      enumerateCandidatePartitions(fiveToOnePlayers, fiveToOneFixture.quartets));
    const fiveToOneRows = enumerateCandidatePartitions(fiveToOnePlayers, fiveToOneFixture.quartets)
      .map((partition) => scoreLayout(partition, fiveToOneOracle));
    expect([...fiveToOneOracle.typeRows.values()].every((row) =>
      new Set(row.window.filter((type): type is MatchType => type !== null)).size === 2
    )).toBe(true);
    expect(fiveToOneRows.filter((row) => row.matchType === "OWN_SIDE")
      .every((row) => row.rollingTypeUnits === BigInt(-4))).toBe(true);
    expect(fiveToOneRows.filter((row) => row.matchType === "MIXED")
      .every((row) => row.rollingTypeUnits === BigInt(0))).toBe(true);
    const fiveToOneResult = findBestBalancedRecurrenceSelection(
      fiveToOnePlayers,
      recurrenceOptions(fiveToOneFixture, SessionType.POINTS)
    );
    expect(classifyType(selectedPartition(fiveToOneResult), fiveToOneOracle.playersById)).toBe("MIXED");
    expect(fiveToOneResult.chosenMatureDeltaT).toBe(0);

    const threeToThreePlayers = standardPlayers();
    const threeToThreeHistory = historyWithRecentTypeWindows(threeToThreePlayers, 3, 3);
    const threeToThreeFixture = completeFixture(threeToThreePlayers, threeToThreeHistory);
    const threeToThreeOracle = buildOracleContext(threeToThreePlayers, threeToThreeHistory, threeToThreeHistory,
      enumerateCandidatePartitions(threeToThreePlayers, threeToThreeFixture.quartets));
    const threeToThreeRows = enumerateCandidatePartitions(threeToThreePlayers, threeToThreeFixture.quartets)
      .map((partition) => scoreLayout(partition, threeToThreeOracle));
    expect([...threeToThreeOracle.typeRows.values()].every((row) =>
      row.window.filter((type) => type === "MIXED").length === 3 &&
      row.window.filter((type) => type === "OWN_SIDE").length === 3
    )).toBe(true);
    expect(threeToThreeRows.every((row) => row.rollingTypeUnits === BigInt(0))).toBe(true);
    const result = findBestBalancedRecurrenceSelection(
      threeToThreePlayers,
      recurrenceOptions(threeToThreeFixture, SessionType.POINTS)
    );
    expect(result.recurrenceCertified).toBe(true);
    expect(result.chosenMatureDeltaT).toBe(0);
    expect(result.matureRecurrencePlayers.every((row) => row.beforeT === 1 && row.deltaT === 0)).toBe(true);
  });

  it.each([SessionType.POINTS, SessionType.ELO] as const)(
    "%s strict rescue admits only a strictly better signed T at Rmin+1, never Rmin+2",
    (sessionType) => {
      const players = standardPlayers({ L1: { restTurns: 0 }, L2: { restTurns: 0 } });
      const quartets = [OWN_QUARTET, MIXED_DOUBLE_REST_QUARTET, MIXED_QUARTET];
      for (const state of [
        { name: "positive recurrence gain", mixed: 0, own: 6, bestT: 0, chosenT: 2, bestUnits: "0", chosenUnits: "4" },
        { name: "recovery from a signed loss", mixed: 1, own: 5, bestT: -2, chosenT: 0, bestUnits: "-4", chosenUnits: "0" },
      ]) {
        const history = historyWithRecentTypeWindows(players, state.mixed, state.own);
        const fixture = completeFixture(players, history, quartets);
        const candidatePartitions = enumerateCandidatePartitions(players, quartets);
        const oracle = buildOracleContext(players, history, history, candidatePartitions);
        const rows = candidatePartitions.map((partition) => scoreLayout(partition, oracle));
        const frontier = strictReplayFrontierOracle(rows);
        const reference = independentRotationClass(rows[0]!.partition, players);
        expect(rows.every((row) => {
          const actual = independentRotationClass(row.partition, players);
          return compareLex(actual.fairness, reference.fairness) === 0 &&
            actual.scheduleRank === reference.scheduleRank &&
            compareLex(actual.starvation, reference.starvation) === 0 &&
            row.balanceGap === rows[0]!.balanceGap;
        }), state.name).toBe(true);
        expect(rows.every((row) => row.relationshipCoverageUnits === BigInt(0)), state.name).toBe(true);
        expect(frontier.rmin, state.name).toBe(0);
        expect(frontier.bestCoverageAtRmin, state.name).toBe(BigInt(0));
        expect(frontier.bestTAtRminUnits, state.name).toBe(BigInt(state.bestUnits));
        const oneReplay = rows.filter((row) => row.replayCount === frontier.rmin + 1);
        const twoReplay = rows.filter((row) => row.replayCount === frontier.rmin + 2);
        expect(oneReplay).toHaveLength(2);
        expect(twoReplay).toHaveLength(2);
        expect(oneReplay.every((row) => row.matchType === "MIXED" &&
          row.rollingTypeUnits === BigInt(state.chosenUnits) && row.relationshipCoverageUnits === BigInt(0)
        ), state.name).toBe(true);
        expect(twoReplay.every((row) => row.matchType === "MIXED" &&
          row.rollingTypeUnits === BigInt(state.chosenUnits)
        ), state.name).toBe(true);
        expect(frontier.admitted.filter((row) => row.replayCount === frontier.rmin + 1)
          .every((row) => frontier.reasonsFor(row).includes("recurrence")), state.name).toBe(true);
        expect(frontier.admitted.some((row) => row.replayCount === frontier.rmin + 2), state.name).toBe(false);

        const result = findBestBalancedRecurrenceSelection(players,
          strictRecurrenceOptions(fixture, sessionType));
        const chosen = scoreLayout(selectedPartition(result), oracle);
        expect(frontier.admitted.some((row) => layoutName(row.partition) === layoutName(chosen.partition)), state.name).toBe(true);
        expect(quartetKey([...chosen.partition.team1, ...chosen.partition.team2]), state.name)
          .toBe(quartetKey(MIXED_DOUBLE_REST_QUARTET));
        expect(result.chosenImmediateReplayCount, state.name).toBe(1);
        expect(result.bestImmediateReplayCount, state.name).toBe(0);
        expect(result.recurrenceFrontierCertified, state.name).toBe(true);
        expect(result.recurrenceAdmissionCertified, state.name).toBe(true);
        expect(result.firstExposureCompletePlayerCount, state.name).toBe(8);
        expect(result.bestMatureDeltaTAtRmin, state.name).toBe(state.bestT);
        expect(result.bestMatureDeltaTAtRminUnits, state.name).toBe(state.bestUnits);
        expect(result.bestMatureDeltaTAtRminDenominator, state.name).toBe("2");
        expect(result.chosenMatureDeltaT, state.name).toBe(state.chosenT);
        expect(result.chosenMatureDeltaTUnits, state.name).toBe(state.chosenUnits);
        expect(result.conditionalTBenefit, state.name).toBe(2);
        expect(result.coverageExceptionEligible, state.name).toBe(false);
        expect(result.recurrenceExceptionEligible, state.name).toBe(true);
        expect(result.chosenRecurrenceRescue, state.name).toBe(true);
        expect(result.selectedAdmissionEligible, state.name).toBe(true);
        expect(result.admissionReasons, state.name).toEqual(["recurrence"]);
        expect(result.matureRecurrencePlayers.every((row) => row.firstExposureCompleteBefore), state.name).toBe(true);
      }
    }
  );

  it("excludes a T tie with no first-exposure gain, while retaining only Rmin layouts", () => {
    const players = standardPlayers({ L1: { restTurns: 0 }, L2: { restTurns: 0 } });
    const quartets = [OWN_QUARTET, MIXED_DOUBLE_REST_QUARTET, MIXED_QUARTET];
    const history = historyWithRecentTypeWindows(players, 3, 3);
    const fixture = completeFixture(players, history, quartets);
    const candidatePartitions = enumerateCandidatePartitions(players, quartets);
    const oracle = buildOracleContext(players, history, history, candidatePartitions);
    const rows = candidatePartitions.map((partition) => scoreLayout(partition, oracle));
    const frontier = strictReplayFrontierOracle(rows);
    expect(frontier.rmin).toBe(0);
    expect(frontier.bestCoverageAtRmin).toBe(BigInt(0));
    expect(frontier.bestTAtRminUnits).toBe(BigInt(0));
    expect(rows.every((row) => row.rollingTypeUnits === BigInt(0) && row.relationshipCoverageUnits === BigInt(0))).toBe(true);
    expect(frontier.admitted.every((row) => row.replayCount === frontier.rmin)).toBe(true);
    expect(frontier.admitted).toHaveLength(3);
    expect(rows.filter((row) => row.replayCount > frontier.rmin).every((row) =>
      frontier.reasonsFor(row).length === 0
    )).toBe(true);

    const result = findBestBalancedRecurrenceSelection(players,
      strictRecurrenceOptions(fixture, SessionType.POINTS));
    expect(result.chosenImmediateReplayCount).toBe(0);
    expect(result.recurrenceFrontierCertified).toBe(true);
    expect(result.bestMatureDeltaTAtRminUnits).toBe("0");
    expect(result.coverageExceptionEligible).toBe(false);
    expect(result.recurrenceExceptionEligible).toBe(false);
    expect(result.selectedAdmissionEligible).toBe(true);
    expect(result.admissionReasons).toEqual(["replay-minimum"]);
    expect(result.chosenRecurrenceRescue).toBe(false);
    expect(result.conditionalTBenefit).toBe(0);
  });

  it("admits a tied-T Rmin+1 layout through first exposure alone", () => {
    const players = standardPlayers({ L2: { restTurns: 0 } });
    const history = completedHistoryForCoverageTie(players);
    const quartets = [OWN_QUARTET, MIXED_QUARTET];
    const fixture = completeFixture(players, history, quartets);
    const candidatePartitions = enumerateCandidatePartitions(players, quartets);
    const oracle = buildOracleContext(players, history, history, candidatePartitions);
    const rows = candidatePartitions.map((partition) => scoreLayout(partition, oracle));
    const frontier = strictReplayFrontierOracle(rows);
    expect([...oracle.typeRows.values()].every((row) => row.eligible && row.window.length === 6 &&
      row.window.filter((type) => type === "OWN_SIDE").length === 3 &&
      row.window.filter((type) => type === "MIXED").length === 3
    )).toBe(true);
    expect(rows.every((row) => row.rollingTypeUnits === BigInt(0))).toBe(true);
    expect(frontier.bestTAtRminUnits).toBe(BigInt(0));
    expect(frontier.bestCoverageAtRmin).toBe(BigInt(0));
    const coveredTies = rows.filter((row) => row.replayCount === frontier.rmin + 1 &&
      row.rollingTypeUnits === frontier.bestTAtRminUnits &&
      row.relationshipCoverageUnits > frontier.bestCoverageAtRmin);
    expect(coveredTies.length).toBeGreaterThan(0);
    expect(coveredTies.every((row) => frontier.reasonsFor(row).join(",") === "first-exposure")).toBe(true);
    expect(frontier.admitted.some((row) => row.replayCount === frontier.rmin + 1)).toBe(true);

    const result = findBestBalancedRecurrenceSelection(players,
      strictRecurrenceOptions(fixture, SessionType.POINTS));
    const chosen = scoreLayout(selectedPartition(result), oracle);
    expect(frontier.admitted.some((row) => layoutName(row.partition) === layoutName(chosen.partition))).toBe(true);
    expect(frontier.reasonsFor(chosen)).toEqual(["first-exposure"]);
    expect(chosen.relationshipCoverageUnits).toBeGreaterThan(frontier.bestCoverageAtRmin);
    expect(chosen.rollingTypeUnits).toBe(frontier.bestTAtRminUnits);
    expect(result.chosenImmediateReplayCount).toBe(1);
    expect(classifyType(selectedPartition(result), oracle.playersById)).toBe("MIXED");
    expect(result.chosenMatureDeltaT).toBe(0);
    expect(result.bestMatureDeltaTAtRmin).toBe(0);
    expect(result.coverageExceptionEligible).toBe(true);
    expect(result.recurrenceExceptionEligible).toBe(false);
    expect(result.chosenRecurrenceRescue).toBe(false);
    expect(result.selectedAdmissionEligible).toBe(true);
    expect(result.admissionReasons).toEqual(["first-exposure"]);
    expect(result.conditionalTBenefit).toBe(0);
    expect(result.chosenImmediateCoverageGain).toBeGreaterThan(result.bestMinimumReplayCoverageGain!);
  });

  it("records both admission reasons when a first-exposure gain and strict T gain coincide", () => {
    const players = standardPlayers({ L2: { restTurns: 0 } });
    const history = completedHistoryForBothReasons(players);
    const quartets = [OWN_QUARTET, MIXED_QUARTET];
    const fixture = completeFixture(players, history, quartets);
    const candidatePartitions = enumerateCandidatePartitions(players, quartets);
    const oracle = buildOracleContext(players, history, history, candidatePartitions);
    const rows = candidatePartitions.map((partition) => scoreLayout(partition, oracle));
    const frontier = strictReplayFrontierOracle(rows);
    expect([...oracle.typeRows.values()].every((row) => row.eligible && row.window.length === 6 &&
      row.window.every((type) => type === "OWN_SIDE")
    )).toBe(true);
    expect(frontier.bestTAtRminUnits).toBe(BigInt(0));
    const bothReasons = rows.filter((row) => row.replayCount === frontier.rmin + 1 &&
      row.relationshipCoverageUnits > frontier.bestCoverageAtRmin &&
      row.rollingTypeUnits > frontier.bestTAtRminUnits);
    expect(bothReasons.length).toBeGreaterThan(0);
    expect(bothReasons.every((row) =>
      frontier.reasonsFor(row).join(",") === "first-exposure,recurrence"
    )).toBe(true);

    const result = findBestBalancedRecurrenceSelection(players,
      strictRecurrenceOptions(fixture, SessionType.POINTS));
    const chosen = scoreLayout(selectedPartition(result), oracle);
    expect(frontier.admitted.some((row) => layoutName(row.partition) === layoutName(chosen.partition))).toBe(true);
    expect(frontier.reasonsFor(chosen)).toEqual(["first-exposure", "recurrence"]);
    expect(chosen.relationshipCoverageUnits).toBeGreaterThan(frontier.bestCoverageAtRmin);
    expect(chosen.rollingTypeUnits).toBeGreaterThan(frontier.bestTAtRminUnits);
    expect(result.chosenImmediateReplayCount).toBe(1);
    expect(classifyType(selectedPartition(result), oracle.playersById)).toBe("MIXED");
    expect(result.bestMatureDeltaTAtRmin).toBe(0);
    expect(result.chosenMatureDeltaT).toBe(2);
    expect(result.conditionalTBenefit).toBe(2);
    expect(result.coverageExceptionEligible).toBe(true);
    expect(result.recurrenceExceptionEligible).toBe(true);
    expect(result.chosenRecurrenceRescue).toBe(true);
    expect(result.admissionReasons).toEqual(["first-exposure", "recurrence"]);
  });

  it("keeps count fairness, arrival, overdue starvation, schedule rank, balance envelope, and replay minimum ahead of T", () => {
    const scenarios: Array<{
      name: string;
      overrides: Partial<Record<string, Partial<TestPlayer>>>;
      expectedLayer: "fairness" | "arrival" | "starvation" | "balance" | "replay";
      sessionType?: SessionType.POINTS | SessionType.ELO;
      schedule?: boolean;
    }> = [
      {
        name: "count fairness",
        overrides: { L1: { matchesPlayed: 80, matchmakingBaseline: 80 }, L2: { matchesPlayed: 80, matchmakingBaseline: 80 } },
        expectedLayer: "fairness",
      },
      {
        name: "arrival",
        overrides: {
          L1: { arrivalPriorityAt: new Date("2026-03-01T00:00:00.000Z") },
          L2: { arrivalPriorityAt: new Date("2026-03-01T00:00:00.000Z") },
        },
        expectedLayer: "arrival",
      },
      {
        name: "overdue starvation",
        overrides: { U3: { restTurns: 4 }, U4: { restTurns: 4 } },
        expectedLayer: "starvation",
      },
      {
        name: "fixed POINTS envelope",
        overrides: { L2: { strength: 1200 } },
        expectedLayer: "balance",
        sessionType: SessionType.POINTS,
      },
      {
        name: "replay minimum excludes an Rmin+2 mixed rescue",
        // Both rested players belong to every feasible mixed candidate, so
        // mixed layouts cost two replays and cannot use the strict Rmin+1 rescue.
        overrides: { L1: { restTurns: 0 }, L2: { restTurns: 0 } },
        expectedLayer: "replay",
      },
    ];

    for (const scenario of scenarios) {
      const players = standardPlayers(scenario.overrides);
      const history = historyWithRecentTypeWindows(players, 0, 6);
      const fixture = completeFixture(players, history);
      const oracle = buildOracleContext(players, history, history,
        enumerateCandidatePartitions(players, fixture.quartets));
      const scored = enumerateCandidatePartitions(players, fixture.quartets)
        .map((partition) => scoreLayout(partition, oracle));
      const own = scored.filter((row) => row.matchType === "OWN_SIDE");
      const mixed = scored.filter((row) => row.matchType === "MIXED");
      expect(mixed[0]!.rollingTypeUnits).toBeGreaterThan(own[0]!.rollingTypeUnits);

      if (scenario.expectedLayer === "fairness") {
        expect(compareLex(independentRotationClass(own[0]!.partition, players).fairness,
          independentRotationClass(mixed[0]!.partition, players).fairness)).toBeLessThan(0);
      } else if (scenario.expectedLayer === "arrival") {
        expect(compareLex(independentRotationClass(own[0]!.partition, players).fairness,
          independentRotationClass(mixed[0]!.partition, players).fairness)).toBeLessThan(0);
      } else if (scenario.expectedLayer === "starvation") {
        expect(compareLex(independentRotationClass(own[0]!.partition, players).starvation,
          independentRotationClass(mixed[0]!.partition, players).starvation)).toBeLessThan(0);
      } else if (scenario.expectedLayer === "balance") {
        expect(bestStrengthGap(own)).toBe(0);
        expect(bestStrengthGap(mixed)).toBe(100);
        const allowedMax = scenario.sessionType === SessionType.ELO ? 30 : 1.5;
        expect(bestStrengthGap(own)).toBeLessThanOrEqual(allowedMax);
        expect(bestStrengthGap(mixed)).toBeGreaterThan(allowedMax);
      } else {
        expect(Math.min(...own.map((row) => row.replayCount))).toBe(0);
        expect(mixed.every((row) => row.replayCount === 2)).toBe(true);
        expect(mixed.every((row) => row.rollingTypeUnits > own[0]!.rollingTypeUnits)).toBe(true);
        expect(Math.max(...own.map((row) => Number(row.relationshipCoverageUnits)))).toBe(0);
        expect(Math.max(...mixed.map((row) => Number(row.relationshipCoverageUnits)))).toBe(0);
        const frontier = strictReplayFrontierOracle(scored);
        expect(frontier.rmin).toBe(0);
        expect(frontier.admitted.some((row) => row.replayCount === frontier.rmin + 2)).toBe(false);
        expect(frontier.admitted.every((row) => row.replayCount === frontier.rmin)).toBe(true);
      }

      const result = findBestBalancedRecurrenceSelection(
        players,
        recurrenceOptions(fixture, scenario.sessionType ?? SessionType.POINTS)
      );
      expect(classifyType(selectedPartition(result), oracle.playersById), scenario.name).toBe("OWN_SIDE");
      expect(result.recurrenceCertified, scenario.name).toBe(true);
      expect(result.fairnessCertified, scenario.name).toBe(true);
      expect(result.starvationCertified, scenario.name).toBe(true);
      expect(result.replayCertified, scenario.name).toBe(true);
      expect(result.coverageGateCertified, scenario.name).toBe(true);
      expect(result.balanceCertified, scenario.name).toBe(true);
      if (scenario.expectedLayer === "replay") {
        expect(result.bestImmediateReplayCount).toBe(0);
        expect(result.chosenImmediateReplayCount).toBe(0);
        expect(result.bestMinimumReplayCoverageGain).toBe(0);
        expect(result.chosenImmediateCoverageGain).toBe(0);
      }
    }

    const schedulePlayers = standardPlayers();
    const scheduleHistory = historyWithRecentTypeWindows(schedulePlayers, 0, 6);
    const scheduleFixture = completeFixture(schedulePlayers, scheduleHistory);
    const ownConstraints = allowQuartets([OWN_QUARTET]);
    const mixedConstraints = allowQuartets([MIXED_QUARTET]);
    const scheduleOptions = optionsForSchedule(scheduleFixture, SessionType.POINTS, [
      { rank: 0, courts: [ownConstraints] },
      { rank: 1, courts: [mixedConstraints] },
    ]);
    const scheduleResult = findBestBalancedRecurrenceSelection(schedulePlayers, scheduleOptions);
    expect(classifyType(selectedPartition(scheduleResult), new Map(schedulePlayers.map((player) => [player.userId, player])))
    ).toBe("OWN_SIDE");
    expect(scheduleResult.scheduleIndex).toBe(0);
    expect(scheduleResult.scheduleCertified).toBe(true);
    expect(scheduleResult.chosenMatureDeltaT).toBe(0);
  });

  it.each([SessionType.POINTS, SessionType.ELO] as const)(
    "%s has zero recurrence preference when only OWN_SIDE is structurally feasible",
    (sessionType) => {
      const players = UPPER_IDS.map((id) => makePlayer(id, "UPPER"));
      const partitions = legalStructuralPartitions(players);
      expect(partitions).toHaveLength(3);
      const byId = new Map(players.map((player) => [player.userId, player]));
      const history = Array.from({ length: 6 }, (_, index) =>
        matchWithType(`one-type-${index}`, partitions[index % partitions.length]!, byId,
          new Date(Date.UTC(2026, 0, 1, 0, 0, index + 1)))
      );
      const fixture: RecurrenceFixture = {
        players,
        completed: history,
        socialHistory: history,
        quartets: [OWN_QUARTET],
      };
      const result = findBestBalancedRecurrenceSelection(
        players,
        recurrenceOptions(fixture, sessionType)
      );
      const oracle = buildOracleContext(players, history);
      const chosen = scoreLayout(selectedPartition(result), oracle);
      expect(oracle.typeRows.size).toBe(4);
      expect([...oracle.typeRows.values()].every((row) => row.eligible)).toBe(true);
      expect(chosen.rollingTypeUnits).toBe(BigInt(0));
      expect(result.recurrenceCertified).toBe(true);
      expect(result.matureTypeEligiblePlayerCount).toBe(4);
      expect(result.firstExposureCompletePlayerCount).toBe(4);
      expect(result.chosenMatureDeltaT).toBe(0);
      expect(result.matureRecurrencePlayers.every((row) =>
        row.firstExposureCompleteBefore && row.feasibleMatchTypes.length === 1 &&
        row.feasibleMatchTypes[0] === "OWN_SIDE" && row.deltaT === 0
      )).toBe(true);
    }
  );

  it("enforces the production selector's Balanced session and fixed gate boundaries", () => {
    const players = standardPlayers();
    const fixture = completeFixture(players, historyWithRecentTypeWindows(players, 0, 6));
    const options = recurrenceOptions(fixture, SessionType.POINTS);

    expect(() => findBestBalancedRecurrenceSelection(players, {
      ...options,
      sessionType: SessionType.SOCIAL_MIX,
    } as unknown as BalancedRecurrenceOptions<TestPlayer>)).toThrow(
      "Balanced recurrence selection supports only POINTS and ELO sessions."
    );
    expect(() => findBestBalancedRecurrenceSelection(players, {
      ...options,
      socialPriorityPolicy: "courtmate-first",
    } as unknown as BalancedRecurrenceOptions<TestPlayer>)).toThrow(
      "Balanced recurrence selection does not accept a Social priority policy."
    );
    expect(() => findBestBalancedRecurrenceSelection(players, {
      ...options,
      respectPlayerRest: false,
    })).toThrow("Balanced recurrence selection requires the existing replay and first-exposure gates.");
    expect(() => findBestBalancedRecurrenceSelection(players, {
      ...options,
      coverageGainMetric: "rolling-equal",
    } as unknown as BalancedRecurrenceOptions<TestPlayer>)).toThrow(
      "Balanced recurrence selection uses the fixed production first-exposure gate."
    );
    expect(() => findBestBalancedRecurrenceSelection(players, {
      ...options,
      balanceGuardrailPolicy: { nearBestWindow: 999 },
    } as unknown as BalancedRecurrenceOptions<TestPlayer>)).toThrow(
      "Balanced recurrence selection uses the fixed production Balanced envelope."
    );
  });

  it("fails closed when the ordinary search budget interrupts certification", () => {
    const players = standardPlayers();
    const fixture = completeFixture(players, historyWithRecentTypeWindows(players, 0, 6));
    const result = findBestBalancedRecurrenceSelection(
      players,
      recurrenceOptions(fixture, SessionType.POINTS, { searchLimits: { maxBranches: 1, maxMs: 10_000 } })
    );
    expect(result.selection).toBeNull();
    expect(result.recurrenceCertified).toBe(false);
    expect(result.varietyOptimal).toBe(false);
    expect(result.recurrenceAdmissionCertified).toBe(false);
    expect(result.chosenMatureDeltaT).toBeNull();
    expect(result.chosenMatureDeltaTUnits).toBeNull();
    expect(result.selectedAdmissionEligible).toBeNull();
    expect(result.admissionReasons).toBeNull();
    expect(result.debug.searchLimitReached).toBe(true);
    expect(result.debug.recurrenceFrontierCertified).toBe(result.recurrenceFrontierCertified);
    expect(result.debug.bestMatureDeltaTAtRminUnits).toBe(result.bestMatureDeltaTAtRminUnits);
    if (result.recurrenceFrontierCertified) {
      expect(result.bestMatureDeltaTAtRminUnits).not.toBeNull();
      expect(result.bestMatureDeltaTAtRminDenominator).not.toBeNull();
    }
  });



});
