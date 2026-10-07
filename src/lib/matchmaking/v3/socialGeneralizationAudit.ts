import { getEffectiveMixedSide } from "@/lib/mixedSide";
import type { ActiveMatchmakerV3Player, MatchmakerV3Player, SocialHistoryMatch, V3DoublesPartition } from "./types";
import type { SocialGeneralizationStructuralPlayer, SocialGeneralizationSide } from "./socialGeneralizationScenarios";

export type GeneralizationMatchType = "MIXED" | "OWN_SIDE";
type RelationshipFacet = "courtmates" | "partners" | "opponents";
type MatchTypeOrUnknown = GeneralizationMatchType | null;

/** A structural roster accepts either the scenario catalog's explicit side or a production player. */
export type SocialGeneralizationRosterPlayer = Pick<MatchmakerV3Player, "userId"> &
  Partial<Pick<MatchmakerV3Player, "gender" | "partnerPreference" | "mixedSideOverride" | "isPaused">> & {
    readonly side?: SocialGeneralizationSide;
  };

export interface SocialGeneralizationOpportunityCatalog {
  readonly players: readonly {
    readonly userId: string;
    readonly side: SocialGeneralizationSide | null;
    readonly feasibleMatchTypes: readonly GeneralizationMatchType[];
    readonly feasibleCourtmates: readonly string[];
    readonly feasiblePartners: readonly string[];
    readonly feasibleOpponents: readonly string[];
  }[];
  readonly rollingTypeDenominator: string;
}

export interface SocialGeneralizationFacetScore {
  readonly averageDistinctPeers: number | null;
  readonly minimumDistinctPeers: number | null;
  readonly meanCoverage: number | null;
  readonly worstPlayerCoverage: number | null;
  readonly fullyCoveredPlayerCount: number;
  readonly feasiblePairCount: number;
  readonly coveredPairCount: number;
  readonly meanNormalizedEntropy: number | null;
}

export interface SocialGeneralizationPlayerPrefixScore {
  readonly userId: string;
  readonly feasibleCourtmates: number;
  readonly distinctCourtmates: number;
  readonly courtmateCoverage: number | null;
  readonly feasiblePartners: number;
  readonly distinctPartners: number;
  readonly partnerCoverage: number | null;
  readonly feasibleOpponents: number;
  readonly distinctOpponents: number;
  readonly opponentCoverage: number | null;
  readonly feasibleMatchTypes: readonly GeneralizationMatchType[];
  readonly recentMatchTypes: readonly MatchTypeOrUnknown[];
  readonly T: number | null;
}

export interface SocialGeneralizationPrefixScore {
  readonly playerCount: number;
  readonly courtmates: SocialGeneralizationFacetScore;
  readonly partners: SocialGeneralizationFacetScore;
  readonly opponents: SocialGeneralizationFacetScore;
  readonly meanT: number | null;
  readonly fullTypeCoverageFraction: number | null;
  readonly halfTypeCoverageFraction: number | null;
  readonly typeEligiblePlayerCount: number;
  readonly oneTypePlayerCount: number;
  readonly feasibleTypePlayerCounts: Readonly<Record<GeneralizationMatchType, number>>;
  readonly completedMatchTypeCounts: Readonly<Record<GeneralizationMatchType, number>>;
  readonly longestSingleTypeAppearanceRun: number;
  readonly players: readonly SocialGeneralizationPlayerPrefixScore[];
}

export interface SocialGeneralizationPrefixInput {
  /** Full current structural roster; paused players remain in this vocabulary. */
  readonly structuralRoster: readonly SocialGeneralizationRosterPlayer[] | readonly SocialGeneralizationStructuralPlayer[];
  /** Optional production opportunity roster, usually the current nonpaused roster. */
  readonly opportunityRoster?: readonly SocialGeneralizationRosterPlayer[] | readonly SocialGeneralizationStructuralPlayer[];
  readonly completedHistory: readonly SocialHistoryMatch[];
}

export interface SocialGeneralizationPrefixResult {
  readonly structural: SocialGeneralizationPrefixScore;
  readonly opportunity: SocialGeneralizationPrefixScore | null;
}

export interface SocialGeneralizationSelectedCourt {
  readonly ids: readonly string[];
  readonly partition: V3DoublesPartition;
}

export interface SocialGeneralizationDecisionAuditInput {
  readonly structuralRoster: readonly SocialGeneralizationRosterPlayer[] | readonly SocialGeneralizationStructuralPlayer[];
  /** Actual pre-decision active candidates, before any candidate-pool trimming. */
  readonly availablePlayers: readonly ActiveMatchmakerV3Player[];
  readonly completedHistory: readonly SocialHistoryMatch[];
  readonly selected: readonly SocialGeneralizationSelectedCourt[];
  readonly courtCount: number;
  readonly respectStarvation?: boolean;
  readonly rotationPlayerCount?: number;
  /** Hard caps make large 3-court proofs fail closed instead of hanging. */
  readonly maxBatches?: number;
  readonly maxSearchNodes?: number;
}

export interface SocialGeneralizationDecisionAudit {
  readonly status: "certified" | "incomplete" | "no-legal-batch";
  readonly complete: boolean;
  readonly reason: "search-node-limit" | "batch-limit" | "no-legal-batch" | null;
  readonly searchNodes: number;
  readonly visitedBatches: number;
  readonly strongestClassBatchCount: number;
  readonly idealRestGap: number;
  readonly rollingTypeDenominator: string;
  readonly typeEligiblePlayerCount: number;
  readonly baselineFullTypePlayerCount: number;
  readonly baselineBothTypePlayerCount: number;
  readonly selectedValid: boolean;
  readonly selectedFairnessCertified: boolean;
  readonly selectedFairnessCertificate: "exhaustive" | "global-lower-bound" | "none";
  readonly selectedStarvationCertified: boolean;
  readonly selectedStarvationCertificate: "exhaustive" | "zero-starvation-lower-bound" | "none";
  readonly selectedCourtmateGain: number | null;
  readonly courtmateGainMaximum: number | null;
  readonly selectedSignedRollingTypeGainUnits: string | null;
  readonly selectedSignedRollingTypeGain: number | null;
  readonly selectedFullTypePlayerCount: number | null;
  readonly selectedBothTypePlayerCount: number | null;
  readonly selectedTypeWindows: readonly SocialGeneralizationTypeWindowWitness[] | null;
  readonly bestSignedRollingTypeGainAtGmaxUnits: string | null;
  readonly bestSignedRollingTypeGainAtGmax: number | null;
  readonly bestGmaxWitness: SocialGeneralizationTypeWindowSelectionWitness | null;
  /** True only for a fully certified batch at Gmax, or Gmax−1 with strictly higher signed T than Tmax at Gmax. */
  readonly beneficialRescueAdmitted: boolean;
  readonly onePairConditionalTypeBenefitUnits: string | null;
}

export interface SocialGeneralizationTypeWindowWitness {
  readonly userId: string;
  readonly feasibleTypes: readonly GeneralizationMatchType[];
  readonly recentTypesBefore: readonly MatchTypeOrUnknown[];
  readonly recentTypesAfter: readonly MatchTypeOrUnknown[];
  readonly TBefore: number | null;
  readonly TAfter: number | null;
}

export interface SocialGeneralizationTypeWindowSelectionWitness {
  readonly courts: readonly SocialGeneralizationSelectedCourt[];
  readonly signedRollingTypeGainUnits: string;
  readonly fullTypePlayerCount: number;
  /** Players whose current structural vocabulary has both feasible types and whose post-batch window covers both. */
  readonly bothTypePlayerCount: number;
  /** Assigned players only; other players' windows are unchanged. */
  readonly players: readonly SocialGeneralizationTypeWindowWitness[];
}

interface InternalCatalog {
  readonly sideByUserId: ReadonlyMap<string, SocialGeneralizationSide | null>;
  readonly feasibleTypesByUserId: ReadonlyMap<string, ReadonlySet<GeneralizationMatchType>>;
  readonly opportunitiesByFacet: ReadonlyMap<string, ReadonlySet<string>>;
  readonly rollingTypeDenominator: bigint;
  readonly publicCatalog: SocialGeneralizationOpportunityCatalog;
}

interface CourtChoice {
  readonly ids: readonly string[];
  readonly partition: V3DoublesPartition;
  readonly mask: bigint;
  readonly courtmateGain: number;
  readonly signedTypeGainUnits: bigint;
}

const FACETS: readonly RelationshipFacet[] = ["courtmates", "partners", "opponents"];
const WINDOW_SIZE = 6;
const DEFAULT_MAX_BATCHES = 250_000;
const DEFAULT_MAX_SEARCH_NODES = 500_000;

function gcd(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== BigInt(0)) [a, b] = [b, a % b];
  return a;
}

function lcm(left: bigint, right: bigint): bigint {
  if (left === BigInt(0) || right === BigInt(0)) return BigInt(0);
  return left / gcd(left, right) * right;
}

function pairKey(left: string, right: string): string {
  return JSON.stringify(left < right ? [left, right] : [right, left]);
}

function facetKey(facet: RelationshipFacet, userId: string): string {
  return `${facet}\u0001${userId}`;
}

function sideForPlayer(player: SocialGeneralizationRosterPlayer): SocialGeneralizationSide | null {
  if (player.side === "UPPER" || player.side === "LOWER") return player.side;
  const side = getEffectiveMixedSide(player);
  return side === "UPPER" || side === "LOWER" ? side : null;
}

function makeCatalog(roster: readonly SocialGeneralizationRosterPlayer[]): InternalCatalog {
  const sideByUserId = new Map(roster.map((player) => [player.userId, sideForPlayer(player)]));
  const upper = roster.filter((player) => sideByUserId.get(player.userId) === "UPPER").map((player) => player.userId);
  const lower = roster.filter((player) => sideByUserId.get(player.userId) === "LOWER").map((player) => player.userId);
  const mixedPossible = upper.length >= 2 && lower.length >= 2;
  const opportunitiesByFacet = new Map<string, ReadonlySet<string>>();
  const feasibleTypesByUserId = new Map<string, ReadonlySet<GeneralizationMatchType>>();
  let rollingTypeDenominator = BigInt(1);

  for (const player of roster) {
    const userId = player.userId;
    const side = sideByUserId.get(userId);
    const sameSide = side === "UPPER" ? upper : side === "LOWER" ? lower : [];
    const otherSide = side === "UPPER" ? lower : side === "LOWER" ? upper : [];
    const ownPossible = sameSide.length >= 4;
    const types = new Set<GeneralizationMatchType>();
    if (mixedPossible && side) types.add("MIXED");
    if (ownPossible && side) types.add("OWN_SIDE");
    feasibleTypesByUserId.set(userId, types);
    if (types.size > 0) rollingTypeDenominator = lcm(rollingTypeDenominator, BigInt(types.size));

    const courtmates = new Set<string>();
    const partners = new Set<string>();
    const opponents = new Set<string>();
    if (roster.length >= 4 && side && (mixedPossible || ownPossible)) {
      if (mixedPossible) {
        for (const peerId of otherSide) {
          courtmates.add(peerId);
          partners.add(peerId);
          opponents.add(peerId);
        }
      }
      for (const peerId of sameSide) {
        if (peerId === userId) continue;
        courtmates.add(peerId);
        opponents.add(peerId);
        if (ownPossible) partners.add(peerId);
      }
    }
    opportunitiesByFacet.set(facetKey("courtmates", userId), courtmates);
    opportunitiesByFacet.set(facetKey("partners", userId), partners);
    opportunitiesByFacet.set(facetKey("opponents", userId), opponents);
  }

  const publicCatalog: SocialGeneralizationOpportunityCatalog = {
    players: roster.map((player) => ({
      userId: player.userId,
      side: sideByUserId.get(player.userId) ?? null,
      feasibleMatchTypes: [...(feasibleTypesByUserId.get(player.userId) ?? [])].sort(),
      feasibleCourtmates: [...(opportunitiesByFacet.get(facetKey("courtmates", player.userId)) ?? [])].sort(),
      feasiblePartners: [...(opportunitiesByFacet.get(facetKey("partners", player.userId)) ?? [])].sort(),
      feasibleOpponents: [...(opportunitiesByFacet.get(facetKey("opponents", player.userId)) ?? [])].sort(),
    })),
    rollingTypeDenominator: rollingTypeDenominator.toString(),
  };
  return { sideByUserId, feasibleTypesByUserId, opportunitiesByFacet, rollingTypeDenominator, publicCatalog };
}

/** Independently derives Social structural peer/type vocabularies from the full current roster. */
export function buildSocialGeneralizationOpportunityCatalog(
  roster: readonly SocialGeneralizationRosterPlayer[] | readonly SocialGeneralizationStructuralPlayer[]
): SocialGeneralizationOpportunityCatalog {
  return makeCatalog(roster).publicCatalog;
}

function validIds(partition: V3DoublesPartition): string[] | null {
  const ids = [...partition.team1, ...partition.team2];
  return ids.length === 4 && ids.every((id) => typeof id === "string" && id.length > 0) && new Set(ids).size === 4
    ? ids
    : null;
}

function typeForSides(ids: readonly string[], team1: readonly string[], sideByUserId: ReadonlyMap<string, SocialGeneralizationSide | null>): MatchTypeOrUnknown {
  const sides = ids.map((id) => sideByUserId.get(id));
  if (sides.some((side) => side !== "UPPER" && side !== "LOWER")) return null;
  if (sides.every((side) => side === "UPPER") || sides.every((side) => side === "LOWER")) return "OWN_SIDE";
  const team1Sides = team1.map((id) => sideByUserId.get(id));
  const otherTeam = ids.filter((id) => !team1.includes(id));
  const team2Sides = otherTeam.map((id) => sideByUserId.get(id));
  return team1Sides.includes("UPPER") && team1Sides.includes("LOWER") &&
    team2Sides.includes("UPPER") && team2Sides.includes("LOWER")
    ? "MIXED"
    : null;
}

function historyMatchType(
  match: SocialHistoryMatch,
  sideByUserId: ReadonlyMap<string, SocialGeneralizationSide | null>
): MatchTypeOrUnknown {
  const ids = validIds(match);
  if (!ids) return null;
  const snapshot = match.socialVariety;
  if (snapshot && Object.hasOwn(snapshot, "courtType")) {
    if (snapshot.courtType === "MIXED") return "MIXED";
    if (snapshot.courtType === "UPPER" || snapshot.courtType === "LOWER") return "OWN_SIDE";
    return null;
  }
  const snapshotSides = snapshot?.effectiveSideByUserId;
  const historicalSides = snapshotSides && ids.every((id) => snapshotSides[id] === "UPPER" || snapshotSides[id] === "LOWER")
    ? new Map(ids.map((id) => [id, snapshotSides[id] as SocialGeneralizationSide]))
    : sideByUserId;
  return typeForSides(ids, match.team1, historicalSides);
}

function orderedUniqueHistory(history: readonly SocialHistoryMatch[]): readonly SocialHistoryMatch[] {
  const seenIds = new Set<string>();
  const items = history.flatMap((match, inputIndex) => {
    if (match.id) {
      if (seenIds.has(match.id)) return [];
      seenIds.add(match.id);
    }
    const raw = (match as SocialHistoryMatch & { completedAt?: unknown }).completedAt;
    const time = raw instanceof Date ? raw.getTime()
      : typeof raw === "string" ? new Date(raw).getTime() : Number.NaN;
    return [{ match, inputIndex, time: Number.isFinite(time) ? time : null }];
  });
  if (items.every((item) => item.time !== null)) {
    items.sort((left, right) => left.time! - right.time! || left.inputIndex - right.inputIndex);
  }
  return items.map((item) => item.match);
}

function historyTypeWindows(
  roster: readonly SocialGeneralizationRosterPlayer[],
  history: readonly SocialHistoryMatch[],
  sideByUserId: ReadonlyMap<string, SocialGeneralizationSide | null>
) {
  const windows = new Map(roster.map((player) => [player.userId, [] as MatchTypeOrUnknown[]]));
  for (const match of orderedUniqueHistory(history)) {
    const ids = validIds(match);
    if (!ids) continue;
    const type = historyMatchType(match, sideByUserId);
    for (const id of ids) {
      const window = windows.get(id);
      if (!window) continue;
      window.push(type);
      if (window.length > WINDOW_SIZE) window.shift();
    }
  }
  return windows;
}

function coveredTypes(window: readonly MatchTypeOrUnknown[], feasible: ReadonlySet<GeneralizationMatchType>): number {
  return new Set(window.filter((type): type is GeneralizationMatchType => type !== null && feasible.has(type))).size;
}

function signedTypeGain(
  partition: V3DoublesPartition,
  catalog: InternalCatalog,
  windows: ReadonlyMap<string, readonly MatchTypeOrUnknown[]>
): bigint {
  const ids = validIds(partition);
  if (!ids || catalog.rollingTypeDenominator === BigInt(0)) return BigInt(0);
  const matchType = typeForSides(ids, partition.team1, catalog.sideByUserId);
  let gain = BigInt(0);
  for (const userId of ids) {
    const feasible = catalog.feasibleTypesByUserId.get(userId);
    if (!feasible?.size) continue;
    const beforeWindow = windows.get(userId) ?? [];
    const before = coveredTypes(beforeWindow, feasible);
    const afterWindow = [...beforeWindow, matchType];
    if (afterWindow.length > WINDOW_SIZE) afterWindow.shift();
    const after = coveredTypes(afterWindow, feasible);
    gain += BigInt(after - before) * (catalog.rollingTypeDenominator / BigInt(feasible.size));
  }
  return gain;
}

function courtmateHistory(history: readonly SocialHistoryMatch[]): Set<string> {
  const pairs = new Set<string>();
  for (const match of history) {
    const ids = validIds(match);
    if (!ids) continue;
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) pairs.add(pairKey(ids[left], ids[right]));
    }
  }
  return pairs;
}

function newCourtmateGain(
  ids: readonly string[],
  catalog: InternalCatalog,
  seenPairs: ReadonlySet<string>
): number {
  let gain = 0;
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) {
      const first = ids[left];
      const second = ids[right];
      const firstPeers = catalog.opportunitiesByFacet.get(facetKey("courtmates", first));
      const secondPeers = catalog.opportunitiesByFacet.get(facetKey("courtmates", second));
      if (firstPeers?.has(second) && secondPeers?.has(first) && !seenPairs.has(pairKey(first, second))) gain += 1;
    }
  }
  return gain;
}

function forEachCombination<T>(items: readonly T[], count: number, visit: (chosen: T[]) => void): void {
  const chosen: T[] = [];
  const walk = (start: number) => {
    if (chosen.length === count) {
      visit([...chosen]);
      return;
    }
    const remaining = count - chosen.length;
    for (let index = start; index <= items.length - remaining; index += 1) {
      chosen.push(items[index]);
      walk(index + 1);
      chosen.pop();
    }
  };
  walk(0);
}

function compareVectors(left: readonly number[], right: readonly number[]): number {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a < b ? -1 : 1;
  }
  return 0;
}

function effectiveCount(player: ActiveMatchmakerV3Player): number {
  return Number.isFinite(player.effectiveMatchCount)
    ? player.effectiveMatchCount
    : Math.max(player.matchesPlayed, player.matchmakingBaseline);
}

function arrivalTime(player: ActiveMatchmakerV3Player): number | null {
  const value = player.arrivalPriorityAt;
  if (value === null || value === undefined) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function fairnessVector(players: readonly ActiveMatchmakerV3Player[]): number[] {
  const counts = players.map(effectiveCount).sort((left, right) => left - right);
  const arrivals = players.flatMap((player) => {
    const value = arrivalTime(player);
    return value === null ? [] : [value];
  }).sort((left, right) => left - right);
  const vector = [...counts, -arrivals.length, ...arrivals];
  while (vector.length < players.length * 2 + 1) vector.push(Number.POSITIVE_INFINITY);
  return vector;
}

/** Unconstrained lower bound: best possible count vector, then arrival priority among tied counts. */
function globalFairnessLowerBound(available: readonly ActiveMatchmakerV3Player[], required: number): number[] | null {
  if (!Number.isInteger(required) || required < 0 || required > available.length) return null;
  const ordered = [...available].sort((left, right) =>
    effectiveCount(left) - effectiveCount(right) || left.userId.localeCompare(right.userId));
  const selected = ordered.slice(0, required);
  if (required === 0) return fairnessVector(selected);
  const cutoff = effectiveCount(ordered[required - 1]);
  const fixed = ordered.filter((player) => effectiveCount(player) < cutoff);
  const tied = ordered.filter((player) => effectiveCount(player) === cutoff);
  const neededFromTie = required - fixed.length;
  const bestArrivalTie = tied.sort((left, right) => {
    const leftArrival = arrivalTime(left);
    const rightArrival = arrivalTime(right);
    if (leftArrival === null || rightArrival === null) return Number(leftArrival === null) - Number(rightArrival === null);
    return leftArrival - rightArrival || left.userId.localeCompare(right.userId);
  }).slice(0, neededFromTie);
  return fairnessVector([...fixed, ...bestArrivalTie]);
}

function idealRestGap(rotationPlayerCount: number): number {
  return Math.max(0, Math.ceil((Math.max(0, rotationPlayerCount) - 4) / 4));
}

function starvationVector(
  selected: readonly ActiveMatchmakerV3Player[],
  available: readonly ActiveMatchmakerV3Player[],
  cutoff: number
): number[] {
  const selectedIds = new Set(selected.map((player) => player.userId));
  const leftOut = available.filter((player) => (player.restTurns ?? 0) > cutoff && !selectedIds.has(player.userId));
  return [leftOut.length, leftOut.length ? Math.max(...leftOut.map((player) => player.restTurns ?? 0)) : 0,
    leftOut.reduce((sum, player) => sum + (player.restTurns ?? 0), 0)];
}

function exactSelectionMetrics(
  selected: readonly SocialGeneralizationSelectedCourt[],
  availableById: ReadonlyMap<string, ActiveMatchmakerV3Player>,
  catalog: InternalCatalog,
  windows: ReadonlyMap<string, readonly MatchTypeOrUnknown[]>,
  seenPairs: ReadonlySet<string>
): { valid: boolean; players: ActiveMatchmakerV3Player[]; gain: number; typeGain: bigint } {
  const players: ActiveMatchmakerV3Player[] = [];
  const used = new Set<string>();
  let gain = 0;
  let typeGain = BigInt(0);
  for (const court of selected) {
    const ids = validIds(court.partition);
    if (!ids || court.ids.length !== 4 || new Set(court.ids).size !== 4 ||
        [...ids].sort().join("\u0000") !== [...court.ids].sort().join("\u0000")) {
      return { valid: false, players: [], gain: 0, typeGain: BigInt(0) };
    }
    if (typeForSides(ids, court.partition.team1, catalog.sideByUserId) === null) {
      return { valid: false, players: [], gain: 0, typeGain: BigInt(0) };
    }
    for (const id of ids) {
      if (used.has(id) || !availableById.has(id)) return { valid: false, players: [], gain: 0, typeGain: BigInt(0) };
      used.add(id);
      players.push(availableById.get(id)!);
    }
    gain += newCourtmateGain(ids, catalog, seenPairs);
    typeGain += signedTypeGain(court.partition, catalog, windows);
  }
  return { valid: true, players, gain, typeGain };
}

function courtSignature(choice: Pick<CourtChoice, "ids" | "partition">): string {
  const teams = [
    [...choice.partition.team1].sort().join("\u0000"),
    [...choice.partition.team2].sort().join("\u0000"),
  ].sort();
  return `${[...choice.ids].sort().join("\u0001")}\u0002${teams.join("\u0003")}`;
}

function selectionSignature(choices: readonly Pick<CourtChoice, "ids" | "partition">[]): string {
  return choices.map(courtSignature).sort().join("\u0004");
}

function typeWindowWitnesses(
  choices: readonly Pick<CourtChoice, "ids" | "partition">[],
  catalog: InternalCatalog,
  windows: ReadonlyMap<string, readonly MatchTypeOrUnknown[]>
): SocialGeneralizationTypeWindowWitness[] {
  const witnesses: SocialGeneralizationTypeWindowWitness[] = [];
  for (const choice of choices) {
    const ids = validIds(choice.partition) ?? [];
    const type = typeForSides(ids, choice.partition.team1, catalog.sideByUserId);
    for (const userId of ids) {
      const feasible = [...(catalog.feasibleTypesByUserId.get(userId) ?? [])].sort();
      const before = [...(windows.get(userId) ?? [])];
      const after = [...before, type];
      if (after.length > WINDOW_SIZE) after.shift();
      witnesses.push({
        userId,
        feasibleTypes: feasible,
        recentTypesBefore: before,
        recentTypesAfter: after,
        TBefore: feasible.length ? coveredTypes(before, new Set(feasible)) / feasible.length : null,
        TAfter: feasible.length ? coveredTypes(after, new Set(feasible)) / feasible.length : null,
      });
    }
  }
  return witnesses.sort((left, right) => left.userId.localeCompare(right.userId));
}

function fullTypePlayerCountAfter(
  choices: readonly Pick<CourtChoice, "ids" | "partition">[],
  catalog: InternalCatalog,
  windows: ReadonlyMap<string, readonly MatchTypeOrUnknown[]>
): number {
  const assignedType = new Map<string, MatchTypeOrUnknown>();
  for (const choice of choices) {
    const ids = validIds(choice.partition) ?? [];
    const type = typeForSides(ids, choice.partition.team1, catalog.sideByUserId);
    for (const userId of ids) assignedType.set(userId, type);
  }
  let fullCount = 0;
  for (const [userId, feasible] of catalog.feasibleTypesByUserId) {
    if (!feasible.size) continue;
    const current = windows.get(userId) ?? [];
    const nextType = assignedType.get(userId);
    const after = nextType === undefined ? current : [...current, nextType].slice(-WINDOW_SIZE);
    if (coveredTypes(after, feasible) === feasible.size) fullCount += 1;
  }
  return fullCount;
}

function bothTypePlayerCountAfter(
  choices: readonly Pick<CourtChoice, "ids" | "partition">[],
  catalog: InternalCatalog,
  windows: ReadonlyMap<string, readonly MatchTypeOrUnknown[]>
): number {
  const assignedType = new Map<string, MatchTypeOrUnknown>();
  for (const choice of choices) {
    const ids = validIds(choice.partition) ?? [];
    const type = typeForSides(ids, choice.partition.team1, catalog.sideByUserId);
    for (const userId of ids) assignedType.set(userId, type);
  }
  let count = 0;
  for (const [userId, feasible] of catalog.feasibleTypesByUserId) {
    if (feasible.size !== 2) continue;
    const current = windows.get(userId) ?? [];
    const nextType = assignedType.get(userId);
    const after = nextType === undefined ? current : [...current, nextType].slice(-WINDOW_SIZE);
    if (coveredTypes(after, feasible) === 2) count += 1;
  }
  return count;
}

function publicSelectionWitness(
  choices: readonly Pick<CourtChoice, "ids" | "partition">[],
  signedTypeGainUnits: bigint,
  catalog: InternalCatalog,
  windows: ReadonlyMap<string, readonly MatchTypeOrUnknown[]>
): SocialGeneralizationTypeWindowSelectionWitness {
  return {
    courts: choices.map((choice) => ({
      ids: [...choice.ids],
      partition: {
        team1: [...choice.partition.team1] as [string, string],
        team2: [...choice.partition.team2] as [string, string],
      },
    })),
    signedRollingTypeGainUnits: signedTypeGainUnits.toString(),
    fullTypePlayerCount: fullTypePlayerCountAfter(choices, catalog, windows),
    bothTypePlayerCount: bothTypePlayerCountAfter(choices, catalog, windows),
    players: typeWindowWitnesses(choices, catalog, windows),
  };
}

/**
 * Exhaustively proves only the stronger fairness/starvation class and the
 * courtmate/T frontier required by the beneficial-rescue guard. It deliberately
 * omits lower-priority relationship, replay, cadence, and entropy ranking.
 */
export function auditSocialGeneralizationDecision(
  input: SocialGeneralizationDecisionAuditInput
): SocialGeneralizationDecisionAudit {
  const roster = input.structuralRoster as readonly SocialGeneralizationRosterPlayer[];
  const active = [...input.availablePlayers]
    .filter((player) => !player.isBusy && !player.isPaused)
    .sort((left, right) => left.userId.localeCompare(right.userId));
  const availableById = new Map(active.map((player) => [player.userId, player]));
  const catalog = makeCatalog(roster);
  const windows = historyTypeWindows(roster, input.completedHistory, catalog.sideByUserId);
  const seenPairs = courtmateHistory(input.completedHistory);
  const respectStarvation = input.respectStarvation !== false;
  const activeRosterCount = input.rotationPlayerCount ?? roster.filter((player) => !player.isPaused).length;
  const cutoff = idealRestGap(activeRosterCount);
  const selectedMetrics = exactSelectionMetrics(input.selected, availableById, catalog, windows, seenPairs);
  const selectedValid = input.selected.length === input.courtCount && selectedMetrics.valid;
  const selectedFairness = selectedValid ? fairnessVector(selectedMetrics.players) : null;
  const selectedStarvation = selectedValid ? starvationVector(selectedMetrics.players, active, cutoff) : null;
  const theoreticalFairness = globalFairnessLowerBound(active, input.courtCount * 4);
  const maxBatches = Math.max(1, Math.floor(input.maxBatches ?? DEFAULT_MAX_BATCHES));
  const maxSearchNodes = Math.max(1, Math.floor(input.maxSearchNodes ?? DEFAULT_MAX_SEARCH_NODES));
  const required = input.courtCount * 4;

  let searchNodes = 0;
  let visitedBatches = 0;
  let strongestClassBatchCount = 0;
  let searchLimit: "search-node-limit" | "batch-limit" | null = null;
  let bestFairness: number[] | null = null;
  let bestStarvation: number[] | null = null;
  let gMax: number | null = null;
  let tMaxAtGmax: bigint | null = null;
  let bestGmaxChoices: CourtChoice[] | null = null;
  const optionByQuartet = new Map<string, CourtChoice[]>();

  if (!Number.isInteger(input.courtCount) || input.courtCount < 1 || required > active.length ||
      new Set(roster.map((player) => player.userId)).size !== roster.length ||
      new Set(active.map((player) => player.userId)).size !== active.length) {
    searchLimit = null;
  } else {
    const playerIndex = new Map(active.map((player, index) => [player.userId, index]));
    forEachCombination(active, 4, (quartet) => {
      const ids = quartet.map((player) => player.userId);
      const quartetKey = [...ids].sort().join("\u0000");
      const options: CourtChoice[] = [];
      const [a, b, c, d] = ids;
      const partitions: V3DoublesPartition[] = [
        { team1: [a, b], team2: [c, d] },
        { team1: [a, c], team2: [b, d] },
        { team1: [a, d], team2: [b, c] },
      ];
      for (const partition of partitions) {
        if (typeForSides(ids, partition.team1, catalog.sideByUserId) === null) continue;
        let mask = BigInt(0);
        for (const id of ids) mask |= BigInt(1) << BigInt(playerIndex.get(id)!);
        options.push({
          ids,
          partition,
          mask,
          courtmateGain: newCourtmateGain(ids, catalog, seenPairs),
          signedTypeGainUnits: signedTypeGain(partition, catalog, windows),
        });
      }
      if (options.length) optionByQuartet.set(quartetKey, options);
    });

    let hardStop = false;
    forEachCombination(active, required, (subset) => {
      if (hardStop) return;
      if (++searchNodes > maxSearchNodes) {
        searchLimit = "search-node-limit";
        hardStop = true;
        return;
      }
      const subsetFairness = fairnessVector(subset);
      const fairnessOrder = bestFairness ? compareVectors(subsetFairness, bestFairness) : -1;
      if (fairnessOrder > 0) return;
      const subsetStarvation = starvationVector(subset, active, cutoff);
      const starvationOrder = bestStarvation ? compareVectors(subsetStarvation, bestStarvation) : -1;
      if (fairnessOrder === 0 && respectStarvation && starvationOrder > 0) return;
      const classBetter = bestFairness === null || fairnessOrder < 0 ||
        (fairnessOrder === 0 && respectStarvation && bestStarvation !== null && starvationOrder < 0);
      let hasLegalBatch = false;
      const chosen: CourtChoice[] = [];
      const decompose = (remaining: readonly ActiveMatchmakerV3Player[]) => {
        if (hardStop) return;
        if (remaining.length === 0) {
          if (++visitedBatches > maxBatches) {
            searchLimit = "batch-limit";
            hardStop = true;
            return;
          }
          if (classBetter && !hasLegalBatch) {
            bestFairness = subsetFairness;
            bestStarvation = subsetStarvation;
            gMax = null;
            tMaxAtGmax = null;
            bestGmaxChoices = null;
            strongestClassBatchCount = 0;
          }
          hasLegalBatch = true;
          strongestClassBatchCount += 1;
          const gain = chosen.reduce((sum, choice) => sum + choice.courtmateGain, 0);
          const typeGain = chosen.reduce((sum, choice) => sum + choice.signedTypeGainUnits, BigInt(0));
          if (gMax === null || gain > gMax) {
            gMax = gain;
            tMaxAtGmax = typeGain;
            bestGmaxChoices = [...chosen];
          } else if (gain === gMax && (tMaxAtGmax === null || typeGain > tMaxAtGmax)) {
            tMaxAtGmax = typeGain;
            bestGmaxChoices = [...chosen];
          } else if (gain === gMax && typeGain === tMaxAtGmax && bestGmaxChoices &&
              selectionSignature(chosen).localeCompare(selectionSignature(bestGmaxChoices)) < 0) {
            bestGmaxChoices = [...chosen];
          }
          return;
        }
        if (++searchNodes > maxSearchNodes) {
          searchLimit = "search-node-limit";
          hardStop = true;
          return;
        }
        const anchor = remaining[0];
        forEachCombination(remaining.slice(1), 3, (tail) => {
          if (hardStop) return;
          const ids = [anchor.userId, ...tail.map((player) => player.userId)];
          const choices = optionByQuartet.get([...ids].sort().join("\u0000"));
          if (!choices?.length) return;
          const chosenIds = new Set(ids);
          const nextRemaining = remaining.filter((player) => !chosenIds.has(player.userId));
          for (const choice of choices) {
            if (hardStop) return;
            if (++searchNodes > maxSearchNodes) {
              searchLimit = "search-node-limit";
              hardStop = true;
              return;
            }
            chosen.push(choice);
            decompose(nextRemaining);
            chosen.pop();
          }
        });
      };
      decompose(subset);
    });
  }

  const complete = searchLimit === null;
  const noLegalBatch = complete && gMax === null;
  const fairnessByExhaustion = Boolean(complete && selectedValid && bestFairness && selectedFairness &&
    compareVectors(selectedFairness, bestFairness) === 0);
  const fairnessByLowerBound = Boolean(selectedValid && selectedFairness && theoreticalFairness &&
    compareVectors(selectedFairness, theoreticalFairness) === 0);
  const selectedFairnessCertified = fairnessByExhaustion || fairnessByLowerBound;
  const starvationByExhaustion = Boolean(fairnessByExhaustion && selectedValid &&
    (!respectStarvation || (bestStarvation && selectedStarvation && compareVectors(selectedStarvation, bestStarvation) === 0)));
  const starvationByLowerBound = Boolean(fairnessByLowerBound && selectedValid &&
    (!respectStarvation || (selectedStarvation && selectedStarvation.every((value) => value === 0))));
  const selectedStarvationCertified = starvationByExhaustion || starvationByLowerBound;
  const selectedBenefitUnits = tMaxAtGmax === null ? null : selectedMetrics.typeGain - tMaxAtGmax;
  const beneficialRescueAdmitted = Boolean(complete && selectedFairnessCertified && selectedStarvationCertified &&
    selectedMetrics.valid && gMax !== null && tMaxAtGmax !== null &&
    (selectedMetrics.gain === gMax ||
      (selectedMetrics.gain === gMax - 1 && selectedMetrics.typeGain > tMaxAtGmax)));
  const denominator = catalog.rollingTypeDenominator;
  const typeEligiblePlayerCount = [...catalog.feasibleTypesByUserId.values()].filter((types) => types.size > 0).length;
  const baselineFullTypePlayerCount = fullTypePlayerCountAfter([], catalog, windows);
  const baselineBothTypePlayerCount = bothTypePlayerCountAfter([], catalog, windows);
  const normalized = (units: bigint | null) => units === null ? null
    : denominator === BigInt(0) ? 0 : Number(units) / Number(denominator);
  const selectedChoices = selectedValid ? input.selected.map((court) => ({ ids: [...court.ids], partition: court.partition })) : null;
  const selectedTypeWindows = selectedChoices ? typeWindowWitnesses(selectedChoices, catalog, windows) : null;
  const selectedFullTypePlayerCount = selectedChoices
    ? fullTypePlayerCountAfter(selectedChoices, catalog, windows)
    : null;
  const selectedBothTypePlayerCount = selectedChoices
    ? bothTypePlayerCountAfter(selectedChoices, catalog, windows)
    : null;
  const finalGMax = gMax as number | null;
  const finalTMaxAtGmax = tMaxAtGmax as bigint | null;
  const finalBestGmaxChoices = bestGmaxChoices as CourtChoice[] | null;
  const bestGmaxWitness = complete && finalBestGmaxChoices && finalTMaxAtGmax !== null
    ? publicSelectionWitness(finalBestGmaxChoices, finalTMaxAtGmax, catalog, windows)
    : null;

  return {
    status: searchLimit ? "incomplete" : noLegalBatch ? "no-legal-batch" : "certified",
    complete,
    reason: searchLimit ?? (noLegalBatch ? "no-legal-batch" : null),
    searchNodes,
    visitedBatches,
    strongestClassBatchCount,
    idealRestGap: cutoff,
    rollingTypeDenominator: denominator.toString(),
    typeEligiblePlayerCount,
    baselineFullTypePlayerCount,
    baselineBothTypePlayerCount,
    selectedValid,
    selectedFairnessCertified,
    selectedFairnessCertificate: fairnessByExhaustion ? "exhaustive" : fairnessByLowerBound ? "global-lower-bound" : "none",
    selectedStarvationCertified,
    selectedStarvationCertificate: starvationByExhaustion ? "exhaustive"
      : starvationByLowerBound ? "zero-starvation-lower-bound" : "none",
    selectedCourtmateGain: selectedValid ? selectedMetrics.gain : null,
    courtmateGainMaximum: complete ? finalGMax : null,
    selectedSignedRollingTypeGainUnits: selectedValid ? selectedMetrics.typeGain.toString() : null,
    selectedSignedRollingTypeGain: selectedValid ? normalized(selectedMetrics.typeGain) : null,
    selectedFullTypePlayerCount,
    selectedBothTypePlayerCount,
    selectedTypeWindows,
    bestSignedRollingTypeGainAtGmaxUnits: complete ? finalTMaxAtGmax?.toString() ?? null : null,
    bestSignedRollingTypeGainAtGmax: complete ? normalized(finalTMaxAtGmax) : null,
    bestGmaxWitness,
    beneficialRescueAdmitted,
    onePairConditionalTypeBenefitUnits: selectedMetrics.valid && selectedMetrics.gain === (gMax ?? Number.NaN) - 1 && complete
      ? selectedBenefitUnits?.toString() ?? null
      : null,
  };
}

function addCount(target: Map<string, number>, key: string) {
  target.set(key, (target.get(key) ?? 0) + 1);
}

function normalizedEntropy(counts: ReadonlyMap<string, number>, opportunityCount: number): number | null {
  if (opportunityCount < 2) return null;
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (total <= 0) return 0;
  let entropy = 0;
  for (const count of counts.values()) {
    if (count <= 0) continue;
    const probability = count / total;
    entropy -= probability * Math.log(probability);
  }
  return entropy / Math.log(opportunityCount);
}

function scoreRosterPrefix(
  roster: readonly SocialGeneralizationRosterPlayer[],
  completedHistory: readonly SocialHistoryMatch[]
): SocialGeneralizationPrefixScore {
  const catalog = makeCatalog(roster);
  const windows = historyTypeWindows(roster, completedHistory, catalog.sideByUserId);
  const exposures = new Map<string, Record<RelationshipFacet, Map<string, number>>>(
    roster.map((player) => [player.userId, {
      courtmates: new Map(), partners: new Map(), opponents: new Map(),
    }])
  );
  const completedTypeCounts: Record<GeneralizationMatchType, number> = { MIXED: 0, OWN_SIDE: 0 };
  const singleTypeRuns = new Map(roster.map((player) => [player.userId, { type: null as MatchTypeOrUnknown, run: 0, maximum: 0 }]));
  for (const match of orderedUniqueHistory(completedHistory)) {
    const ids = validIds(match);
    if (!ids) continue;
    const matchType = historyMatchType(match, catalog.sideByUserId);
    if (matchType) completedTypeCounts[matchType] += 1;
    for (const id of ids) {
      const state = singleTypeRuns.get(id);
      if (!state) continue;
      if (matchType !== null && state.type === matchType) state.run += 1;
      else {
        state.type = matchType;
        state.run = matchType === null ? 0 : 1;
      }
      state.maximum = Math.max(state.maximum, state.run);
    }
    for (let left = 0; left < ids.length; left += 1) {
      for (let right = left + 1; right < ids.length; right += 1) {
        const first = ids[left];
        const second = ids[right];
        if (catalog.opportunitiesByFacet.get(facetKey("courtmates", first))?.has(second)) {
          addCount(exposures.get(first)?.courtmates ?? new Map(), second);
          addCount(exposures.get(second)?.courtmates ?? new Map(), first);
        }
      }
    }
    for (const team of [match.team1, match.team2]) {
      const [left, right] = team;
      if (catalog.opportunitiesByFacet.get(facetKey("partners", left))?.has(right)) {
        addCount(exposures.get(left)?.partners ?? new Map(), right);
        addCount(exposures.get(right)?.partners ?? new Map(), left);
      }
    }
    for (const left of match.team1) for (const right of match.team2) {
      if (catalog.opportunitiesByFacet.get(facetKey("opponents", left))?.has(right)) {
        addCount(exposures.get(left)?.opponents ?? new Map(), right);
        addCount(exposures.get(right)?.opponents ?? new Map(), left);
      }
    }
  }

  const perPlayer: SocialGeneralizationPlayerPrefixScore[] = roster.map((player) => {
    const userId = player.userId;
    const counts = exposures.get(userId)!;
    const opportunities = Object.fromEntries(FACETS.map((facet) => [
      facet,
      catalog.opportunitiesByFacet.get(facetKey(facet, userId)) ?? new Set<string>(),
    ])) as Record<RelationshipFacet, ReadonlySet<string>>;
    const distinct = Object.fromEntries(FACETS.map((facet) => [
      facet,
      [...opportunities[facet]].filter((peer) => (counts[facet].get(peer) ?? 0) > 0).length,
    ])) as Record<RelationshipFacet, number>;
    const feasibleTypes = [...(catalog.feasibleTypesByUserId.get(userId) ?? [])].sort();
    const recent = windows.get(userId) ?? [];
    const T = feasibleTypes.length ? coveredTypes(recent, new Set(feasibleTypes)) / feasibleTypes.length : null;
    return {
      userId,
      feasibleCourtmates: opportunities.courtmates.size,
      distinctCourtmates: distinct.courtmates,
      courtmateCoverage: opportunities.courtmates.size ? distinct.courtmates / opportunities.courtmates.size : null,
      feasiblePartners: opportunities.partners.size,
      distinctPartners: distinct.partners,
      partnerCoverage: opportunities.partners.size ? distinct.partners / opportunities.partners.size : null,
      feasibleOpponents: opportunities.opponents.size,
      distinctOpponents: distinct.opponents,
      opponentCoverage: opportunities.opponents.size ? distinct.opponents / opportunities.opponents.size : null,
      feasibleMatchTypes: feasibleTypes,
      recentMatchTypes: [...recent],
      T,
    };
  });

  const summarizeFacet = (facet: RelationshipFacet): SocialGeneralizationFacetScore => {
    const eligible = perPlayer.filter((player) => {
      const size = facet === "courtmates" ? player.feasibleCourtmates
        : facet === "partners" ? player.feasiblePartners : player.feasibleOpponents;
      return size > 0;
    });
    const values = eligible.map((player) => ({
      userId: player.userId,
      possible: facet === "courtmates" ? player.feasibleCourtmates
        : facet === "partners" ? player.feasiblePartners : player.feasibleOpponents,
      covered: facet === "courtmates" ? player.distinctCourtmates
        : facet === "partners" ? player.distinctPartners : player.distinctOpponents,
    }));
    const opportunitiesByPlayer = catalog.opportunitiesByFacet;
    const coveredPairs = new Set<string>();
    const feasiblePairs = new Set<string>();
    for (const [key, peerSet] of opportunitiesByPlayer) {
      if (!key.startsWith(`${facet}\u0001`)) continue;
      const userId = key.slice(facet.length + 1);
      for (const peer of peerSet) {
        feasiblePairs.add(pairKey(userId, peer));
        if ((exposures.get(userId)?.[facet].get(peer) ?? 0) > 0) coveredPairs.add(pairKey(userId, peer));
      }
    }
    const entropies = values.map(({ userId, possible }) => normalizedEntropy(exposures.get(userId)![facet], possible))
      .filter((value): value is number => value !== null);
    return {
      averageDistinctPeers: values.length ? values.reduce((sum, player) => sum + player.covered, 0) / values.length : null,
      minimumDistinctPeers: values.length ? Math.min(...values.map((player) => player.covered)) : null,
      meanCoverage: values.length ? values.reduce((sum, player) => sum + player.covered / player.possible, 0) / values.length : null,
      worstPlayerCoverage: values.length ? Math.min(...values.map((player) => player.covered / player.possible)) : null,
      fullyCoveredPlayerCount: values.filter((player) => player.covered === player.possible).length,
      feasiblePairCount: feasiblePairs.size,
      coveredPairCount: coveredPairs.size,
      meanNormalizedEntropy: entropies.length ? entropies.reduce((sum, value) => sum + value, 0) / entropies.length : null,
    };
  };

  const typePlayers = perPlayer.filter((player) => player.feasibleMatchTypes.length > 0);
  const TValues = typePlayers.map((player) => player.T ?? 0);
  const typeCounts: Record<GeneralizationMatchType, number> = { MIXED: 0, OWN_SIDE: 0 };
  for (const player of perPlayer) for (const type of player.feasibleMatchTypes) typeCounts[type] += 1;
  return {
    playerCount: roster.length,
    courtmates: summarizeFacet("courtmates"),
    partners: summarizeFacet("partners"),
    opponents: summarizeFacet("opponents"),
    meanT: TValues.length ? TValues.reduce((sum, value) => sum + value, 0) / TValues.length : null,
    fullTypeCoverageFraction: TValues.length ? TValues.filter((value) => value === 1).length / TValues.length : null,
    halfTypeCoverageFraction: TValues.length ? TValues.filter((value) => value === 0.5).length / TValues.length : null,
    typeEligiblePlayerCount: typePlayers.length,
    oneTypePlayerCount: typePlayers.filter((player) => player.feasibleMatchTypes.length === 1).length,
    feasibleTypePlayerCounts: typeCounts,
    completedMatchTypeCounts: completedTypeCounts,
    longestSingleTypeAppearanceRun: Math.max(0, ...[...singleTypeRuns.values()].map((state) => state.maximum)),
    players: perPlayer,
  };
}

/** Independent C/P/O, entropy, and rolling-T endpoint score for current and full structural rosters. */
export function scoreSocialGeneralizationPrefix(input: SocialGeneralizationPrefixInput): SocialGeneralizationPrefixResult {
  const structuralRoster = input.structuralRoster as readonly SocialGeneralizationRosterPlayer[];
  return {
    structural: scoreRosterPrefix(structuralRoster, input.completedHistory),
    opportunity: input.opportunityRoster
      ? scoreRosterPrefix(input.opportunityRoster as readonly SocialGeneralizationRosterPlayer[], input.completedHistory)
      : null,
  };
}
