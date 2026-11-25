import { readFileSync } from "node:fs";
import { MixedSide, PartnerPreference, PlayerGender, SessionPool } from "@/types/enums";

type Profile = "compact" | "wide" | "offset" | "segregated" | "outliers" | "tied" | "evo";

interface Scenario {
  upper: number;
  lower: number;
  profile: Profile;
  courts: number;
  queued?: boolean;
  lifecycle?: boolean;
  lateAfterCompletions?: number;
  open?: boolean;
  overrides?: boolean;
  duration?: number;
  completionLimit?: number;
  fixedGameMinutes?: number;
}

export const clubPlayBenchmarkScenarios = {
  "evo-opening": { upper: 15, lower: 10, profile: "evo", courts: 4, completionLimit: 32 },
  "evo-late": { upper: 17, lower: 10, profile: "evo", courts: 4, completionLimit: 40, lateAfterCompletions: 4 },
  compact: { upper: 7, lower: 7, profile: "compact", courts: 2 },
  "balanced-21": { upper: 7, lower: 7, profile: "tied", courts: 1, duration: 105, fixedGameMinutes: 5 },
  "balanced-24": { upper: 8, lower: 8, profile: "tied", courts: 1, fixedGameMinutes: 5 },
  "tied-20": { upper: 7, lower: 7, profile: "tied", courts: 2, completionLimit: 20 },
  "compact-20": { upper: 7, lower: 7, profile: "compact", courts: 2, completionLimit: 20 },
  wide: { upper: 12, lower: 12, profile: "wide", courts: 3 },
  "wide-20": { upper: 7, lower: 7, profile: "wide", courts: 2, completionLimit: 20 },
  "wide-queued-20": { upper: 7, lower: 7, profile: "wide", courts: 2, queued: true, completionLimit: 20 },
  segregated: { upper: 8, lower: 8, profile: "segregated", courts: 2 },
  offset: { upper: 7, lower: 7, profile: "offset", courts: 2 },
  "offset-20": { upper: 7, lower: 7, profile: "offset", courts: 2, completionLimit: 20 },
  "offset-queued-20": { upper: 7, lower: 7, profile: "offset", courts: 2, queued: true, completionLimit: 20 },
  "outliers-20": { upper: 7, lower: 7, profile: "outliers", courts: 2, completionLimit: 20 },
  "8-6": { upper: 8, lower: 6, profile: "compact", courts: 2 },
  "10-5": { upper: 10, lower: 5, profile: "compact", courts: 2 },
  "12-4": { upper: 12, lower: 4, profile: "compact", courts: 2 },
  "4-12": { upper: 4, lower: 12, profile: "compact", courts: 2 },
  "10-2": { upper: 10, lower: 2, profile: "tied", courts: 2 },
  "13-1": { upper: 13, lower: 1, profile: "tied", courts: 2 },
  "2-2": { upper: 2, lower: 2, profile: "tied", courts: 1 },
  "one-side": { upper: 12, lower: 0, profile: "wide", courts: 2 },
  "three-court-20": { upper: 10, lower: 10, profile: "wide", courts: 3, queued: true, lifecycle: true },
  "three-court-24": { upper: 12, lower: 12, profile: "wide", courts: 3, queued: true, lifecycle: true },
  "three-court-28": { upper: 14, lower: 14, profile: "wide", courts: 3, queued: true, lifecycle: true },
  "overrides-outliers": { upper: 8, lower: 6, profile: "outliers", courts: 2, overrides: true },
  "open-guests": { upper: 6, lower: 6, profile: "compact", courts: 2, open: true, overrides: true },
} satisfies Record<string, Scenario>;

export type ScenarioId = keyof typeof clubPlayBenchmarkScenarios;

export interface BenchmarkPlayer {
  id: string;
  rating: number;
  trueRating: number;
  // Distance across an intentionally offset mixed cohort is measured on its underlying scale.
  mixedComparableRating: number;
  skillSegment: "weakest" | "middle" | "strongest";
  skillCluster: number | null;
  gender: PlayerGender;
  effectiveSide: MixedSide | null;
  mixedSideOverride: MixedSide | null;
  partnerPreference: PartnerPreference;
  pool: SessionPool;
  isGuest: boolean;
}

export function benchmarkRandom(seed: number) {
  let state = seed;
  return () => ((state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0) / 2 ** 32);
}

export function predictedWinChance(averageGap: number) {
  return 1 / (1 + 10 ** (-averageGap / 400));
}

function pickTwo(players: BenchmarkPlayer[], random: () => number) {
  const first = Math.floor(random() * players.length);
  const others = players.filter((_, index) => index !== first);
  return [players[first], others[Math.floor(random() * others.length)]] as const;
}

/** Synthetic historical results follow the existing team-average Elo shape. */
function seedSegregatedHistory(players: BenchmarkPlayer[], seed: number) {
  const random = benchmarkRandom(seed ^ 7_597);
  const pools = [SessionPool.A, SessionPool.B].map((pool) => {
    const group = players.filter((player) => player.pool === pool);
    return { group, winner: group.reduce((top, player) => player.trueRating > top.trueRating ? player : top) };
  });
  const matchCountPerPool = 96;
  for (const { group } of pools) {
    const upper = group.filter((player) => player.effectiveSide === MixedSide.UPPER);
    const lower = group.filter((player) => player.effectiveSide === MixedSide.LOWER);
    for (let index = 0; index < matchCountPerPool; index++) {
      const [a, b] = pickTwo(upper, random);
      const [c, d] = pickTwo(lower, random);
      const trueGap = (a.trueRating + c.trueRating - b.trueRating - d.trueRating) / 2;
      const firstWins = random() < predictedWinChance(trueGap);
      const displayedGap = (a.rating + c.rating - b.rating - d.rating) / 2;
      const margin = 1 + (5 - 2) * 0.05; // 21–16 in the synthetic history.
      const delta = Math.round(32 * (1 - predictedWinChance(firstWins ? displayedGap : -displayedGap)) * margin);
      for (const player of [a, c]) player.rating += firstWins ? delta : -delta;
      for (const player of [b, d]) player.rating += firstWins ? -delta : delta;
    }
  }
  const focal = pools[1].winner;
  return {
    matchCountPerPool,
    crossPoolMatches: 0,
    focal: focal.id,
    focalTrueRating: focal.trueRating,
    focalObservedRating: focal.rating,
    strongerCompetitivePlayersWithLowerObservedRating: pools[0].group.filter(
      (player) => player.trueRating > focal.trueRating && player.rating < focal.rating,
    ).map((player) => player.id),
  };
}

function readEvoRatings() {
  const file = process.env.CLUB_PLAY_BENCHMARK_EVO_ROSTER;
  if (!file) throw new Error("Set CLUB_PLAY_BENCHMARK_EVO_ROSTER to a protected, de-identified roster JSON file.");
  const { upper, lower, late } = JSON.parse(readFileSync(file, "utf8"));
  if (![[upper, 15], [lower, 10], [late, 2]].every(([ratings, count]) =>
    Array.isArray(ratings) && ratings.length === count && ratings.every(Number.isFinite))) {
    throw new Error("Evo replay requires 15 Higher, 10 Lower and two late Higher ratings.");
  }
  return { upper: upper as number[], lower: lower as number[], late: late as number[] };
}

export function makeClubPlayBenchmarkScenario(id: ScenarioId, seed: number) {
  const config: Scenario = clubPlayBenchmarkScenarios[id];
  const random = benchmarkRandom(seed);
  const players: BenchmarkPlayer[] = [];
  const evo = config.profile === "evo" ? readEvoRatings() : null;
  const evoUpper = evo ? [...evo.upper, ...evo.late] : [];
  for (const [side, count] of [[MixedSide.UPPER, config.upper], [MixedSide.LOWER, config.lower]] as const) {
    for (let index = 0; index < count; index++) {
      const position = count > 1 ? index / (count - 1) : 0.5;
      const upper = side === MixedSide.UPPER;
      const weakHalf = index < Math.floor(count / 2);
      const jitter = index === 0 || index === count - 1 ? 0 : Math.round(12 * (random() - 0.5));
      const cluster = Math.min(2, Math.floor(3 * position));
      let rating = Math.round(990 + 310 * position) + jitter;
      if (config.profile === "tied") rating = 1_000;
      if (config.profile === "wide") rating = [500, 840, 1_190][cluster] + Math.round(110 * (position * 3 - cluster)) + jitter;
      if (config.profile === "offset") rating = Math.round((upper ? 1_050 : 700) + 250 * position) + jitter;
      if (config.profile === "segregated") rating = weakHalf ? Math.round(680 + 590 * position) : Math.round(1_100 + 225 * (2 * position - 1));
      if (config.profile === "outliers") rating = upper && index === 0 ? 500 : !upper && index === count - 1 ? 1_550 : 1000 + 20 * Math.floor(index / 2);

      if (evo) rating = upper ? evoUpper[index] : evo.lower[index];

      const useOverride = Boolean(config.overrides && index === 1);
      const isGuest = Boolean(config.open && !upper && index === count - 1);
      const gender = isGuest ? PlayerGender.UNSPECIFIED : upper ? PlayerGender.MALE : PlayerGender.FEMALE;
      const effectiveSide = isGuest ? null : !useOverride ? side : upper ? MixedSide.LOWER : MixedSide.UPPER;
      players.push({ id: `${upper ? "H" : "L"}${index + 1}`, rating: config.profile === "segregated" || isGuest ? 1000 : rating,
        trueRating: rating, mixedComparableRating: config.profile === "offset" && !upper ? rating + 350 : rating,
        skillCluster: config.profile === "wide" ? cluster : null, skillSegment: "middle", gender, effectiveSide,
        mixedSideOverride: useOverride ? effectiveSide : null,
        partnerPreference: effectiveSide === MixedSide.LOWER ? PartnerPreference.FEMALE_FLEX : PartnerPreference.OPEN,
        pool: weakHalf ? SessionPool.B : SessionPool.A, isGuest });
    }
  }
  if (config.lateAfterCompletions) {
    // Keep the two simulated late Higher players last for the attendance driver.
    players.push(...players.splice(evo!.upper.length, evo!.late.length));
  }
  const ordered = [...players].sort((a, b) => a.trueRating - b.trueRating || a.id.localeCompare(b.id));
  for (const [index, player] of ordered.entries()) {
    player.skillSegment = (["weakest", "middle", "strongest"] as const)[Math.floor(3 * index / ordered.length)];
  }
  const calibration = config.profile === "segregated" ? seedSegregatedHistory(players, seed) : null;
  return { config, players, calibration };
}
