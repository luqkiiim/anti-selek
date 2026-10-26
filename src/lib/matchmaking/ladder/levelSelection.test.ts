import { afterEach, describe, expect, it, vi } from "vitest";

import { PlayerGender, SessionBalanceMetric, SessionMode } from "@/types/enums";
import { getExactPartitionKey } from "../v3/rematch";
import * as balanceGuardrail from "../v3/balanceGuardrail";
import { createMatchmakingSearchBudget } from "../v3/searchBudget";
import { findBestLevelBatchSelection } from "./levelSelection";
import type {
  LadderSelectionConstraints,
  MatchmakerLadderPlayer,
} from "./types";

function player(userId: string, strength = 1000, overrides: Partial<MatchmakerLadderPlayer> = {}): MatchmakerLadderPlayer {
  return {
    userId,
    strength,
    matchesPlayed: 4,
    matchmakingBaseline: 4,
    availableSince: new Date("2026-10-01T00:00:00Z"),
    wins: 0,
    losses: 0,
    ladderScore: 0,
    pointDiff: 0,
    restTurns: 0,
    gender: PlayerGender.MALE,
    partnerPreference: "OPEN",
    ...overrides,
  };
}

function quartet(prefix: string, strengths: number[]) {
  return strengths.map((strength, index) => player(`${prefix}${index}`, strength));
}

function quartetKey(ids: readonly string[]) {
  return [...ids].sort().join("|");
}

function allowQuartets(...quartets: MatchmakerLadderPlayer[][]): LadderSelectionConstraints {
  const allowed = new Set(quartets.map((players) => quartetKey(players.map((p) => p.userId))));
  return { isQuartetAllowed: (players) => allowed.has(quartetKey(players.map((p) => p.userId))) };
}

type Options = Parameters<typeof findBestLevelBatchSelection>[1];

function select(players: MatchmakerLadderPlayer[], overrides: Partial<Options> = {}) {
  return findBestLevelBatchSelection(players, {
    courtCount: 1,
    sessionMode: SessionMode.MEXICANO,
    levelPolicy: { metric: SessionBalanceMetric.RATING },
    randomFn: () => 0,
    ...overrides,
  });
}

function seededRandom(seed = 17) {
  let state = seed;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// An independent small-roster oracle enumerates all court assignments and team
// partitions. It uses only the documented measurements, never matcher helpers.
function exhaustiveTwoCourtOracle(players: MatchmakerLadderPlayer[], metric: SessionBalanceMetric) {
  const candidates: number[][] = [];
  function layouts(court: MatchmakerLadderPlayer[]) {
    return [1, 2, 3].map((partnerIndex) => {
      const others = court.filter((_, index) => index !== 0 && index !== partnerIndex);
      const values = court.map((p) => p.strength);
      let pairwise = 0;
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) pairwise += Math.abs(values[i] - values[j]);
      }
      return {
        spread: Math.max(...values) - Math.min(...values),
        pairwise,
        gap: Math.abs((court[0].strength + court[partnerIndex].strength - others[0].strength - others[1].strength) / 2),
      };
    });
  }
  const rosters = players.length === 8
    ? [players]
    : players.map((_, excluded) => players.filter((_, index) => index !== excluded));
  for (const roster of rosters) {
    // Put player zero on the first court to avoid counting court swaps twice.
    for (let b = 1; b < 6; b++) {
      for (let c = b + 1; c < 7; c++) {
        for (let d = c + 1; d < 8; d++) {
          const indices = new Set([0, b, c, d]);
          const left = layouts(roster.filter((_, i) => indices.has(i)));
          const right = layouts(roster.filter((_, i) => !indices.has(i)));
          for (const a of left) {
            for (const b of right) {
              candidates.push([
                Math.max(a.spread, b.spread), a.pairwise + b.pairwise,
                Math.max(a.gap, b.gap), a.gap + b.gap,
              ]);
            }
          }
        }
      }
    }
  }
  const compare = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  };
  const baseline = [...candidates].sort((a, b) => compare(a.slice(2), b.slice(2)))[0];
  const rating = metric === SessionBalanceMetric.RATING;
  const ceilingFeasible = !rating || baseline[2] <= 50;
  const maximumGap = ceilingFeasible
    ? Math.min(baseline[2] + (rating ? 30 : 1.5), rating ? 50 : Infinity)
    : baseline[2];
  return candidates.filter((candidate) => candidate[2] <= maximumGap &&
    (ceilingFeasible || candidate[3] <= baseline[3])).sort(compare)[0];
}

describe("Level selection policy", () => {
  afterEach(() => vi.restoreAllMocks());

  const regressionRatings = [700, 921, 1802, 1673, 754, 1415, 1676, 797, 938, 989, 1300,
    931, 892, 653, 1754, 1625, 2076, 907, 1198, 959, 1630];

  function firstBatch(ratings: number[]) {
    return ratings.map((rating, i) => player(`p${String(i).padStart(2, "0")}`, rating,
      { matchesPlayed: 0, matchmakingBaseline: 0 }));
  }

  function expectAdmittedThreeCourts(result: ReturnType<typeof select>) {
    expect(result.debug.baselineCertified).toBe(true);
    expect(result.selection?.selections).toHaveLength(3);
    expect(new Set(result.selection!.selections.flatMap((court) => court.ids)).size).toBe(12);
    const guardrail = result.selection!.selections[0].levelContext!.balanceGuardrail;
    expect(result.selection!.maxBalanceGap).toBeLessThanOrEqual(guardrail.allowedMaxBalanceGap);
    if (guardrail.allowedTotalBalanceGap !== null) {
      expect(result.selection!.totalBalanceGap).toBeLessThanOrEqual(guardrail.allowedTotalBalanceGap);
    }
  }

  it("generates the previously timing-out 21-player, three-court first batch", () => {
    const result = select(firstBatch(regressionRatings), { courtCount: 3 });
    expectAdmittedThreeCourts(result);
    expect(result.debug.eligiblePlayerIds).toHaveLength(21);
    expect(result.selection!.selections[0].levelContext!.balanceGuardrail.bestMaxBalanceGap).toBe(0);
    expect(result.selection!.selections[0].levelContext!.balanceGuardrail.allowedMaxBalanceGap).toBe(30);
  });

  it.each([1, 17, 104729])("admits three-court first batches with irregular ratings, seed %s", (seed) => {
    const random = seededRandom(seed);
    const ratings = Array.from({ length: 21 }, (_, i) => 600 + Math.floor(random() * 150) * 10 + i);
    expectAdmittedThreeCourts(select(firstBatch(ratings), { courtCount: 3, randomFn: seededRandom(seed) }));
  });

  it.each([
    Array(21).fill(1000),
    Array.from({ length: 21 }, (_, i) => 700 + i * 50),
    regressionRatings.slice(0, 18),
    [...regressionRatings, 1123, 1567, 1879],
  ].map((ratings) => ({ ratings })))("admits the equal, evenly spaced and nearby roster controls (%#)", ({ ratings }) => {
    expectAdmittedThreeCourts(select(firstBatch(ratings), { courtCount: 3 }));
  });

  it.each([SessionBalanceMetric.RATING, SessionBalanceMetric.SESSION_POINTS])(
    "matches a constrained exhaustive three-court oracle with a surplus outlier, metric=%s", (metric) => {
      const players = [player("A-outlier", 3000), ...[900, 930, 970, 1010, 1160, 1190, 1230, 1270, 1400, 1440, 1510, 1590]
        .map((strength, i) => player(`P${String(i).padStart(2, "0")}`, metric === SessionBalanceMetric.RATING ? strength : strength / 100))];
      const regulars = players.slice(1);
      const allowed = [
        regulars.slice(0, 4), regulars.slice(4, 8), regulars.slice(8, 12),
        [regulars[0], regulars[1], regulars[4], regulars[5]],
        [regulars[2], regulars[3], regulars[8], regulars[9]],
        [regulars[6], regulars[7], regulars[10], regulars[11]],
        [players[0], ...regulars.slice(1, 4)],
      ];
      const layouts: { players: MatchmakerLadderPlayer[]; spread: number; pairwise: number; gap: number }[] = [];
      for (const court of allowed) {
        for (const partner of [1, 2, 3]) {
          const other = court.filter((_, i) => i !== 0 && i !== partner);
          let pairwise = 0;
          for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) pairwise += Math.abs(court[a].strength - court[b].strength);
          layouts.push({ players: court, spread: Math.max(...court.map((p) => p.strength)) - Math.min(...court.map((p) => p.strength)),
            pairwise, gap: Math.abs(court[0].strength + court[partner].strength - other[0].strength - other[1].strength) / 2 });
        }
      }
      const batches: number[][] = [];
      for (const a of layouts) for (const b of layouts) for (const c of layouts) {
        if (new Set([...a.players, ...b.players, ...c.players].map((p) => p.userId)).size !== 12) continue;
        batches.push([Math.max(a.spread, b.spread, c.spread), a.pairwise + b.pairwise + c.pairwise,
          Math.max(a.gap, b.gap, c.gap), a.gap + b.gap + c.gap]);
      }
      const compare = (a: number[], b: number[]) => {
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
        return 0;
      };
      const baseline = [...batches].sort((a, b) => compare(a.slice(2), b.slice(2)))[0];
      const rating = metric === SessionBalanceMetric.RATING;
      const ceilingFeasible = !rating || baseline[2] <= 50;
      const maximum = ceilingFeasible ? Math.min(baseline[2] + (rating ? 30 : 1.5), rating ? 50 : Infinity) : baseline[2];
      const expected = batches.filter((batch) => batch[2] <= maximum && (ceilingFeasible || batch[3] <= baseline[3])).sort(compare)[0];
      const constraints = allowQuartets(...allowed);
      const result = select(players, { courtCount: 3, levelPolicy: { metric }, selectionConstraints: constraints });
      const chosen = result.selection!;
      expect(result.debug.baselineCertified).toBe(true);
      expect([chosen.maxLadderGap, chosen.totalLadderGap, chosen.maxBalanceGap, chosen.totalBalanceGap]).toEqual(expected);
      expect(chosen.selections.flatMap((court) => court.ids)).not.toContain("A-outlier");
    }
  );

  it("keeps distinct player bits above index 31 when filling multiple courts", () => {
    const players = firstBatch(Array(35).fill(1000));
    const first = players.slice(0, 4);
    const last = players.slice(31, 35);
    const constraints = allowQuartets(first, last);
    const result = select(players, { courtCount: 2, selectionConstraints: constraints });
    expect(result.debug.baselineCertified).toBe(true);
    expect(result.selection?.selections.flatMap((court) => court.ids).sort())
      .toEqual([...first, ...last].map((p) => p.userId).sort());
  });

  it("does not order courts with different constraints as if they were interchangeable", () => {
    const a = quartet("A", [900, 910, 920, 930]);
    const b = quartet("B", [1100, 1110, 1120, 1130]);
    const c = quartet("C", [1300, 1310, 1320, 1330]);
    const result = select([...a, ...b, ...c], {
      courtCount: 3,
      schedules: [{ rank: 0, courts: [allowQuartets(c), allowQuartets(a), allowQuartets(b)] }],
    });
    expect(result.selection?.selections.map((court) => [...court.ids].sort()))
      .toEqual([c, a, b].map((players) => players.map((p) => p.userId)));
  });

  it.each(["count", "arrival", "overdue"])("does not let a balanced incumbent block better multi-court %s priority", (priority) => {
    const regulars = Array.from({ length: 8 }, (_, i) => player(`regular${i}`));
    const outlier = player("outlier", 3000, priority === "count"
      ? { matchesPlayed: 3, matchmakingBaseline: 3 }
      : priority === "arrival" ? { arrivalPriorityAt: new Date("2026-10-01T01:00:00Z") } : { restTurns: 10 });
    const result = select([...regulars, outlier], { courtCount: 2 });
    expect(result.debug.baselineCertified).toBe(true);
    expect(result.selection?.selections.flatMap((court) => court.ids)).toContain(outlier.userId);
    expect(result.selection?.selections).toHaveLength(2);
  });

  it("returns a controlled failure when the baseline branch allowance expires", () => {
    const result = select(firstBatch(regressionRatings), { courtCount: 3, searchLimits: { maxBranches: 1 } });
    expect(result.selection).toBeNull();
    expect(result.debug).toMatchObject({ baselineCertified: false, searchLimitReached: true, searchLimitPhase: "baseline" });
  });

  it("shares one branch cap across baseline and quality instead of resetting it", () => {
    const result = select(quartet("A", [1000, 1010, 1020, 1030]), { searchLimits: { maxBranches: 2 } });
    expect(result.selection).not.toBeNull();
    expect(result.debug).toMatchObject({ baselineCertified: true, exploredBranches: 2,
      searchLimitReached: true, searchLimitPhase: "quality" });
  });

  it("keeps a certified batch when final ranking runs out of time before its first visit", () => {
    let now = 0;
    let certified = false;
    vi.spyOn(performance, "now").mockImplementation(() => certified ? now += 2_001 : now);
    const build = balanceGuardrail.buildBalanceGuardrail;
    vi.spyOn(balanceGuardrail, "buildBalanceGuardrail").mockImplementation((...args) => {
      const result = build(...args);
      certified = true;
      return result;
    });
    const result = select(firstBatch(regressionRatings), { courtCount: 3 });
    expectAdmittedThreeCourts(result);
    expect(result.debug).toMatchObject({ searchLimitReached: true, searchLimitPhase: "quality" });
    expect(result.selection!.selections.every((court) => court.levelDiagnostics?.searchLimitReached)).toBe(true);
  });

  it.each([undefined, 2_000])("gives quality a new phase allowance while respecting total maxMs=%s", (maxMs) => {
    let now = 0;
    let certified = false;
    vi.spyOn(performance, "now").mockImplementation(() => {
      if (certified) now = Math.min(2_100, now + 100);
      return now;
    });
    const build = balanceGuardrail.buildBalanceGuardrail;
    vi.spyOn(balanceGuardrail, "buildBalanceGuardrail").mockImplementation((...args) => {
      const result = build(...args);
      certified = true;
      return result;
    });
    const result = select(quartet("A", [1000, 1010, 1020, 1030]), {
      searchLimits: { maxMs }, selectionConstraints: { isQuartetAllowed: () => { now = 1_900; return true; } },
    });
    expect(result.selection).not.toBeNull();
    expect(result.debug.baselineCertified).toBe(true);
    expect(result.debug.searchLimitReached).toBe(maxMs !== undefined);
    expect(result.debug.searchLimitPhase).toBe(maxMs !== undefined ? "quality" : null);
  });

  it("stops a long preparation scan at the explicit total deadline", () => {
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const result = select(firstBatch(regressionRatings), {
      courtCount: 3, searchLimits: { maxMs: 50 },
      selectionConstraints: { isQuartetAllowed: () => { now = 51; return false; } },
    });
    expect(result.selection).toBeNull();
    expect(result.debug).toMatchObject({ baselineCertified: false, searchLimitReached: true, searchLimitPhase: "preparation" });
  });

  it("honours an already expired caller deadline", () => {
    const searchBudget = createMatchmakingSearchBudget({ maxMs: 0 });
    const result = select(firstBatch(regressionRatings), { courtCount: 3, searchBudget });
    expect(result.selection).toBeNull();
    expect(result.debug).toMatchObject({ searchLimitReached: true, searchLimitPhase: "preparation" });
    expect(result.debug.quartetCount).toBe(0);
  });

  it("stops quality at an earlier caller deadline while retaining the certified batch", () => {
    let callerNow = 0;
    const searchBudget = createMatchmakingSearchBudget({ maxMs: 10, now: () => callerNow });
    const build = balanceGuardrail.buildBalanceGuardrail;
    vi.spyOn(balanceGuardrail, "buildBalanceGuardrail").mockImplementation((...args) => {
      const result = build(...args);
      callerNow = 11;
      return result;
    });
    const result = select(firstBatch(regressionRatings), { courtCount: 3, searchBudget });
    expectAdmittedThreeCourts(result);
    expect(result.debug).toMatchObject({ searchLimitReached: true, searchLimitPhase: "quality" });
  });

  it.each([SessionBalanceMetric.RATING, SessionBalanceMetric.SESSION_POINTS])(
    "prefers the 200-spread quartet over balanced 800-spread extremes with %s",
    (metric) => {
      const compact = quartet("compact", [1000, 1050, 1150, 1200]);
      const extremes = quartet("extreme", [700, 800, 1400, 1500]);
      const result = select([...extremes, ...compact], {
        levelPolicy: { metric },
        schedules: [{ rank: 0, courts: [allowQuartets(compact, extremes)] }],
      });
      expect(result.selection?.selections[0].ids.slice().sort()).toEqual(compact.map((p) => p.userId));
      expect(result.selection?.maxBalanceGap).toBe(0);
      expect(result.selection?.maxLadderGap).toBe(200);
    }
  );

  it.each([
    { metric: SessionBalanceMetric.RATING, compact: [1000, 1000, 1000, 1060], wider: [800, 1000, 1000, 1200], admitted: true },
    { metric: SessionBalanceMetric.RATING, compact: [1000, 1000, 1000, 1062], wider: [800, 1000, 1000, 1200], admitted: false },
    { metric: SessionBalanceMetric.RATING, compact: [1000, 1000, 1000, 1100], wider: [800, 1000, 1000, 1240], admitted: true },
    { metric: SessionBalanceMetric.RATING, compact: [1000, 1000, 1000, 1102], wider: [800, 1000, 1000, 1240], admitted: false },
    { metric: SessionBalanceMetric.SESSION_POINTS, compact: [5, 5, 5, 8], wider: [0, 5, 5, 10], admitted: true },
    { metric: SessionBalanceMetric.SESSION_POINTS, compact: [5, 5, 5, 8.2], wider: [0, 5, 5, 10], admitted: false },
  ])("enforces the inclusive balance envelope: $metric $compact, admitted=$admitted", ({ metric, compact, wider, admitted }) => {
    const tight = quartet("tight", compact);
    const broad = quartet("broad", wider);
    const result = select([...tight, ...broad], {
      levelPolicy: { metric },
      schedules: [{ rank: 0, courts: [allowQuartets(tight, broad)] }],
    });
    expect(result.selection?.selections[0].ids.slice().sort()).toEqual((admitted ? tight : broad).map((p) => p.userId));
  });

  it("retains the best total balance across the whole batch when the rating ceiling is impossible", () => {
    const wideA = quartet("wideA", [800, 1000, 1000, 1360]);
    const wideB = quartet("wideB", [800, 1000, 1000, 1240]);
    const tightA = quartet("tightA", [1000, 1000, 1000, 1160]);
    const tightB = quartet("tightB", [1000, 1000, 1000, 1060]);
    const result = select([...wideA, ...wideB, ...tightA, ...tightB], {
      courtCount: 2,
      schedules: [
        { rank: 0, courts: [allowQuartets(wideA), allowQuartets(wideB)] },
        { rank: 0, courts: [allowQuartets(tightA), allowQuartets(tightB)] },
      ],
    });
    expect(result.selection?.selections).toHaveLength(2);
    expect(result.selection?.maxBalanceGap).toBe(80);
    expect(result.selection?.totalBalanceGap).toBe(100);
    expect(result.selection?.selections.flatMap((court) => court.ids).sort()).toEqual([...wideA, ...wideB].map((p) => p.userId).sort());
  });

  it("uses point difference only after level and team balance, and never as rating skill", () => {
    const tied = quartet("tie", [1000, 1000, 1000, 1000]);
    const ratingBefore = select(tied).selection!.selections[0];
    const changed = tied.map((p) => ({ ...p, pointDiff: ratingBefore.partition.team1.includes(p.userId) ? 100 : 0 }));
    const ratingAfter = select(changed).selection!.selections[0];
    const points = select(changed, { levelPolicy: { metric: SessionBalanceMetric.SESSION_POINTS } }).selection!.selections[0];
    expect(getExactPartitionKey(ratingAfter.partition)).toBe(getExactPartitionKey(ratingBefore.partition));
    expect(points.pointDiffGap).toBe(0);
    expect(getExactPartitionKey(points.partition)).not.toBe(getExactPartitionKey(ratingBefore.partition));

    const compact = quartet("compact", [0, 1, 1, 2]).map((p, i) => ({ ...p, pointDiff: i === 0 ? 1000 : 0 }));
    const wide = quartet("wide", [0, 0, 6, 6]);
    const result = select([...wide, ...compact], {
      levelPolicy: { metric: SessionBalanceMetric.SESSION_POINTS },
      schedules: [{ rank: 0, courts: [allowQuartets(compact, wide)] }],
    });
    expect(result.selection?.maxLadderGap).toBe(2);
    expect(result.selection?.maxBalanceGap).toBe(0);
    expect(result.selection?.selections[0].pointDiffGap).toBeGreaterThan(0);
  });

  it.each([SessionBalanceMetric.RATING, SessionBalanceMetric.SESSION_POINTS])(
    "ignores partner history even for exact skill ties with %s",
    (metric) => {
      const players = quartet("A", [1000, 1000, 1000, 1000]).concat(quartet("B", [1000, 1000, 1000, 1000]));
      const before = select(players, { levelPolicy: { metric }, randomFn: seededRandom() });
      const partners = new Map<string, string>();
      for (const team of [before.selection!.selections[0].partition.team1, before.selection!.selections[0].partition.team2]) {
        partners.set(team[0], team[1]);
        partners.set(team[1], team[0]);
      }
      const after = select(players.map((p) => ({ ...p, lastPartnerId: partners.get(p.userId) ?? "unselected" })), {
        levelPolicy: { metric }, randomFn: seededRandom(),
      });
      expect(after.selection?.selections.map((court) => getExactPartitionKey(court.partition)))
        .toEqual(before.selection?.selections.map((court) => getExactPartitionKey(court.partition)));
    }
  );

  it.each([true, false])("preserves count, arrival and excessive-wait priority ahead of an outlier's level fit; rest=%s", (respectPlayerRest) => {
    const regulars = Array.from({ length: 8 }, (_, i) => player(`regular${i}`));
    for (const outlier of [
      player("underplayed", 3000, { matchesPlayed: 3, matchmakingBaseline: 3 }),
      player("late", 3000, { matchesPlayed: 0, matchmakingBaseline: 4, arrivalPriorityAt: new Date("2026-10-01T01:00:00Z") }),
      player("resumed", 3000, { arrivalPriorityAt: new Date("2026-10-01T01:00:00Z") }),
      player("overdue", 3000, { restTurns: 10 }),
    ]) {
      const result = select([...regulars, outlier], { respectPlayerRest });
      expect(result.selection?.selections.flatMap((court) => court.ids), outlier.userId).toContain(outlier.userId);
    }
  });

  it("retains mandatory replacement players and excludes busy and paused players", () => {
    const retained = player("retained", 3000);
    const result = select([
      ...Array.from({ length: 6 }, (_, i) => player(`regular${i}`)), retained,
      player("busy", 1000, { isBusy: true, matchesPlayed: 0, matchmakingBaseline: 0 }),
      player("paused", 1000, { isPaused: true, matchesPlayed: 0, matchmakingBaseline: 0 }),
    ], { lockedPlayerIds: new Set([retained.userId]) });
    const ids = result.selection?.selections.flatMap((court) => court.ids);
    expect(ids).toHaveLength(4);
    expect(ids).toContain(retained.userId);
    expect(ids).not.toContain("busy");
    expect(ids).not.toContain("paused");
  });

  it("uses ordinary rest only after quality ties, and disables that preference when requested", () => {
    const recent = quartet("recent", [1000, 1000, 1000, 1000]);
    const rested = quartet("rested", [1000, 1000, 1000, 1000]).map((p) => ({ ...p, restTurns: 1 }));
    const schedules = [{ rank: 0, courts: [allowQuartets(recent, rested)] }];
    function run(respectPlayerRest: boolean, players = [...recent, ...rested]) {
      let randomIndex = 0;
      return select(players, { schedules, respectPlayerRest, randomFn: () => randomIndex++ < 4 ? 0 : 1 });
    }
    expect(run(true).selection?.selections[0].ids.slice().sort()).toEqual(rested.map((p) => p.userId));
    expect(run(false).selection?.selections[0].ids.slice().sort()).toEqual(recent.map((p) => p.userId));
    const widerRested = rested.map((p, index) => ({ ...p, strength: index < 2 ? 990 : 1010 }));
    expect(run(true, [...recent, ...widerRested]).selection?.selections[0].ids.slice().sort()).toEqual(recent.map((p) => p.userId));
  });

  it.each([SessionBalanceMetric.RATING, SessionBalanceMetric.SESSION_POINTS])(
    "matches an exhaustive disjoint two-court oracle with %s", (metric) => {
      const strengths = metric === SessionBalanceMetric.RATING
        ? [900, 930, 970, 1010, 1160, 1190, 1230, 1270]
        : [0, 1, 3, 4, 7, 9, 10, 13];
      const players = strengths.map((strength, i) => player(`P${i}`, strength));
      const result = select(players, { courtCount: 2, levelPolicy: { metric } });
      const chosen = result.selection!;
      expect(chosen.selections).toHaveLength(2);
      expect(new Set(chosen.selections.flatMap((court) => court.ids)).size).toBe(8);
      expect([chosen.maxLadderGap, chosen.totalLadderGap, chosen.maxBalanceGap, chosen.totalBalanceGap])
        .toEqual(exhaustiveTwoCourtOracle(players, metric));
      expect(result.debug.baselineCertified).toBe(true);
    }
  );

  it("keeps legal Mixed teams without preferring a much wider same-side quartet", () => {
    const players = [1000, 1010, 1020, 1030, 2000, 2010, 2020, 2030].map((strength, i) =>
      player(`P${i}`, strength, {
        gender: i % 2 ? PlayerGender.FEMALE : PlayerGender.MALE,
        partnerPreference: i % 2 ? "FEMALE_FLEX" : "OPEN",
      })
    );
    const court = select(players, { sessionMode: SessionMode.MIXICANO }).selection!.selections[0];
    expect(court.groupingSummary.maxLadderGap).toBe(30);
    const byId = new Map(players.map((p) => [p.userId, p]));
    for (const team of [court.partition.team1, court.partition.team2]) {
      expect(team.filter((id) => byId.get(id)?.gender === PlayerGender.FEMALE)).toHaveLength(1);
    }
  });

  it("matches the exhaustive nine-player oracle without anchoring a surplus player to a court", () => {
    const players = [player("A-outlier", 3000), ...[900, 930, 970, 1010, 1160, 1190, 1230, 1270]
      .map((strength, i) => player(`P${i}`, strength))];
    const result = select(players, { courtCount: 2 });
    const chosen = result.selection!;
    const ids = chosen.selections.flatMap((court) => court.ids);
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
    expect(ids).not.toContain("A-outlier");
    expect([chosen.maxLadderGap, chosen.totalLadderGap, chosen.maxBalanceGap, chosen.totalBalanceGap])
      .toEqual(exhaustiveTwoCourtOracle(players, SessionBalanceMetric.RATING));
    expect(result.debug.baselineCertified).toBe(true);
  });

  it("honours group composition and hard pairing constraints before level fit", () => {
    const players = [
      ...quartet("A", [1000, 1000, 1000, 1000]).map((p) => ({ ...p, pool: "A" })),
      ...quartet("B", [2000, 2000, 2000, 2000]).map((p) => ({ ...p, pool: "B" })),
    ];
    const constraints: LadderSelectionConstraints = {
      isQuartetAllowed: (quartet) => quartet.filter((p) => p.pool === "A").length === 2,
      normalizePartition: ({ partition, playersById }) =>
        [partition.team1, partition.team2].every((team) => playersById.get(team[0])?.pool !== playersById.get(team[1])?.pool)
          ? partition : null,
    };
    const court = select(players, { schedules: [{ rank: 0, courts: [constraints] }] }).selection!.selections[0];
    expect(court.players.filter((p) => p.pool === "A")).toHaveLength(2);
    expect(court.balanceGap).toBe(0);
    expect(court.groupingSummary.maxLadderGap).toBe(1000);
    for (const team of [court.partition.team1, court.partition.team2]) {
      expect(team.filter((id) => id.startsWith("A"))).toHaveLength(1);
    }
  });

  it("allows explicit alternatives only inside the original frozen fairness and balance envelope", () => {
    const tied = quartet("tie", [1000, 1000, 1000, 1000]);
    const first = select(tied).selection!.selections[0];
    const alternative = select(tied, {
      excludedPartitionKey: getExactPartitionKey(first.partition),
      selectionContext: first.levelContext,
    });
    expect(alternative.selection).not.toBeNull();
    expect(getExactPartitionKey(alternative.selection!.selections[0].partition)).not.toBe(getExactPartitionKey(first.partition));

    const compact = quartet("compact", [1000, 1000, 1000, 1000]);
    const unsafe = quartet("unsafe", [800, 1000, 1000, 1280]);
    const options = { schedules: [{ rank: 0, courts: [allowQuartets(compact, unsafe)] }] };
    const initial = select([...compact, ...unsafe], options).selection!.selections[0];
    const excluded = select([...compact, ...unsafe], {
      ...options,
      excludedQuartetKeys: new Set([quartetKey(initial.ids)]),
      selectionContext: initial.levelContext,
    });
    expect(initial.levelContext).toBeDefined();
    expect(excluded.selection).toBeNull();
  });

  it("returns a controlled search failure without claiming a certified baseline when the budget is exhausted", () => {
    const players = Array.from({ length: 12 }, (_, i) => player(`P${i}`, 900 + i * 70));
    const result = select(players, { courtCount: 2, searchLimits: { maxBranches: 0 } });
    expect(result.selection).toBeNull();
    expect(result.debug.searchLimitReached).toBe(true);
    expect(result.debug.baselineCertified).toBe(false);
  });
});
