import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { MixedSide, SessionMode } from "@/types/enums";
import { LEVEL_SKILL_UNIT, type LevelCompatibility } from "./levelCompatibility";
import type { MatchmakerLadderPlayer } from "./types";

type RatedPlayer = Pick<MatchmakerLadderPlayer,
  "userId" | "strength" | "isPaused" | "gender" | "partnerPreference" | "mixedSideOverride">;

const ELO_SCALE = 200;
const PERCENTILE_SCALE = 0.5;

function percentiles(players: readonly RatedPlayer[]) {
  const ratings = players.map(({ strength }) => strength).sort((a, b) => a - b);
  const positions = new Map<number, number>();
  for (let start = 0; start < ratings.length;) {
    let end = start + 1;
    while (ratings[end] === ratings[start]) end++;
    positions.set(ratings[start], (start + end) / (2 * ratings.length));
    start = end;
  }
  return {
    position: (rating: number) => positions.get(rating) ?? 0.5,
    isNearTop: (rating: number) => positions.has(rating) &&
      rating >= (ratings.at(-Math.max(1, Math.floor(ratings.length / 5))) ?? Infinity),
  };
}

export function buildClubPlayCompatibilityScorer(
  players: readonly RatedPlayer[], sessionMode = SessionMode.MIXICANO,
) {
  const mixed = sessionMode === SessionMode.MIXICANO;
  const sides = new Map(players.map((player) => [player.userId, getEffectiveMixedSide(player)]));
  const roster = players.filter((player) => !player.isPaused && Number.isFinite(player.strength));
  const overall = percentiles(roster);
  const upper = percentiles(roster.filter(({ userId }) => sides.get(userId) === MixedSide.UPPER));
  const lower = percentiles(roster.filter(({ userId }) => sides.get(userId) === MixedSide.LOWER));
  const cohort = (player: RatedPlayer) => {
    const side = sides.get(player.userId);
    return mixed && side === MixedSide.UPPER ? upper : mixed && side === MixedSide.LOWER ? lower : overall;
  };

  const percentile = (player: RatedPlayer) => cohort(player).position(player.strength);
  const sharesRatingScale = (player: RatedPlayer, other: RatedPlayer) =>
    !mixed || sides.get(player.userId) === sides.get(other.userId);

  return {
    sharesRatingScale,
    qualifiesForPlayUp(player: RatedPlayer, other: RatedPlayer) {
      if (!cohort(other).isNearTop(other.strength)) return false;
      return sharesRatingScale(player, other)
        ? other.strength - player.strength >= ELO_SCALE / 2
        : percentile(other) - percentile(player) >= PERCENTILE_SCALE / 2;
    },
    score(quartet: readonly RatedPlayer[]): LevelCompatibility {
      const strongerSide = mixed ? quartet.filter(({ userId }) => sides.get(userId) === MixedSide.UPPER) : [];
      const otherSide = mixed ? quartet.filter(({ userId }) => sides.get(userId) === MixedSide.LOWER) : [];
      const mixedCourt = strongerSide.length === 2 && otherSide.length === 2;
      let relativeGap: number | null = null;
      let withinSideGap: number | null = null;
      let worst = 0;
      let total = 0;
      const addGap = (gap: number, scale: number) => {
        const squared = (gap / scale) ** 2;
        worst = Math.max(worst, squared);
        total += squared;
      };
      if (mixedCourt) {
        strongerSide.sort((a, b) => a.strength - b.strength);
        otherSide.sort((a, b) => a.strength - b.strength);
        const upperGap = strongerSide[1].strength - strongerSide[0].strength;
        const lowerGap = otherSide[1].strength - otherSide[0].strength;
        const lowRankGap = Math.abs(percentile(strongerSide[0]) - percentile(otherSide[0]));
        const highRankGap = Math.abs(percentile(strongerSide[1]) - percentile(otherSide[1]));
        relativeGap = Math.max(lowRankGap, highRankGap);
        withinSideGap = Math.max(upperGap, lowerGap);
        addGap(upperGap, ELO_SCALE);
        addGap(lowerGap, ELO_SCALE);
        addGap(lowRankGap, PERCENTILE_SCALE);
        addGap(highRankGap, PERCENTILE_SCALE);
      } else {
        for (let left = 0; left < quartet.length; left++) for (let right = left + 1; right < quartet.length; right++) {
          addGap(quartet[left].strength - quartet[right].strength, ELO_SCALE);
        }
      }
      const matchType = mixedCourt ? "MIXED" : strongerSide.length === 4 ? "UPPER" : otherSide.length === 4 ? "LOWER" : null;
      return {
        worst: Math.round(worst * LEVEL_SKILL_UNIT),
        mean: Math.round(total / (mixedCourt ? 4 : 6) * LEVEL_SKILL_UNIT),
        matchType, relativeGap, withinSideGap,
      };
    },
  };
}
