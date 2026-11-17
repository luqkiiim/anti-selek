import { getEffectiveMixedSide } from "@/lib/mixedSide";
import {
  MATCH_CATEGORIES,
  parseBalancedMatchTypeSnapshot,
  type MatchTypeShares,
} from "./v3/balancedMatchTypes";
import type {
  MatchmakerV3Player,
  SocialHistoryMatch,
  V3DoublesPartition,
} from "./v3/types";

/** Keep an optional reservation from pinning an entire level into one repeating cohort. */
export function getBalancedQueueDeferralReason({
  players,
  availablePlayerIds,
  partition,
  reasonJson,
  history,
}: {
  players: readonly Pick<
    MatchmakerV3Player,
    | "userId"
    | "gender"
    | "partnerPreference"
    | "mixedSideOverride"
    | "isPaused"
    | "pool"
  >[];
  availablePlayerIds: ReadonlySet<string>;
  partition: V3DoublesPartition;
  reasonJson?: string | null;
  history: readonly SocialHistoryMatch[];
}):
  | "OVERREPRESENTED_COHORT_RESERVATION"
  | "UNDERREPRESENTED_TYPE_BLOCKED"
  | null {
  const proposed = parseBalancedMatchTypeSnapshot(reasonJson, partition);
  if (
    !proposed ||
    Object.values(proposed.target).filter((share) => share > 1e-8).length < 2
  )
    return null;
  const waiting = players.filter(
    (player) => !player.isPaused && availablePlayerIds.has(player.userId),
  );
  const upper = waiting.filter(
    (player) => getEffectiveMixedSide(player) === "UPPER",
  ).length;
  const lower = waiting.filter(
    (player) => getEffectiveMixedSide(player) === "LOWER",
  ).length;
  const categories = [
    upper >= 4 ? "UPPER" : null,
    upper >= 2 && lower >= 2 ? "MIXED" : null,
    lower >= 4 ? "LOWER" : null,
  ].filter(Boolean);
  if (!categories.includes(proposed.category)) return null;
  const pinsCohort =
    (proposed.category !== "LOWER" &&
      upper === (proposed.category === "UPPER" ? 4 : 2)) ||
    (proposed.category !== "UPPER" &&
      lower === (proposed.category === "LOWER" ? 4 : 2));
  const expected = { ...proposed.target };
  const actual: MatchTypeShares = { UPPER: 0, MIXED: 0, LOWER: 0 };
  actual[proposed.category] = 1;
  const seen = new Set<string>();
  for (const match of history) {
    if (match.id && seen.has(match.id)) continue;
    if (match.id) seen.add(match.id);
    const prior = parseBalancedMatchTypeSnapshot(
      match.balancedMatchType,
      match,
    );
    if (!prior || prior.group !== proposed.group) continue;
    actual[prior.category]++;
    for (const category of MATCH_CATEGORIES)
      expected[category] += prior.target[category];
  }
  if (actual[proposed.category] <= expected[proposed.category] + 1e-8)
    return null;
  if (categories.length === 1 && pinsCohort)
    return "OVERREPRESENTED_COHORT_RESERVATION";
  // Keep minority own-side games reachable: repeatedly reserving mixed pairs
  // can otherwise prevent four of five minority players ever becoming available.
  // A half-match deficit ignores ordinary rounding; the actual court remains free
  // to choose this same category under its stronger fairness/balance/rest rules.
  const requirements = { UPPER: [4, 0], MIXED: [2, 2], LOWER: [0, 4] } as const;
  const available = [upper, lower] as const;
  const consumed = requirements[proposed.category];
  const scopeRoster = players.filter(
    (player) =>
      !player.isPaused &&
      (proposed.group === "session" ||
        (proposed.group === "pool:A" && player.pool !== "B") ||
        (proposed.group === "pool:B" && player.pool === "B")),
  );
  const ownRoster = {
    UPPER: scopeRoster.filter(
      (player) => getEffectiveMixedSide(player) === "UPPER",
    ).length,
    LOWER: scopeRoster.filter(
      (player) => getEffectiveMixedSide(player) === "LOWER",
    ).length,
  };
  const blocksOwed = MATCH_CATEGORIES.some(
    (category) =>
      // A spare is essential: synchronizing an entire four-player level into
      // own-side courts can make starvation protection keep that cohort together.
      category !== "MIXED" &&
      ownRoster[category] > 4 &&
      proposed.target[category] > 1e-8 &&
      !categories.includes(category) &&
      expected[category] - actual[category] >= 0.5 - 1e-8 &&
      requirements[category].some(
        (needed, side) =>
          needed > 0 &&
          consumed[side] > 0 &&
          available[side] - consumed[side] < needed,
      ),
  );
  return blocksOwed ? "UNDERREPRESENTED_TYPE_BLOCKED" : null;
}
