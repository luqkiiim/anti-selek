import {
  buildOpponentRepeatHistory, buildPartnerRepeatHistory, buildSocialMixHistory,
  getExactPartitionKey, getOpponentRepeatPenalty, getPairKey, getPartnerRepeatPenalty, getSharedCourtRepeatPenalty,
} from "../v3/rematch";
import type { SocialHistoryMatch, V3DoublesPartition } from "../v3/types";

export const LEVEL_RELATIONSHIP_COST_SIZE = 9;

const idsOf = (partition: V3DoublesPartition) => [...partition.team1, ...partition.team2];
const quartetKey = (partition: V3DoublesPartition) => idsOf(partition).sort().join("|");
const pairsOf = (partition: V3DoublesPartition) => ({
  partners: [partition.team1, partition.team2],
  opponents: partition.team1.flatMap((a) => partition.team2.map((b): [string, string] => [a, b])),
});

export function buildLevelRelationshipVariety(history: readonly SocialHistoryMatch[]) {
  const seen = new Set<string>();
  const committed = history.filter((match) => {
    if (new Set(idsOf(match)).size !== 4 || (match.id && seen.has(match.id))) return false;
    if (match.id) seen.add(match.id);
    return true;
  });
  const relationships = buildSocialMixHistory(committed);
  const recentPartners = buildPartnerRepeatHistory(committed);
  const recentOpponents = buildOpponentRepeatHistory(committed);
  const counts = { partners: new Map<string, number>(), opponents: new Map<string, number>() };
  const possible = { partners: new Map<string, Set<string>>(), opponents: new Map<string, Set<string>>() };
  const quartets = new Map<string, number>(), exact = new Map<string, number>();
  const increment = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  const roles = ["opponents", "partners"] as const;
  for (const match of committed) {
    const pairs = pairsOf(match);
    for (const role of roles) for (const [a, b] of pairs[role]) increment(counts[role], getPairKey(a, b));
    increment(quartets, quartetKey(match));
    increment(exact, getExactPartitionKey(match));
  }
  const opportunities = (partition: V3DoublesPartition) => {
    const pairs = pairsOf(partition);
    for (const role of roles) for (const [a, b] of pairs[role]) {
      if (!possible[role].has(a)) possible[role].set(a, new Set());
      if (!possible[role].has(b)) possible[role].set(b, new Set());
      possible[role].get(a)!.add(b);
      possible[role].get(b)!.add(a);
    }
  };
  const deficit = { partners: new Map<string, number>(), opponents: new Map<string, number>() };
  const finalize = () => {
    for (const role of roles) for (const [id, others] of possible[role]) {
      const unseen = [...others].filter((other) => !counts[role].has(getPairKey(id, other))).length;
      deficit[role].set(id, Math.round(100 * unseen / others.size));
    }
  };
  const score = (partition: V3DoublesPartition, exposure: number) => {
    const repeated = [0, 0], opportunityCost = [0, 0];
    let frequency = 0;
    const pairs = pairsOf(partition);
    for (const [index, role] of roles.entries()) for (const [a, b] of pairs[role]) {
      const count = counts[role].get(getPairKey(a, b)) ?? 0;
      if (count) repeated[index]++;
      else opportunityCost[index] -= (deficit[role].get(a) ?? 0) + (deficit[role].get(b) ?? 0);
      frequency += count ** 2;
    }
    const recency = getPartnerRepeatPenalty(partition, recentPartners) + getOpponentRepeatPenalty(partition, recentOpponents);
    return [exposure, ...repeated, opportunityCost[0] + opportunityCost[1], frequency, Math.round(1_000 * recency),
      quartets.get(quartetKey(partition)) ?? 0, exact.get(getExactPartitionKey(partition)) ?? 0,
      getSharedCourtRepeatPenalty(partition, relationships)];
  };
  return { opportunities, finalize, score };
}
