import { describe, expect, it } from "vitest";
import { SessionMode, SessionType } from "../../../types/enums";
import { buildActivePlayers } from "./fairness";
import { findBestRotationBatchSelection, isCourtmateBeneficialRescueAdmissible } from "./socialBatch";
import { createSocialCourtmatePriorityScorer } from "./socialCourtmatePriority";
import { buildSocialStructuralVarietyContext, getSocialVarietyGains } from "./socialVariety";
import type { SocialVarietyContext } from "./socialVariety";
import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  SocialHistoryMatch,
  V3DoublesPartition,
  V3SelectionConstraints,
} from "./types";

type Club = "A" | "B";
type Side = "UPPER" | "LOWER";
type MatchType = "MIXED" | "OWN_SIDE";
type Facet = "courtmates" | "partners" | "opponents" | "matchType";

interface InterclubPlayer extends MatchmakerV3Player {
  representingClubId: Club;
}

type ActiveInterclubPlayer = ActiveMatchmakerV3Player<InterclubPlayer>;
type FacetSets = Record<Facet, Set<string>>;
type FacetCounts = Record<Facet, Map<string, number>>;

interface OraclePlayer {
  readonly opportunities: FacetSets;
  readonly counts: FacetCounts;
}

interface StructuralOracle {
  readonly byUserId: ReadonlyMap<string, OraclePlayer>;
  readonly legalPartitions: readonly V3DoublesPartition[];
}

const facets: readonly Facet[] = ["courtmates", "partners", "opponents", "matchType"];
const clubIds: readonly Club[] = ["A", "B"];
const epoch = new Date("2026-01-01T00:00:00.000Z");

function makePlayer(
  userId: string,
  representingClubId: Club,
  side: Side,
  availability: { isBusy?: boolean; isPaused?: boolean } = {},
  matchesPlayed = 0,
): InterclubPlayer {
  return {
    userId,
    representingClubId,
    matchesPlayed,
    matchmakingBaseline: matchesPlayed,
    availableSince: epoch,
    strength: 1000,
    gender: side === "UPPER" ? "MALE" : "FEMALE",
    mixedSideOverride: side,
    isBusy: availability.isBusy,
    isPaused: availability.isPaused,
    restTurns: 0,
  };
}

function effectiveSide(player: Pick<InterclubPlayer, "mixedSideOverride">): Side | null {
  return player.mixedSideOverride === "UPPER" || player.mixedSideOverride === "LOWER"
    ? player.mixedSideOverride
    : null;
}

function classifyType(
  partition: V3DoublesPartition,
  playersById: ReadonlyMap<string, InterclubPlayer>,
): MatchType | null {
  const teams = [partition.team1, partition.team2];
  const teamSides = teams.map((team) => team.map((id) => {
    const player = playersById.get(id);
    return player ? effectiveSide(player) : null;
  }));
  if (teamSides.flat().some((side) => side === null)) return null;
  if (teamSides.flat().every((side) => side === "UPPER") ||
    teamSides.flat().every((side) => side === "LOWER")) {
    return "OWN_SIDE";
  }
  if (teamSides.every((sides) => new Set(sides).size === 2)) return "MIXED";
  return null;
}

function interclubConstraints(): V3SelectionConstraints<ActiveInterclubPlayer> {
  return {
    isQuartetAllowed: (quartet) => clubIds.every((clubId) =>
      quartet.filter((player) => player.representingClubId === clubId).length === 2
    ),
    normalizePartition: ({ partition, playersById }) => {
      const teamClubs = [partition.team1, partition.team2].map((team) =>
        team.map((id) => playersById.get(id)?.representingClubId)
      );
      const sameClubTeams = teamClubs.every((team) =>
        team[0] !== undefined && team[0] === team[1]
      );
      if (!sameClubTeams || teamClubs[0][0] === teamClubs[1][0]) return null;
      if (teamClubs[0][0] === "A" && teamClubs[1][0] === "B") return partition;
      if (teamClubs[0][0] === "B" && teamClubs[1][0] === "A") {
        return { team1: partition.team2, team2: partition.team1 };
      }
      return null;
    },
  };
}

function emptyFacetSets(): FacetSets {
  return { courtmates: new Set(), partners: new Set(), opponents: new Set(), matchType: new Set() };
}

function emptyFacetCounts(): FacetCounts {
  return { courtmates: new Map(), partners: new Map(), opponents: new Map(), matchType: new Map() };
}

function unorderedPair(left: string, right: string): string {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

function quartetKey(ids: readonly string[]): string {
  return [...ids].sort().join("|");
}

function legalInterclubPartitions(players: readonly InterclubPlayer[]): V3DoublesPartition[] {
  const byClub = new Map<Club, InterclubPlayer[]>(clubIds.map((clubId) => [clubId, []]));
  for (const player of players) byClub.get(player.representingClubId)!.push(player);
  const aPlayers = byClub.get("A")!;
  const bPlayers = byClub.get("B")!;
  const playersById = new Map(players.map((player) => [player.userId, player]));
  const result: V3DoublesPartition[] = [];
  for (let a = 0; a < aPlayers.length - 1; a += 1) {
    for (let b = a + 1; b < aPlayers.length; b += 1) {
      for (let c = 0; c < bPlayers.length - 1; c += 1) {
        for (let d = c + 1; d < bPlayers.length; d += 1) {
          const partition: V3DoublesPartition = {
            team1: [aPlayers[a].userId, aPlayers[b].userId],
            team2: [bPlayers[c].userId, bPlayers[d].userId],
          };
          // Interclub normalization fixes each club as one team. MIXICANO
          // permits both teams mixed or both teams same-side, but not HYBRID.
          if (classifyType(partition, playersById)) {
            result.push(partition);
          }
        }
      }
    }
  }
  return result;
}

function exposures(partition: V3DoublesPartition, type: MatchType | null) {
  const result: Array<{ userId: string; facet: Facet; peerId: string }> = [];
  for (let teamIndex = 0; teamIndex < 2; teamIndex += 1) {
    const team = teamIndex === 0 ? partition.team1 : partition.team2;
    const opponents = teamIndex === 0 ? partition.team2 : partition.team1;
    for (const userId of team) {
      const partnerId = team[0] === userId ? team[1] : team[0];
      result.push({ userId, facet: "courtmates", peerId: partnerId });
      result.push({ userId, facet: "partners", peerId: partnerId });
      for (const opponentId of opponents) {
        result.push({ userId, facet: "courtmates", peerId: opponentId });
        result.push({ userId, facet: "opponents", peerId: opponentId });
      }
      if (type) result.push({ userId, facet: "matchType", peerId: type });
    }
  }
  return result;
}

function buildIndependentOracle(
  players: readonly InterclubPlayer[],
  completedHistory: readonly SocialHistoryMatch[],
): StructuralOracle {
  const legalPartitions = legalInterclubPartitions(players);
  const byUserId = new Map<string, OraclePlayer>(players.map((player) => [player.userId, {
    opportunities: emptyFacetSets(),
    counts: emptyFacetCounts(),
  }]));
  for (const partition of legalPartitions) {
    const type = classifyType(partition, new Map(players.map((player) => [player.userId, player])));
    for (const exposure of exposures(partition, type)) {
      byUserId.get(exposure.userId)!.opportunities[exposure.facet].add(exposure.peerId);
    }
  }
  const seenIds = new Set<string>();
  const uniqueHistory = completedHistory.filter((match) => {
    if (!match.id) return true;
    if (seenIds.has(match.id)) return false;
    seenIds.add(match.id);
    return true;
  });
  for (const match of uniqueHistory) {
    const type = classifyType(match, new Map(players.map((player) => [player.userId, player])));
    for (const exposure of exposures(match, type)) {
      const player = byUserId.get(exposure.userId);
      if (!player?.opportunities[exposure.facet].has(exposure.peerId)) continue;
      const count = player.counts[exposure.facet];
      count.set(exposure.peerId, (count.get(exposure.peerId) ?? 0) + 1);
    }
  }
  return { byUserId, legalPartitions };
}

function assertContextMatchesOracle(context: SocialVarietyContext, oracle: StructuralOracle) {
  expect([...context.playersByUserId.keys()].sort()).toEqual([...oracle.byUserId.keys()].sort());
  for (const [userId, expected] of oracle.byUserId) {
    const actual = context.playersByUserId.get(userId)!;
    for (const facet of facets) {
      expect([...actual[facet].opportunities].sort()).toEqual([...expected.opportunities[facet]].sort());
      expect([...actual[facet].counts].sort(([a], [b]) => a.localeCompare(b)))
        .toEqual([...expected.counts[facet]].sort(([a], [b]) => a.localeCompare(b)));
    }
  }
}

function normalizedEntropy(counts: ReadonlyMap<string, number>, opportunityCount: number): number {
  if (opportunityCount < 2) return 0;
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (total === 0) return 0;
  let entropy = 0;
  for (const count of counts.values()) {
    if (count === 0) continue;
    const probability = count / total;
    entropy -= probability * Math.log(probability);
  }
  return entropy / Math.log(opportunityCount);
}

function independentEntropyGains(
  partition: V3DoublesPartition,
  players: readonly InterclubPlayer[],
  oracle: StructuralOracle,
): Record<Facet, number> {
  const result: Record<Facet, number> = { courtmates: 0, partners: 0, opponents: 0, matchType: 0 };
  const type = classifyType(partition, new Map(players.map((player) => [player.userId, player])));
  const added = new Map<string, Partial<Record<Facet, Map<string, number>>>>();
  for (const exposure of exposures(partition, type)) {
    const player = oracle.byUserId.get(exposure.userId);
    if (!player?.opportunities[exposure.facet].has(exposure.peerId)) continue;
    let facetsByName = added.get(exposure.userId);
    if (!facetsByName) {
      facetsByName = {};
      added.set(exposure.userId, facetsByName);
    }
    const facetCounts = facetsByName[exposure.facet] ?? new Map<string, number>();
    facetCounts.set(exposure.peerId, (facetCounts.get(exposure.peerId) ?? 0) + 1);
    facetsByName[exposure.facet] = facetCounts;
  }
  for (const [userId, facetsByName] of added) {
    const player = oracle.byUserId.get(userId)!;
    for (const facet of facets) {
      const additions = facetsByName[facet];
      if (!additions) continue;
      const next = new Map(player.counts[facet]);
      for (const [experience, count] of additions) {
        next.set(experience, (next.get(experience) ?? 0) + count);
      }
      result[facet] += normalizedEntropy(next, player.opportunities[facet].size) -
        normalizedEntropy(player.counts[facet], player.opportunities[facet].size);
    }
  }
  return result;
}

function independentPriorityMetrics(
  partition: V3DoublesPartition,
  players: readonly InterclubPlayer[],
  history: readonly SocialHistoryMatch[],
  oracle: StructuralOracle,
): { G: number; P: number; O: number; rollingUnits: bigint; rollingDenominator: bigint } {
  const byId = new Map(players.map((player) => [player.userId, player]));
  const oldPairs = new Set<string>();
  for (const match of history) {
    for (const item of exposures(match, classifyType(match, byId))) {
      if (item.facet !== "matchType") oldPairs.add(`${item.facet}\u0001${unorderedPair(item.userId, item.peerId)}`);
    }
  }
  let G = 0;
  let P = 0;
  let O = 0;
  for (const item of exposures(partition, classifyType(partition, byId))) {
    if (item.facet === "matchType") continue;
    if (!oracle.byUserId.get(item.userId)?.opportunities[item.facet].has(item.peerId)) continue;
    const key = `${item.facet}\u0001${unorderedPair(item.userId, item.peerId)}`;
    if (oldPairs.has(key)) continue;
    // Every undirected pair appears twice in the directed exposure list.
    oldPairs.add(key);
    if (item.facet === "courtmates") G += 1;
    else if (item.facet === "partners") P += 1;
    else O += 1;
  }

  const typeSets = new Map([...oracle.byUserId].map(([userId, player]) => [
    userId,
    player.opportunities.matchType as ReadonlySet<string>,
  ]));
  const eligibleTypeSizes = [...typeSets.values()].filter((types) => types.size > 0).map((types) => types.size);
  const gcd = (a: bigint, b: bigint): bigint => {
    while (b !== BigInt(0)) [a, b] = [b, a % b];
    return a;
  };
  const lcm = (a: bigint, b: bigint) => a === BigInt(0) || b === BigInt(0) ? BigInt(0) : (a / gcd(a, b)) * b;
  const rollingDenominator = eligibleTypeSizes.reduce((value, size) => lcm(value, BigInt(size)), BigInt(1));
  let rollingUnits = BigInt(0);
  const candidateType = classifyType(partition, byId);
  for (const userId of [...partition.team1, ...partition.team2]) {
    const feasible = typeSets.get(userId) ?? new Set<string>();
    if (feasible.size === 0) continue;
    const previous = history.filter((match) =>
      match.team1.includes(userId) || match.team2.includes(userId)
    ).map((match) => classifyType(match, byId)).slice(-6);
    const coveredBefore = new Set(previous.filter((type): type is MatchType => type !== null && feasible.has(type))).size;
    const next = [...previous, candidateType].slice(-6);
    const coveredAfter = new Set(next.filter((type): type is MatchType => type !== null && feasible.has(type))).size;
    rollingUnits += BigInt(coveredAfter - coveredBefore) *
      (rollingDenominator / BigInt(feasible.size));
  }
  return { G, P, O, rollingUnits, rollingDenominator };
}

function rescueFixture(includeMixedHistory: boolean) {
  const players: InterclubPlayer[] = [
    // The full-gain quartet is four upper-side players, with no historical
    // pair among them. Each has already seen OWN_SIDE.
    makePlayer("FA1", "A", "UPPER", {}, 2),
    makePlayer("FA2", "A", "UPPER", {}, 2),
    makePlayer("FB1", "B", "UPPER", {}, 2),
    makePlayer("FB2", "B", "UPPER", {}, 2),
    // The one-pair rescue quartet has one upper and one lower member per club.
    makePlayer("LAU", "A", "UPPER", {}, 2),
    makePlayer("LAL", "A", "LOWER", {}, 2),
    makePlayer("LBU", "B", "UPPER", {}, 2),
    makePlayer("LBL", "B", "LOWER", {}, 2),
    // Support players are structurally present but unavailable: half represent
    // a current reservation/busy player and half are paused.
    makePlayer("AU1", "A", "UPPER", { isBusy: true }),
    makePlayer("AU2", "A", "UPPER", { isPaused: true }),
    makePlayer("AL1", "A", "LOWER", { isBusy: true }),
    makePlayer("AL2", "A", "LOWER", { isPaused: true }),
    makePlayer("BU1", "B", "UPPER", { isBusy: true }),
    makePlayer("BU2", "B", "UPPER", { isPaused: true }),
    makePlayer("BL1", "B", "LOWER", { isBusy: true }),
    makePlayer("BL2", "B", "LOWER", { isPaused: true }),
  ];
  // Explicit same-club partner teams and cross-club opponent teams. All
  // completed examples are legal Interclub OWN_SIDE games.
  const history: SocialHistoryMatch[] = [
    { id: "FA1-own", team1: ["FA1", "AU1"], team2: ["BU1", "BU2"] },
    { id: "FA2-own", team1: ["FA2", "AU2"], team2: ["BU1", "BU2"] },
    { id: "FB1-own", team1: ["AU1", "AU2"], team2: ["FB1", "BU1"] },
    { id: "FB2-own", team1: ["AU1", "AU2"], team2: ["FB2", "BU2"] },
    // This legal own-side court creates exactly one old pair in the rescue
    // quartet: LAU and LBU meet as opponents, while the other pairs stay new.
    { id: "LAU-LBU-own", team1: ["LAU", "AU1"], team2: ["LBU", "BU1"] },
    { id: "LAL-own", team1: ["LAL", "AL1"], team2: ["BL1", "BL2"] },
    { id: "LBL-own", team1: ["AL1", "AL2"], team2: ["LBL", "BL1"] },
  ];
  if (includeMixedHistory) {
    history.push(
      { id: "LAU-mixed", team1: ["LAU", "AL1"], team2: ["BU1", "BL1"] },
      { id: "LAL-mixed", team1: ["LAL", "AU1"], team2: ["BU1", "BL1"] },
      { id: "LBU-mixed", team1: ["AU1", "AL1"], team2: ["LBU", "BL1"] },
      { id: "LBL-mixed", team1: ["AU1", "AL1"], team2: ["LBL", "BU1"] },
    );
  }
  const fullGain: V3DoublesPartition = { team1: ["FA1", "FA2"], team2: ["FB1", "FB2"] };
  const rescue: V3DoublesPartition = { team1: ["LAU", "LAL"], team2: ["LBU", "LBL"] };
  return { players, history, fullGain, rescue };
}

describe("Interclub structural Social opportunity context", () => {
  it("matches an independent enumeration of same-club partners and cross-club opponents from completed-only history", () => {
    const players: InterclubPlayer[] = [
      makePlayer("AU1", "A", "UPPER"),
      makePlayer("AL1", "A", "LOWER"),
      makePlayer("AL2", "A", "LOWER", { isBusy: true }),
      makePlayer("AL3", "A", "LOWER"),
      makePlayer("BU1", "B", "UPPER"),
      makePlayer("BU2", "B", "UPPER"),
      makePlayer("BU3", "B", "UPPER", { isPaused: true }),
      makePlayer("BL1", "B", "LOWER"),
    ];
    const completed: SocialHistoryMatch[] = [
      { id: "completed-mixed", team1: ["AU1", "AL1"], team2: ["BU1", "BL1"] },
    ];
    const oracle = buildIndependentOracle(players, completed);
    const context = buildSocialStructuralVarietyContext(players, completed, {
      sessionMode: SessionMode.MIXICANO,
      opportunityConstraints: [interclubConstraints()],
    });
    expect(oracle.legalPartitions).toHaveLength(9);
    expect(context.playersByUserId.size).toBe(players.length);
    expect(context.playersByUserId.has("AL2")).toBe(true);
    expect(context.playersByUserId.has("BU3")).toBe(true);
    const selectableIds = new Set(buildActivePlayers(players, { randomFn: () => 0 }).map((player) => player.userId));
    expect(selectableIds.has("AL2")).toBe(false);
    expect(selectableIds.has("BU3")).toBe(false);
    assertContextMatchesOracle(context, oracle);
    expect(context.playersByUserId.get("AU1")!.partners.opportunities).toEqual(new Set(["AL1", "AL2", "AL3"]));
    expect(context.playersByUserId.get("AU1")!.opponents.opportunities).toEqual(new Set(["BU1", "BU2", "BU3", "BL1"]));
    expect(context.playersByUserId.get("AU1")!.courtmates.opportunities).toEqual(new Set([
      "AL1", "AL2", "AL3", "BU1", "BU2", "BU3", "BL1",
    ]));
    for (const player of context.playersByUserId.values()) {
      expect(player.matchType.opportunities).toEqual(new Set(["MIXED"]));
    }
  });

  it("omits structurally impossible match types per player and globally", () => {
    const onlyMixed: InterclubPlayer[] = [
      makePlayer("AU", "A", "UPPER"),
      makePlayer("AL1", "A", "LOWER"),
      makePlayer("AL2", "A", "LOWER"),
      makePlayer("AL3", "A", "LOWER"),
      makePlayer("BU1", "B", "UPPER"),
      makePlayer("BU2", "B", "UPPER"),
      makePlayer("BU3", "B", "UPPER"),
      makePlayer("BL", "B", "LOWER"),
    ];
    const mixedContext = buildSocialStructuralVarietyContext(onlyMixed, [], {
      sessionMode: SessionMode.MIXICANO,
      opportunityConstraints: [interclubConstraints()],
    });
    const mixedOracle = buildIndependentOracle(onlyMixed, []);
    assertContextMatchesOracle(mixedContext, mixedOracle);
    for (const [userId, player] of mixedContext.playersByUserId) {
      expect(player.matchType.opportunities).toEqual(new Set(["MIXED"]));
      expect(player.partners.opportunities.size).toBeGreaterThan(0);
      expect(mixedOracle.byUserId.get(userId)!.opportunities.matchType).toEqual(new Set(["MIXED"]));
    }

    const onlyOwnSide: InterclubPlayer[] = [
      makePlayer("A1", "A", "UPPER"),
      makePlayer("A2", "A", "UPPER"),
      makePlayer("B1", "B", "UPPER"),
      makePlayer("B2", "B", "UPPER"),
    ];
    const ownContext = buildSocialStructuralVarietyContext(onlyOwnSide, [], {
      sessionMode: SessionMode.MIXICANO,
      opportunityConstraints: [interclubConstraints()],
    });
    const ownOracle = buildIndependentOracle(onlyOwnSide, []);
    assertContextMatchesOracle(ownContext, ownOracle);
    for (const player of ownContext.playersByUserId.values()) {
      expect(player.matchType.opportunities).toEqual(new Set(["OWN_SIDE"]));
    }
  });

  it("matches the independent empty-history entropy values for the symmetric Interclub roster", () => {
    const players: InterclubPlayer[] = [
      makePlayer("AU1", "A", "UPPER"),
      makePlayer("AU2", "A", "UPPER"),
      makePlayer("AL1", "A", "LOWER"),
      makePlayer("AL2", "A", "LOWER"),
      makePlayer("BU1", "B", "UPPER"),
      makePlayer("BU2", "B", "UPPER"),
      makePlayer("BL1", "B", "LOWER"),
      makePlayer("BL2", "B", "LOWER"),
    ];
    const candidate: V3DoublesPartition = { team1: ["AU1", "AL1"], team2: ["BU1", "BL1"] };
    const oracle = buildIndependentOracle(players, []);
    const context = buildSocialStructuralVarietyContext(players, [], {
      sessionMode: SessionMode.MIXICANO,
      opportunityConstraints: [interclubConstraints()],
    });
    assertContextMatchesOracle(context, oracle);
    expect(oracle.legalPartitions).toHaveLength(18);

    const expected = independentEntropyGains(candidate, players, oracle);
    expect(expected.courtmates).toBeCloseTo(4 * Math.log(3) / Math.log(7), 12);
    expect(expected.partners).toBe(0);
    expect(expected.opponents).toBe(2);
    expect(expected.matchType).toBe(0);
    const measured = getSocialVarietyGains(candidate, context);
    for (const facet of facets) expect(measured[facet]).toBeCloseTo(expected[facet], 11);
  });

  it("matches independent completed-history entropy and exact G/T exposure calculations", () => {
    const players: InterclubPlayer[] = [
      makePlayer("AU1", "A", "UPPER"),
      makePlayer("AU2", "A", "UPPER"),
      makePlayer("AL1", "A", "LOWER"),
      makePlayer("AL2", "A", "LOWER"),
      makePlayer("BU1", "B", "UPPER"),
      makePlayer("BU2", "B", "UPPER"),
      makePlayer("BL1", "B", "LOWER"),
      makePlayer("BL2", "B", "LOWER"),
    ];
    const completed: SocialHistoryMatch[] = [
      { id: "own-1", team1: ["AU1", "AU2"], team2: ["BU1", "BU2"] },
      { id: "mixed-1", team1: ["AU1", "AL1"], team2: ["BU1", "BL1"] },
      { id: "own-2", team1: ["AL1", "AL2"], team2: ["BL1", "BL2"] },
      { id: "mixed-2", team1: ["AU2", "AL2"], team2: ["BU2", "BL2"] },
      { id: "own-3", team1: ["AU1", "AU2"], team2: ["BU1", "BU2"] },
      { id: "mixed-3", team1: ["AU1", "AL2"], team2: ["BU2", "BL1"] },
    ];
    const candidate: V3DoublesPartition = { team1: ["AU1", "AL1"], team2: ["BU2", "BL2"] };
    const oracle = buildIndependentOracle(players, completed);
    const context = buildSocialStructuralVarietyContext(players, completed, {
      sessionMode: SessionMode.MIXICANO,
      opportunityConstraints: [interclubConstraints()],
    });
    assertContextMatchesOracle(context, oracle);

    const expectedEntropy = independentEntropyGains(candidate, players, oracle);
    const measuredEntropy = getSocialVarietyGains(candidate, context);
    for (const facet of facets) expect(measuredEntropy[facet]).toBeCloseTo(expectedEntropy[facet], 11);

    const expectedPriority = independentPriorityMetrics(candidate, players, completed, oracle);
    const priority = createSocialCourtmatePriorityScorer(context, completed);
    const measuredPriority = priority.getPartitionMetrics(candidate);
    expect(measuredPriority.newCourtmatePairs).toBe(expectedPriority.G);
    expect(measuredPriority.newPartnerPairs).toBe(expectedPriority.P);
    expect(measuredPriority.newOpponentPairs).toBe(expectedPriority.O);
    expect(measuredPriority.rollingMatchTypeGainUnits).toBe(expectedPriority.rollingUnits);
    expect(priority.rollingTypeDenominator).toBe(expectedPriority.rollingDenominator);
  });

  it.each([
    ["strictly positive T rescue", false],
    ["zero-benefit rescue loses to full G", true],
  ] as const)("uses the constrained completed-only oracle for a %s", (_label, includeMixedHistory) => {
    const fixture = rescueFixture(includeMixedHistory);
    const constraints = interclubConstraints();
    const context = buildSocialStructuralVarietyContext(fixture.players, fixture.history, {
      sessionMode: SessionMode.MIXICANO,
      opportunityConstraints: [constraints],
    });
    const oracle = buildIndependentOracle(fixture.players, fixture.history);
    assertContextMatchesOracle(context, oracle);
    const priority = createSocialCourtmatePriorityScorer(context, fixture.history);
    const fullMetrics = independentPriorityMetrics(fixture.fullGain, fixture.players, fixture.history, oracle);
    const rescueMetrics = independentPriorityMetrics(fixture.rescue, fixture.players, fixture.history, oracle);
    expect(fullMetrics.G).toBe(6);
    expect(rescueMetrics.G).toBe(5);
    expect(rescueMetrics.rollingUnits).toBe(includeMixedHistory ? BigInt(0) : BigInt(4));
    expect(priority.getPartitionMetrics(fixture.fullGain).newCourtmatePairs).toBe(fullMetrics.G);
    expect(priority.getPartitionMetrics(fixture.rescue).newCourtmatePairs).toBe(rescueMetrics.G);
    expect(priority.getPartitionMetrics(fixture.fullGain).rollingMatchTypeGainUnits).toBe(fullMetrics.rollingUnits);
    expect(priority.getPartitionMetrics(fixture.rescue).rollingMatchTypeGainUnits).toBe(rescueMetrics.rollingUnits);
    expect(isCourtmateBeneficialRescueAdmissible(
      rescueMetrics.G,
      fullMetrics.G,
      rescueMetrics.rollingUnits,
      fullMetrics.rollingUnits,
    )).toBe(!includeMixedHistory);

    const allowedQuartets = new Set([
      quartetKey([...fixture.fullGain.team1, ...fixture.fullGain.team2]),
      quartetKey([...fixture.rescue.team1, ...fixture.rescue.team2]),
    ]);
    const searchRule: V3SelectionConstraints<ActiveInterclubPlayer> = {
      isQuartetAllowed: (quartet) => allowedQuartets.has(quartetKey(quartet.map((player) => player.userId))),
      normalizePartition: constraints.normalizePartition,
    };
    const result = findBestRotationBatchSelection(fixture.players, {
      courtCount: 1,
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      socialPriorityPolicy: "courtmate-beneficial-rescue",
      completedMatches: fixture.history,
      socialHistoryMatches: fixture.history,
      socialStructuralOpportunityConstraints: [constraints],
      selectionConstraints: searchRule,
      randomFn: () => 0,
    });
    expect(result.priorityCertified).toBe(true);
    expect(result.courtmateGainMaximumCertified).toBe(true);
    expect(result.courtmateGainMaximum).toBe(6);
    expect(result.chosenCourtmateGainDeficit).toBe(includeMixedHistory ? 0 : 1);
    expect(result.bestRollingMatchTypeGainAtGmax).toBe(0);
    expect(result.chosenRollingMatchTypeGain).toBe(includeMixedHistory ? 0 : 2);
    const selected = result.selection!.selections[0].partition;
    expect(quartetKey([...selected.team1, ...selected.team2])).toBe(
      quartetKey(includeMixedHistory
        ? [...fixture.fullGain.team1, ...fixture.fullGain.team2]
        : [...fixture.rescue.team1, ...fixture.rescue.team2])
    );
    const selectedIds = new Set([...selected.team1, ...selected.team2]);
    expect([...selectedIds].some((id) => fixture.players.find((player) => player.userId === id)?.isBusy)).toBe(false);
    expect([...selectedIds].some((id) => fixture.players.find((player) => player.userId === id)?.isPaused)).toBe(false);
    expect(result.chosenPostBatchCourtmateCoverage?.map((entry) => entry.userId)).toContain("AU2");
    expect(result.chosenPostBatchCourtmateCoverage?.map((entry) => entry.userId)).toContain("BL2");
  });
});
