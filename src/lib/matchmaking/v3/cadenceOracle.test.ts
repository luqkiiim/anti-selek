import { describe, expect, it } from "vitest";
import { SessionMode, SessionType } from "../../../types/enums";
import { findBestRotationBatchSelection, measureRotationStarvationIntervention } from "./socialBatch";
import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  V3SelectionConstraints,
} from "./types";

type Player = MatchmakerV3Player & { restTurns: number };
type Profile = {
  rank: number;
  courts: Array<V3SelectionConstraints<ActiveMatchmakerV3Player> | undefined>;
};
type OracleCourt = { ids: string[]; minimumBalanceGap: number };
type OracleBatch = {
  ids: string[];
  players: Player[];
  rank: number;
  maximumBalanceGap: number;
  totalBalanceGap: number;
};

const compareWords = (left: readonly number[], right: readonly number[]) => {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    if (a !== b) return a < b ? -1 : 1;
  }
  return 0;
};

// This is an intentionally separate statement of the requested cadence rule:
// first count zero-rest assignments, then maximize each ascending rest value.
function cadenceWord(restTurns: readonly number[]) {
  const ascending = [...restTurns].sort((a, b) => a - b);
  return [ascending.filter((turns) => turns === 0).length, ...ascending.map((turns) => -turns)];
}

function quartetKey(ids: readonly string[]) {
  return [...ids].sort().join("|");
}

function makePlayer(userId: string, overrides: Partial<Player> = {}): Player {
  return {
    userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-01-01T00:00:00Z"),
    strength: 1000,
    restTurns: 0,
    isBusy: false,
    isPaused: false,
    gender: "MALE",
    partnerPreference: "OPEN",
    ...overrides,
  };
}

function makeActivePlayer(player: Player, rank: number): ActiveMatchmakerV3Player {
  return {
    ...player,
    effectiveMatchCount: Math.max(player.matchesPlayed, player.matchmakingBaseline),
    restTurns: player.restTurns,
    randomScore: 0,
    rank,
  };
}

function allowedQuartets(...quartets: string[][]): V3SelectionConstraints<ActiveMatchmakerV3Player> {
  const allowed = new Set(quartets.map(quartetKey));
  return {
    isQuartetAllowed: (players) => allowed.has(quartetKey(players.map((player) => player.userId))),
  };
}

function partitions(ids: readonly string[]) {
  const [a, b, c, d] = ids;
  return [
    { team1: [a, b], team2: [c, d] },
    { team1: [a, c], team2: [b, d] },
    { team1: [a, d], team2: [b, c] },
  ] as const;
}

function isLegalForMode(
  partition: ReturnType<typeof partitions>[number],
  playersById: ReadonlyMap<string, Player>,
  mode: SessionMode
) {
  if (mode !== SessionMode.MIXICANO) return true;
  const lowerCount = (team: readonly string[]) => team.filter((id) => {
    const player = playersById.get(id);
    return player?.gender === "FEMALE" || player?.partnerPreference === "FEMALE_FLEX";
  }).length;
  const left = lowerCount(partition.team1);
  const right = lowerCount(partition.team2);
  // MIXICANO permits both same-side courts and one-per-side doubles.
  return left === right;
}

function minimumBalanceGap(ids: readonly string[], playersById: ReadonlyMap<string, Player>, mode: SessionMode) {
  const validGaps = partitions(ids)
    .filter((partition) => isLegalForMode(partition, playersById, mode))
    .map((partition) => {
      const average = (team: readonly string[]) => team.reduce((sum, id) => sum + playersById.get(id)!.strength, 0) / 2;
      return Math.abs(average(partition.team1) - average(partition.team2));
    });
  return validGaps.length ? Math.min(...validGaps) : null;
}

function choose<T>(items: readonly T[], size: number) {
  const result: T[][] = [];
  const current: T[] = [];
  const visit = (start: number) => {
    if (current.length === size) {
      result.push([...current]);
      return;
    }
    for (let index = start; index <= items.length - (size - current.length); index += 1) {
      current.push(items[index]);
      visit(index + 1);
      current.pop();
    }
  };
  visit(0);
  return result;
}

/** Enumerate the fixture's legal quartets and every disjoint court assignment independently. */
function enumerateOracleBatches(
  players: Player[],
  profiles: Profile[],
  courtCount: number,
  mode: SessionMode
): OracleBatch[] {
  const playersById = new Map(players.map((player) => [player.userId, player]));
  const batches: OracleBatch[] = [];
  for (const profile of profiles) {
    if (profile.courts.length !== courtCount) continue;
    const courts: OracleCourt[][] = profile.courts.map((constraints) =>
      choose(players, 4).flatMap((quartet) => {
        const activeQuartet = quartet.map((player) => makeActivePlayer(player, players.indexOf(player))) as [
          ActiveMatchmakerV3Player, ActiveMatchmakerV3Player,
          ActiveMatchmakerV3Player, ActiveMatchmakerV3Player,
        ];
        if (constraints?.isQuartetAllowed && !constraints.isQuartetAllowed(activeQuartet)) return [];
        const ids = quartet.map((player) => player.userId);
        const gap = minimumBalanceGap(ids, playersById, mode);
        return gap === null ? [] : [{ ids, minimumBalanceGap: gap }];
      })
    );
    const visit = (court: number, chosen: OracleCourt[], used: Set<string>) => {
      if (court === courtCount) {
        const selectedIds = chosen.flatMap((candidate) => candidate.ids);
        const selectedPlayers = selectedIds.map((id) => playersById.get(id)!);
        const gaps = chosen.map((candidate) => candidate.minimumBalanceGap);
        batches.push({
          ids: selectedIds,
          players: selectedPlayers,
          rank: profile.rank,
          maximumBalanceGap: Math.max(...gaps),
          totalBalanceGap: gaps.reduce((sum, gap) => sum + gap, 0),
        });
        return;
      }
      for (const candidate of courts[court]) {
        if (candidate.ids.some((id) => used.has(id))) continue;
        const nextUsed = new Set(used);
        candidate.ids.forEach((id) => nextUsed.add(id));
        visit(court + 1, [...chosen, candidate], nextUsed);
      }
    };
    visit(0, [], new Set());
  }
  return batches;
}

function arrivalTime(player: Player) {
  if (!player.arrivalPriorityAt) return null;
  const value = player.arrivalPriorityAt instanceof Date
    ? player.arrivalPriorityAt.getTime()
    : new Date(player.arrivalPriorityAt).getTime();
  return Number.isFinite(value) ? value : null;
}

function fairnessAndArrivalWord(players: readonly Player[]) {
  const counts = players.map((player) => Math.max(player.matchesPlayed, player.matchmakingBaseline)).sort((a, b) => a - b);
  const arrivals = players.map(arrivalTime).filter((value): value is number => value !== null).sort((a, b) => a - b);
  const word = [...counts, -arrivals.length, ...arrivals];
  while (word.length < players.length * 2 + 1) word.push(Number.POSITIVE_INFINITY);
  return word;
}

function starvationWord(batch: OracleBatch, roster: readonly Player[], rotationPlayerCount: number) {
  const idealRestGap = Math.max(0, Math.ceil((rotationPlayerCount - 4) / 4));
  const selected = new Set(batch.ids);
  const leftOut = roster.filter((player) => player.restTurns > idealRestGap && !selected.has(player.userId));
  return [leftOut.length, leftOut.length ? Math.max(...leftOut.map((player) => player.restTurns)) : 0,
    leftOut.reduce((sum, player) => sum + player.restTurns, 0)];
}

function compareRotationClass(
  left: OracleBatch,
  right: OracleBatch,
  roster: readonly Player[],
  rotationPlayerCount: number
) {
  return compareWords(fairnessAndArrivalWord(left.players), fairnessAndArrivalWord(right.players)) ||
    left.rank - right.rank ||
    compareWords(starvationWord(left, roster, rotationPlayerCount), starvationWord(right, roster, rotationPlayerCount));
}

function oracleBestBatch(
  batches: OracleBatch[],
  roster: Player[],
  rotationPlayerCount: number,
  sessionType: SessionType,
  balanceWindow = 0
) {
  const rotationSorted = [...batches].sort((left, right) => compareRotationClass(left, right, roster, rotationPlayerCount));
  const bestRotation = rotationSorted[0];
  if (!bestRotation) throw new Error("Oracle fixture has no legal batches");
  let admissible = rotationSorted.filter((candidate) => compareRotationClass(candidate, bestRotation, roster, rotationPlayerCount) === 0);
  if (sessionType === SessionType.POINTS || sessionType === SessionType.ELO) {
    const bestGap = Math.min(...admissible.map((candidate) => candidate.maximumBalanceGap));
    const ceiling = sessionType === SessionType.ELO ? 50 : Number.POSITIVE_INFINITY;
    const allowedGap = bestGap <= ceiling ? Math.min(bestGap + balanceWindow, ceiling) : bestGap;
    admissible = admissible.filter((candidate) => candidate.maximumBalanceGap <= allowedGap);
  }
  return [...admissible].sort((left, right) => compareWords(
    cadenceWord(left.players.map((player) => player.restTurns)),
    cadenceWord(right.players.map((player) => player.restTurns))
  ))[0];
}

function selectedIds(result: ReturnType<typeof findBestRotationBatchSelection>) {
  return result.selection?.selections.flatMap((selection) => selection.ids).sort() ?? [];
}

function selectedLayouts(result: ReturnType<typeof findBestRotationBatchSelection>) {
  return result.selection?.selections.map((selection) => {
    const teamKey = (team: readonly string[]) => [...team].sort().join("+");
    return {
      ids: [...selection.ids].sort(),
      teams: [teamKey(selection.partition.team1), teamKey(selection.partition.team2)].sort(),
    };
  }) ?? [];
}

const rotationTypes = [
  SessionType.SOCIAL_MIX,
  SessionType.POINTS,
  SessionType.ELO,
] as const;

describe("independent cadence oracle", () => {
  it("ranks the two documented rest examples by cadence, not total rest", () => {
    expect(compareWords(cadenceWord([0, 3, 3, 3]), cadenceWord([1, 1, 2, 2]))).toBeGreaterThan(0);
    expect(compareWords(cadenceWord([1, 1, 4, 4]), cadenceWord([1, 2, 2, 2]))).toBeGreaterThan(0);
  });

  it.each(rotationTypes)("matches a brute-force two-court oracle for %s in both court modes", (sessionType) => {
    const p = ["p0", "p1", "p2", "p3"];
    const q = ["q0", "q1", "q2", "q3"];
    const r = ["q0", "r1", "r2", "r3"];
    const s = ["p0", "s1", "s2", "s3"];
    const restById: Record<string, number> = {
      p0: 1, p1: 0, p2: 0, p3: 0,
      q0: 1, q1: 2, q2: 2, q3: 2,
      r1: 1, r2: 1, r3: 1,
      s1: 2, s2: 2, s3: 2,
    };
    // This 14-player roster is 7+7. Each permitted quartet has two players
    // from each side, so the oracle can also verify the Mixed legality path.
    const femaleIds = new Set(["p0", "p3", "q2", "q3", "r2", "r3", "s3"]);
    const players = Object.keys(restById).map((userId) => makePlayer(userId, {
      restTurns: restById[userId],
      gender: femaleIds.has(userId) ? "FEMALE" : "MALE",
      partnerPreference: femaleIds.has(userId) ? "FEMALE_FLEX" : "OPEN",
    }));
    const profiles: Profile[] = [{
      rank: 0,
      courts: [allowedQuartets(p, q), allowedQuartets(r, s)],
    }];
    const expectedFor = (mode: SessionMode) => {
      const batches = enumerateOracleBatches(players, profiles, 2, mode);
      expect(batches).toHaveLength(2);
      const expected = oracleBestBatch(batches, players, 14, sessionType);
      expect(expected).toBeDefined();
      return expected!.ids.sort();
    };

    for (const mode of [SessionMode.MEXICANO, SessionMode.MIXICANO]) {
      const profilesForMode = profiles;
      const oracle = expectedFor(mode);
      const result = findBestRotationBatchSelection(players, {
        courtCount: 2,
        sessionMode: mode,
        sessionType,
        rotationPlayerCount: 14,
        schedules: profilesForMode,
        randomFn: () => 0,
      });
      expect(result.selection).not.toBeNull();
      expect(selectedIds(result)).toEqual(oracle);
      expect(result.selection?.selections).toHaveLength(2);
      expect(result.selection?.selections.flatMap((selection) => selection.players).filter((player) => player.restTurns === 0)).toHaveLength(0);
    }
  });

  it.each(rotationTypes)("matches the brute-force 3-court oracle through the cadence-bound DFS for %s", (sessionType) => {
    const a0 = ["a0", "a1", "a2", "a3"];
    const a1 = ["b0", "b1", "b2", "b3"];
    const a2 = ["c0", "c1", "c2", "c3"];
    // Each B court is disjoint from its same-index A court and overlaps each
    // other A court. This leaves exactly the all-A and all-B legal batches.
    const b0 = ["b0", "b1", "c0", "x"];
    const b1 = ["a0", "a1", "c1", "c2"];
    const b2 = ["a2", "a3", "b2", "y"];
    const restById: Record<string, number> = {
      a0: 1, a1: 1, a2: 1, a3: 1,
      b0: 1, b1: 1, b2: 1, b3: 0,
      c0: 1, c1: 1, c2: 1, c3: 0,
      x: 2, y: 2,
    };
    const players = Object.keys(restById).map((userId) => makePlayer(userId, { restTurns: restById[userId] }));
    const profile: Profile = {
      rank: 0,
      courts: [allowedQuartets(a0, b0), allowedQuartets(a1, b1), allowedQuartets(a2, b2)],
    };
    const legalBatches = enumerateOracleBatches(players, [profile], 3, SessionMode.MEXICANO);
    expect(legalBatches).toHaveLength(2);
    const expected = oracleBestBatch(legalBatches, players, 14, sessionType);
    expect(expected!.ids).toContain("x");
    expect(expected!.ids).toContain("y");

    const result = findBestRotationBatchSelection(players, {
      courtCount: 3,
      sessionMode: SessionMode.MEXICANO,
      sessionType,
      rotationPlayerCount: 14,
      schedules: [profile],
      searchLimits: { maxBranches: 50_000, maxMs: 30_000 },
      randomFn: () => 0,
    });
    expect(result.selection).not.toBeNull();
    expect(result.varietyOptimal).toBe(true);
    expect(selectedIds(result)).toEqual(expected!.ids.sort());
  });

  it.each(rotationTypes)("chooses a smoother all-MIXED batch ahead of an equally fair OWN_SIDE batch for %s", (sessionType) => {
    const mixedLeft = ["m0", "m1", "f0", "f1"];
    const mixedRight = ["m2", "m3", "f2", "f3"];
    const ownMen = ["m0", "m2", "m4", "m5"];
    const ownWomen = ["f0", "f2", "f4", "f5"];
    const rest3 = new Set([...mixedLeft, ...mixedRight]);
    const players = [
      ...Array.from({ length: 7 }, (_value, index) => makePlayer(`m${index}`, {
        gender: "MALE", restTurns: rest3.has(`m${index}`) ? 3 : ownMen.includes(`m${index}`) ? 2 : 1,
      })),
      ...Array.from({ length: 7 }, (_value, index) => makePlayer(`f${index}`, {
        gender: "FEMALE", partnerPreference: "FEMALE_FLEX",
        restTurns: rest3.has(`f${index}`) ? 3 : ownWomen.includes(`f${index}`) ? 2 : 1,
      })),
    ];
    const profile: Profile = {
      rank: 0,
      courts: [allowedQuartets(mixedLeft, ownMen), allowedQuartets(mixedRight, ownWomen)],
    };
    const batches = enumerateOracleBatches(players, [profile], 2, SessionMode.MIXICANO);
    expect(batches).toHaveLength(2);
    const oracle = oracleBestBatch(batches, players, 14, sessionType);
    expect(oracle!.ids.sort()).toEqual([...mixedLeft, ...mixedRight].sort());
    expect(cadenceWord(oracle!.players.map((player) => player.restTurns))).toEqual([0, ...Array(8).fill(-3)]);

    const result = findBestRotationBatchSelection(players, {
      courtCount: 2,
      sessionMode: SessionMode.MIXICANO,
      sessionType,
      rotationPlayerCount: 14,
      schedules: [profile],
      randomFn: () => 0,
    });
    expect(selectedIds(result)).toEqual(oracle!.ids.sort());
    expect(result.selection?.selections.map((selection) => selection.socialVariety?.courtType)).toEqual(["MIXED", "MIXED"]);
  });

  it.each(rotationTypes)("keeps count fairness ahead of rest smoothing and starvation for %s", (sessionType) => {
    const ids = ["A0", "A1", "A2", "A3", "B0", "B1", "B2", "B3"];
    const players = ids.map((userId, index) => makePlayer(userId, {
      matchesPlayed: index < 4 || index < 7 ? 5 : 6,
      // The count-fair quartet has zero rest; the worse fairness class has
      // substantially more rest and crosses the safety-net threshold.
      restTurns: index < 4 ? 0 : 5,
    }));
    const allowed = allowedQuartets(ids.slice(0, 4), ids.slice(4));
    const profile: Profile = { rank: 0, courts: [allowed] };
    const oracle = oracleBestBatch(enumerateOracleBatches(players, [profile], 1, SessionMode.MEXICANO), players, 14, sessionType);
    const result = findBestRotationBatchSelection(players, {
      courtCount: 1, sessionMode: SessionMode.MEXICANO, sessionType,
      rotationPlayerCount: 14, schedules: [profile], randomFn: () => 0,
    });
    expect(oracle!.ids.sort()).toEqual(ids.slice(0, 4).sort());
    expect(selectedIds(result)).toEqual(oracle!.ids.sort());
  });

  it("lets the existing Balanced envelope reject a smoother but out-of-envelope group", () => {
    for (const sessionType of [SessionType.POINTS, SessionType.ELO]) {
      const a = ["A0", "A1", "A2", "A3"];
      const b = ["B0", "B1", "B2", "B3"];
      const players = [
        ...a.map((userId) => makePlayer(userId, { restTurns: 0 })),
        ...b.map((userId, index) => makePlayer(userId, {
          restTurns: 3,
          strength: [900, 900, 900, 1100][index],
        })),
      ];
      const profile: Profile = { rank: 0, courts: [allowedQuartets(a, b)] };
      const oracle = oracleBestBatch(enumerateOracleBatches(players, [profile], 1, SessionMode.MEXICANO), players, 14, sessionType, 0);
      const result = findBestRotationBatchSelection(players, {
        courtCount: 1, sessionMode: SessionMode.MEXICANO, sessionType,
        rotationPlayerCount: 14, schedules: [profile],
        balanceGuardrailPolicy: { nearBestWindow: 0 }, randomFn: () => 0,
      });
      expect(oracle!.ids.sort()).toEqual(a.sort());
      expect(selectedIds(result)).toEqual(oracle!.ids.sort());
      expect(result.selection?.maxBalanceGap).toBe(result.selection?.balanceGuardrail?.bestMaxBalanceGap);
      expect(result.selection?.maxBalanceGap).toBeLessThanOrEqual(result.selection?.balanceGuardrail?.allowedMaxBalanceGap ?? -1);
    }
  });

  it.each(rotationTypes)("counts starvation only when it changes the selected set for %s", (sessionType) => {
    const overdue = ["A0", "A1", "A2", "A3"];
    const rested = ["B0", "B1", "B2", "B3"];
    const players = [
      ...overdue.map((userId, index) => makePlayer(userId, { restTurns: index === 0 ? 4 : 0 })),
      ...rested.map((userId) => makePlayer(userId, { restTurns: 3 })),
    ];
    const profile: Profile = { rank: 0, courts: [allowedQuartets(overdue, rested)] };
    const measured = measureRotationStarvationIntervention(players, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType,
      rotationPlayerCount: 14,
      schedules: [profile],
      randomFn: () => 0,
    });
    expect(measured.measurementComplete).toBe(true);
    expect(measured.selectedSetChanged).toBe(true);
    expect(selectedIds(measured.production)).toEqual(overdue.sort());
    expect(selectedIds(measured.withoutStarvation)).toEqual(rested.sort());
  });

  it.each(rotationTypes)("reports no starvation intervention when every available player is mandatory by batch size for %s", (sessionType) => {
    const onlyLegalCourt = ["P0", "P1", "P2", "P3"];
    const players = onlyLegalCourt.map((userId, index) => makePlayer(userId, { restTurns: index === 0 ? 4 : 0 }));
    const profile: Profile = { rank: 0, courts: [allowedQuartets(onlyLegalCourt)] };
    const measured = measureRotationStarvationIntervention(players, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType,
      rotationPlayerCount: 14,
      schedules: [profile],
      randomFn: () => 0,
    });
    expect(measured.measurementComplete).toBe(true);
    expect(selectedIds(measured.production)).toEqual(onlyLegalCourt);
    expect(selectedIds(measured.withoutStarvation)).toEqual(onlyLegalCourt);
    expect(measured.selectedSetChanged).toBe(false);
  });

  it("marks starvation diagnostics unknown when either search cannot certify", () => {
    const ids = ["U0", "U1", "U2", "U3"];
    const players = ids.map((userId, index) => makePlayer(userId, { restTurns: index === 0 ? 4 : 0 }));
    const profile: Profile = { rank: 0, courts: [allowedQuartets(ids)] };
    const measured = measureRotationStarvationIntervention(players, {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      rotationPlayerCount: 14,
      schedules: [profile],
      searchLimits: { maxBranches: 0, maxMs: 30_000 },
      randomFn: () => 0,
    });
    expect(measured.measurementComplete).toBe(false);
    expect(measured.selectedSetChanged).toBeNull();
  });

  it("replays identical random draws without perturbing the production RNG stream", () => {
    const overdue = ["A0", "A1", "A2", "A3"];
    const rested = ["B0", "B1", "B2", "B3"];
    const players = [
      ...overdue.map((userId, index) => makePlayer(userId, { restTurns: index === 0 ? 4 : 0 })),
      ...rested.map((userId) => makePlayer(userId, { restTurns: 3 })),
    ];
    const profile: Profile = { rank: 0, courts: [allowedQuartets(overdue, rested)] };
    const options = {
      courtCount: 1,
      sessionMode: SessionMode.MEXICANO,
      sessionType: SessionType.SOCIAL_MIX,
      rotationPlayerCount: 14,
      schedules: [profile],
    };
    const makeRandom = () => {
      let value = 104729;
      let calls = 0;
      return {
        randomFn: () => {
          calls += 1;
          value = value * 48271 % 2147483647;
          return value / 2147483647;
        },
        calls: () => calls,
      };
    };
    const measuredRandom = makeRandom();
    const measured = measureRotationStarvationIntervention(players, { ...options, randomFn: measuredRandom.randomFn });
    const directRandom = makeRandom();
    const direct = findBestRotationBatchSelection(players, { ...options, randomFn: directRandom.randomFn });
    expect(measured.measurementComplete).toBe(true);
    expect(selectedLayouts(measured.production)).toEqual(selectedLayouts(direct));
    expect(measuredRandom.calls()).toBe(directRandom.calls());
  });
});
