import { getPairKey } from "../v3/rematch";
import type { SocialHistoryMatch } from "../v3/types";
import type { buildClubPlayCompatibilityScorer } from "./clubPlayCompatibility";
import { LEVEL_SKILL_UNIT } from "./levelCompatibility";
import type { MatchmakerLadderPlayer } from "./types";

export const CLUB_PLAY_QUALITY_UNIT = 2 * LEVEL_SKILL_UNIT;
const RECENT_GAME_WEIGHTS = [1 / 2, 1 / 4, 1 / 8, 1 / 16] as const;

export function buildClubPlayRotation(
  players: readonly MatchmakerLadderPlayer[],
  history: readonly SocialHistoryMatch[],
  skill: ReturnType<typeof buildClubPlayCompatibilityScorer>,
) {
  const byId = new Map(players.map((player, index) => [player.userId, index]));
  const stronger = players.map((player) => {
    const comparisons = players.map((other) => {
      if (player === other || other.isPaused || !skill.qualifiesForPlayUp(player, other)) return 0;
      return skill.sharesRatingScale(player, other) ? 2 : 1;
    });
    // When possible, the opportunity is to face stronger players on the
    // participant's own rating scale. A rank comparison can stand in when
    // nobody on that scale is sufficiently stronger.
    const preferred = comparisons.includes(2) ? 2 : 1;
    return comparisons.map((strength) => strength === preferred);
  });
  const playedUp = (ids: readonly string[]) => ids.filter((id) => {
    const index = byId.get(id);
    return index !== undefined && ids.some((other) => stronger[index][byId.get(other) ?? -1]);
  });
  const playedUpPreviously = new Set<string>();
  const starts = new Map<string, number>();
  const startsSinceBoost = new Map<string, number>();
  const familiarity = new Map<string, number>();
  let startsSinceLastBoost = 0;
  let foundLastBoost = false;

  // A player's clock advances only on their own starts. Equal start times use
  // match IDs so the same history always produces the same result.
  const ordered = [...history].sort((a, b) =>
    ((a.createdAt ?? a.completedAt)?.getTime() ?? 0) - ((b.createdAt ?? b.completedAt)?.getTime() ?? 0) ||
    (a.id ?? "").localeCompare(b.id ?? ""));
  for (let matchIndex = ordered.length - 1; matchIndex >= 0; matchIndex--) {
    const match = ordered[matchIndex];
    const ids = [...match.team1, ...match.team2];
    for (const id of match.clubPlayPlayedUp ?? playedUp(ids)) playedUpPreviously.add(id);
    if (match.clubPlayBoosted) foundLastBoost = true;
    if (!foundLastBoost) startsSinceLastBoost++;
    for (const id of ids) {
      const games = starts.get(id) ?? 0;
      if (match.clubPlayBoosted && !startsSinceBoost.has(id)) startsSinceBoost.set(id, games);
      starts.set(id, games + 1);
      const weight = RECENT_GAME_WEIGHTS[games] ?? 0;
      if (!weight) continue;
      for (const other of ids) if (other !== id) {
        const key = getPairKey(id, other);
        familiarity.set(key, (familiarity.get(key) ?? 0) + weight);
      }
    }
  }
  const due = new Set(players.filter(({ userId }) => (starts.get(userId) ?? 0) >= 2 && !playedUpPreviously.has(userId))
    .map(({ userId }) => userId));
  const boostAvailable = startsSinceLastBoost >= 3 && due.size > 0;

  return {
    playedUp,
    cost(ids: readonly string[]) {
      let repeat = 0;
      if (familiarity.size) {
        for (let left = 0; left < ids.length; left++) for (let right = left + 1; right < ids.length; right++) {
          repeat += familiarity.get(getPairKey(ids[left], ids[right])) ?? 0;
        }
      }
      const mayBoost = boostAvailable && ids.every((id) => (startsSinceBoost.get(id) ?? Infinity) >= 2);
      const beneficiaries = mayBoost ? playedUp(ids).filter((id) => due.has(id)).length : 0;
      return {
        repeat: Math.round(repeat / 12 * CLUB_PLAY_QUALITY_UNIT),
        boost: Math.min(5, 3 * beneficiaries) * CLUB_PLAY_QUALITY_UNIT,
      };
    },
  };
}
