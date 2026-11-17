import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { createHash } from "node:crypto";
import { getDoublesPartitions, isValidPartitionForMode } from "./balance";
import { SessionMode } from "../../../types/enums";
import { buildSocialVarietySnapshot } from "./socialVariety";
import {
  checkMatchmakingSearchBudget,
  type MatchmakingSearchBudget,
} from "./searchBudget";
import type {
  ActiveMatchmakerV3Player,
  MatchmakerV3Player,
  SocialHistoryMatch,
  V3DoublesPartition,
  V3SelectionConstraints,
} from "./types";

export const MATCH_CATEGORIES = ["UPPER", "MIXED", "LOWER"] as const;
export type MatchCategory = (typeof MATCH_CATEGORIES)[number];
export type MatchTypeShares = Record<MatchCategory, number>;
export interface BalancedMatchTypeSnapshot {
  version: 1;
  group: string;
  category: MatchCategory;
  target: MatchTypeShares;
  mixedTargetByPlayer: Record<string, number>;
  basis?: { roster: string; commitments: string; policy?: string };
}
export interface BalancedMatchTypeSelectionProof {
  score: [number, number];
  certified: boolean;
  minimumReplay?: {
    error: number;
    partitions: V3DoublesPartition[];
    scheduleIndex: number;
  } | null;
  rescue?: boolean;
}
interface Pattern {
  category: MatchCategory;
  upperA: number;
  upperB: number;
  cells?: Record<string, number>;
}
interface Target {
  shares: MatchTypeShares;
  mixedByCell: Map<string, number>;
  reason: string | null;
}
interface Ledger {
  expected: MatchTypeShares;
  actual: MatchTypeShares;
  count: number;
}
const emptyShares = (): MatchTypeShares => ({ UPPER: 0, MIXED: 0, LOWER: 0 });
const poolOf = (player: MatchmakerV3Player) =>
  player.pool === "B" ? "B" : "A";
const cellOf = (player: MatchmakerV3Player, groups = true, clubs = false) =>
  `${groups ? poolOf(player) : "A"}:${clubs ? `${player.representingClubId ?? "unassigned"}:` : ""}${getEffectiveMixedSide(player)}`;
const idsOf = (partition: V3DoublesPartition) => [
  ...partition.team1,
  ...partition.team2,
];
const bucket = (value: number) => Math.round(value * 1e12) / 1e12;

export function getBalancedMatchTypePolicyKey(settings: {
  sessionType: string;
  sessionMode: string;
  respectPlayerRest?: boolean;
  groups?: boolean;
  clubs?: boolean;
  crossoverFrequency?: string | null;
}) {
  const groups = Boolean(settings.groups && !settings.clubs);
  return JSON.stringify([
    settings.sessionType,
    settings.sessionMode,
    settings.respectPlayerRest !== false,
    groups,
    settings.clubs ?? false,
    groups ? (settings.crossoverFrequency ?? "BALANCED") : null,
  ]);
}

export function getBalancedMatchTypeBasis(
  players: readonly MatchmakerV3Player[],
  history: readonly SocialHistoryMatch[],
  groups: boolean,
  policy?: string,
) {
  const digest = (rows: string[]) =>
    createHash("sha256").update(JSON.stringify(rows.sort())).digest("hex");
  const roster = digest(
    players.map((player) =>
      JSON.stringify([
        player.userId,
        getEffectiveMixedSide(player),
        groups ? poolOf(player) : null,
        player.isPaused ?? false,
        (player as MatchmakerV3Player & { representingClubId?: string | null })
          .representingClubId ?? null,
      ]),
    ),
  );
  const commitments = digest(
    history.map((match) =>
      JSON.stringify([
        match.team1,
        match.team2,
        match.completedAt ? new Date(match.completedAt).toISOString() : null,
        match.socialVariety ?? null,
        match.balancedMatchType
          ? [
              match.balancedMatchType.group,
              match.balancedMatchType.category,
              match.balancedMatchType.target,
              Object.entries(match.balancedMatchType.mixedTargetByPlayer).sort(
                ([a], [b]) => a.localeCompare(b),
              ),
            ]
          : null,
      ]),
    ),
  );
  return { roster, commitments, ...(policy ? { policy } : {}) };
}

/** Maximum three-category entropy subject to proportional Higher/Lower places. */
export function getBalancedMatchTypeTarget(
  upper: number,
  lower: number,
): MatchTypeShares | null {
  if (
    !Number.isInteger(upper) ||
    !Number.isInteger(lower) ||
    upper < 0 ||
    lower < 0
  )
    return null;
  const count = upper + lower;
  if (count < 4) return null;
  const p = upper / count;
  let mixed = (Math.sqrt(1 + 12 * p * (1 - p)) - 1) / 3;
  if (upper < 4 && lower < 4) {
    if (upper !== lower || upper < 2) return null;
    mixed = 1;
  } else if (upper < 4) mixed = 2 * p;
  else if (lower < 4) mixed = 2 * (1 - p);
  if (mixed > 0 && (upper < 2 || lower < 2)) return null;
  return {
    UPPER: Math.max(0, p - mixed / 2),
    MIXED: mixed,
    LOWER: Math.max(0, 1 - p - mixed / 2),
  };
}

/** Solve a small overdetermined system and reject inconsistent or negative weights. */
function solveWeights(
  columns: number[][],
  expected: number[],
): number[] | null {
  const width = columns.length;
  const rows = expected.map((value, index) => [
    ...columns.map((column) => column[index]),
    value,
  ]);
  let pivot = 0;
  for (let column = 0; column < width; column++) {
    const next = rows.findIndex(
      (row, index) => index >= pivot && Math.abs(row[column]) > 1e-10,
    );
    if (next < 0) return null;
    [rows[pivot], rows[next]] = [rows[next], rows[pivot]];
    const divisor = rows[pivot][column];
    rows[pivot] = rows[pivot].map((value) => value / divisor);
    for (let row = 0; row < rows.length; row++)
      if (row !== pivot) {
        const multiplier = rows[row][column];
        rows[row] = rows[row].map(
          (value, index) => value - multiplier * rows[pivot][index],
        );
      }
    pivot++;
  }
  if (rows.slice(pivot).some((row) => Math.abs(row[width]) > 1e-8)) return null;
  const weights = rows.slice(0, width).map((row) => row[width]);
  return weights.some((value) => value < -1e-8)
    ? null
    : weights.map((value) => Math.max(0, value));
}

function constrainedTarget(
  patterns: Pattern[],
  seatsA: number,
  players: readonly MatchmakerV3Player[],
  grouped: boolean,
  clubs: boolean,
  searchBudget?: MatchmakingSearchBudget,
): Target {
  const poolA = players.filter((player) => !grouped || poolOf(player) === "A");
  const poolB = grouped
    ? players.filter((player) => poolOf(player) === "B")
    : [];
  const upperA = poolA.filter(
    (player) => getEffectiveMixedSide(player) === "UPPER",
  ).length;
  const upperB = poolB.filter(
    (player) => getEffectiveMixedSide(player) === "UPPER",
  ).length;
  if (!grouped && !clubs) {
    const shares = getBalancedMatchTypeTarget(upperA, poolA.length - upperA);
    if (
      shares &&
      MATCH_CATEGORIES.every(
        (category) =>
          shares[category] === 0 ||
          patterns.some((pattern) => pattern.category === category),
      )
    ) {
      return {
        shares,
        reason: null,
        mixedByCell: new Map([
          [
            "A:UPPER",
            upperA
              ? Math.min(1, (shares.MIXED * poolA.length) / (2 * upperA))
              : 0,
          ],
          [
            "A:LOWER",
            poolA.length > upperA
              ? Math.min(
                  1,
                  (shares.MIXED * poolA.length) / (2 * (poolA.length - upperA)),
                )
              : 0,
          ],
        ]),
      };
    }
  }
  const wantedA = seatsA ? (seatsA * upperA) / poolA.length : 0;
  const wantedB = seatsA < 4 ? ((4 - seatsA) * upperB) / poolB.length : 0;
  const cohortCounts = new Map<string, number>();
  if (clubs)
    for (const player of players) {
      const key = cellOf(player, grouped, true);
      cohortCounts.set(key, (cohortCounts.get(key) ?? 0) + 1);
    }
  const cohortKeys = [...cohortCounts.keys()].sort();
  const cohortExpected = cohortKeys.map((key) => {
    const inA = key.startsWith("A:");
    const count = grouped
      ? inA
        ? poolA.length
        : poolB.length
      : players.length;
    const seats = grouped ? (inA ? seatsA : 4 - seatsA) : 4;
    return count ? (seats * cohortCounts.get(key)!) / count : 0;
  });
  const expected = clubs ? [1, ...cohortExpected] : [1, wantedA, wantedB];
  const vertices: Array<{ mixed: number; weights: number[] }> = [];
  const visit = (indexes: number[], first: number) => {
    checkMatchmakingSearchBudget(searchBudget);
    if (indexes.length) {
      const weights = solveWeights(
        indexes.map((index) =>
          clubs
            ? [1, ...cohortKeys.map((key) => patterns[index].cells?.[key] ?? 0)]
            : [1, patterns[index].upperA, patterns[index].upperB],
        ),
        expected,
      );
      if (weights) {
        const full = patterns.map(() => 0);
        indexes.forEach((index, i) => {
          full[index] = weights[i];
        });
        vertices.push({
          mixed: full.reduce(
            (sum, weight, index) =>
              sum + (patterns[index].category === "MIXED" ? weight : 0),
            0,
          ),
          weights: full,
        });
      }
    }
    if (indexes.length === Math.min(expected.length, patterns.length)) return;
    for (let index = first; index < patterns.length; index++)
      visit([...indexes, index], index + 1);
  };
  visit([], 0);
  if (!vertices.length || !Number.isFinite(wantedA + wantedB)) {
    return {
      shares: emptyShares(),
      mixedByCell: new Map(),
      reason: "NO_FAIR_STRUCTURAL_DISTRIBUTION",
    };
  }
  vertices.sort((a, b) => a.mixed - b.mixed);
  const min = vertices[0],
    max = vertices[vertices.length - 1];
  const p = (wantedA + wantedB) / 4;
  const unconstrained = (Math.sqrt(1 + 12 * p * (1 - p)) - 1) / 3;
  const mixed = Math.max(
    0,
    Math.min(1, max.mixed, Math.max(min.mixed, unconstrained)),
  );
  const fraction =
    max.mixed - min.mixed > 1e-10
      ? (mixed - min.mixed) / (max.mixed - min.mixed)
      : 0;
  const weights = min.weights.map(
    (weight, index) => weight * (1 - fraction) + max.weights[index] * fraction,
  );
  const mixedByCell = new Map<string, number>();
  if (clubs)
    cohortKeys.forEach((key, cellIndex) => {
      const mixedPlaces = weights.reduce(
        (sum, weight, index) =>
          sum +
          (patterns[index].category === "MIXED"
            ? weight * (patterns[index].cells?.[key] ?? 0)
            : 0),
        0,
      );
      mixedByCell.set(
        key,
        cohortExpected[cellIndex]
          ? Math.min(1, Math.max(0, mixedPlaces / cohortExpected[cellIndex]))
          : 0,
      );
    });
  else
    for (const [pool, seats, wanted] of [
      ["A", seatsA, wantedA],
      ["B", 4 - seatsA, wantedB],
    ] as const) {
      const mixedUpper = weights.reduce(
        (sum, weight, index) =>
          sum +
          (patterns[index].category === "MIXED"
            ? weight *
              (pool === "A" ? patterns[index].upperA : patterns[index].upperB)
            : 0),
        0,
      );
      const mixedLower = weights.reduce(
        (sum, weight, index) =>
          sum +
          (patterns[index].category === "MIXED"
            ? weight *
              (seats -
                (pool === "A"
                  ? patterns[index].upperA
                  : patterns[index].upperB))
            : 0),
        0,
      );
      mixedByCell.set(
        `${pool}:UPPER`,
        wanted ? Math.min(1, Math.max(0, mixedUpper / wanted)) : 0,
      );
      mixedByCell.set(
        `${pool}:LOWER`,
        seats > wanted
          ? Math.min(1, Math.max(0, mixedLower / (seats - wanted)))
          : 0,
      );
    }
  return {
    shares: {
      UPPER: Math.max(0, p - mixed / 2),
      MIXED: mixed,
      LOWER: Math.max(0, 1 - p - mixed / 2),
    },
    mixedByCell,
    reason: null,
  };
}

export function parseBalancedMatchTypeSnapshot(
  value: unknown,
  partition: V3DoublesPartition,
): BalancedMatchTypeSnapshot | null {
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const root = value as Record<string, unknown>;
  const raw = (root.balancedMatchType ??
    root) as Partial<BalancedMatchTypeSnapshot>;
  if (
    raw.version !== 1 ||
    typeof raw.group !== "string" ||
    !MATCH_CATEGORIES.includes(raw.category as MatchCategory) ||
    !raw.target ||
    !raw.mixedTargetByPlayer ||
    typeof raw.mixedTargetByPlayer !== "object"
  )
    return null;
  if (
    MATCH_CATEGORIES.some(
      (category) =>
        !Number.isFinite(raw.target![category]) ||
        raw.target![category] < 0 ||
        raw.target![category] > 1,
    ) ||
    Math.abs(
      MATCH_CATEGORIES.reduce(
        (sum, category) => sum + raw.target![category],
        0,
      ) - 1,
    ) > 1e-8
  )
    return null;
  const ids = idsOf(partition);
  if (
    new Set(ids).size !== 4 ||
    Object.keys(raw.mixedTargetByPlayer).length !== 4 ||
    ids.some(
      (id) =>
        !Number.isFinite(raw.mixedTargetByPlayer![id]) ||
        raw.mixedTargetByPlayer![id] < 0 ||
        raw.mixedTargetByPlayer![id] > 1,
    )
  )
    return null;
  if (
    raw.basis &&
    (typeof raw.basis.roster !== "string" ||
      typeof raw.basis.commitments !== "string" ||
      (raw.basis.policy !== undefined && typeof raw.basis.policy !== "string"))
  )
    return null;
  return {
    version: 1,
    group: raw.group,
    category: raw.category as MatchCategory,
    target: { ...raw.target },
    mixedTargetByPlayer: { ...raw.mixedTargetByPlayer },
    ...(raw.basis ? { basis: { ...raw.basis } } : {}),
  };
}

/** Request-local targets and reversible ledgers derived from current assignment rows. */
export function buildBalancedMatchTypeContext<T extends MatchmakerV3Player>(
  players: readonly T[],
  history: readonly SocialHistoryMatch[],
  options: {
    groups?: boolean;
    clubs?: boolean;
    constraints?: Array<V3SelectionConstraints<ActiveMatchmakerV3Player<T>>>;
    searchBudget?: MatchmakingSearchBudget;
    policy?: string;
  } = {},
) {
  const groups = options.groups ?? false;
  const structural = players.filter(
    (player) => !player.isPaused && getEffectiveMixedSide(player) !== null,
  );
  const byId = new Map(players.map((player) => [player.userId, player]));
  const basis = getBalancedMatchTypeBasis(
    players,
    history,
    groups,
    options.policy,
  );
  const patterns = new Map<string, Pattern[]>();
  const seats = new Map<string, number>();
  const describe = (partition: V3DoublesPartition) => {
    const ids = idsOf(partition);
    const quartet = ids.map((id) => byId.get(id));
    if (quartet.some((player) => !player)) return null;
    const category = buildSocialVarietySnapshot(
      partition,
      quartet as T[],
    ).courtType;
    const countA = groups
      ? quartet.filter((player) => poolOf(player!) === "A").length
      : 4;
    const mixedGroupTeams = [partition.team1, partition.team2].every(
      (team) => poolOf(byId.get(team[0])!) !== poolOf(byId.get(team[1])!),
    );
    const group = !groups
      ? "session"
      : countA === 4
        ? "pool:A"
        : countA === 0
          ? "pool:B"
          : countA === 2 && mixedGroupTeams
            ? "cross:2"
            : `overflow:${countA}`;
    const upperA = quartet.filter(
      (player) =>
        (!groups || poolOf(player!) === "A") &&
        getEffectiveMixedSide(player!) === "UPPER",
    ).length;
    const upperB = quartet.filter(
      (player) =>
        groups &&
        poolOf(player!) === "B" &&
        getEffectiveMixedSide(player!) === "UPPER",
    ).length;
    const cells: Record<string, number> = {};
    if (options.clubs)
      for (const player of quartet) {
        const key = cellOf(player!, groups, true);
        cells[key] = (cells[key] ?? 0) + 1;
      }
    return {
      group,
      countA,
      category,
      upperA,
      upperB,
      cells: Object.fromEntries(
        Object.entries(cells).sort(([a], [b]) => a.localeCompare(b)),
      ),
    };
  };
  const rules = options.constraints?.length ? options.constraints : [undefined];
  if (!groups && !options.clubs && !options.constraints?.length) {
    const upper = structural.filter(
      (player) => getEffectiveMixedSide(player) === "UPPER",
    ).length;
    const lower = structural.length - upper;
    const possible: Pattern[] = [];
    if (upper >= 4) possible.push({ category: "UPPER", upperA: 4, upperB: 0 });
    if (upper >= 2 && lower >= 2)
      possible.push({ category: "MIXED", upperA: 2, upperB: 0 });
    if (lower >= 4) possible.push({ category: "LOWER", upperA: 0, upperB: 0 });
    patterns.set("session", possible);
    seats.set("session", 4);
  } else
    for (let a = 0; a < structural.length - 3; a++)
      for (let b = a + 1; b < structural.length - 2; b++)
        for (let c = b + 1; c < structural.length - 1; c++)
          for (let d = c + 1; d < structural.length; d++) {
            checkMatchmakingSearchBudget(options.searchBudget);
            const quartet = [
              structural[a],
              structural[b],
              structural[c],
              structural[d],
            ] as [
              ActiveMatchmakerV3Player<T>,
              ActiveMatchmakerV3Player<T>,
              ActiveMatchmakerV3Player<T>,
              ActiveMatchmakerV3Player<T>,
            ];
            const ids = quartet.map((player) => player.userId) as [
              string,
              string,
              string,
              string,
            ];
            for (const rule of rules) {
              if (rule?.isQuartetAllowed && !rule.isQuartetAllowed(quartet))
                continue;
              for (const original of getDoublesPartitions(ids)) {
                const partition = rule?.normalizePartition
                  ? rule.normalizePartition({
                      partition: original,
                      players: quartet,
                      playersById: byId as Map<
                        string,
                        ActiveMatchmakerV3Player<T>
                      >,
                    })
                  : original;
                if (
                  !partition ||
                  idsOf(partition).some((id) => !ids.includes(id)) ||
                  new Set(idsOf(partition)).size !== 4
                )
                  continue;
                const entry = describe(partition);
                if (!entry) continue;
                const existing = patterns.get(entry.group) ?? [];
                patterns.set(entry.group, existing);
                seats.set(entry.group, entry.countA);
                if (
                  !entry.category ||
                  !isValidPartitionForMode(
                    partition,
                    byId,
                    SessionMode.MIXICANO,
                  )
                )
                  continue;
                if (
                  !existing.some(
                    (pattern) =>
                      pattern.category === entry.category &&
                      pattern.upperA === entry.upperA &&
                      pattern.upperB === entry.upperB &&
                      (!options.clubs ||
                        JSON.stringify(pattern.cells) ===
                          JSON.stringify(entry.cells)),
                  )
                )
                  existing.push({ ...entry, category: entry.category });
                patterns.set(entry.group, existing);
                seats.set(entry.group, entry.countA);
              }
            }
          }
  const targets = new Map(
    [...patterns].map(([group, possible]) => [
      group,
      constrainedTarget(
        [...possible].sort(
          (a, b) =>
            a.category.localeCompare(b.category) ||
            a.upperA - b.upperA ||
            a.upperB - b.upperB ||
            JSON.stringify(a.cells ?? {}).localeCompare(
              JSON.stringify(b.cells ?? {}),
            ),
        ),
        seats.get(group)!,
        structural,
        groups,
        options.clubs ?? false,
        options.searchBudget,
      ),
    ]),
  );
  const ledgers = new Map<string, Ledger>();
  const individual = new Map<
    string,
    { expected: number; actual: number; count: number }
  >();
  const seen = new Set<string>();
  for (const match of history) {
    if (match.id && seen.has(match.id)) continue;
    if (match.id) seen.add(match.id);
    const snapshot = parseBalancedMatchTypeSnapshot(
      match.balancedMatchType,
      match,
    );
    if (!snapshot) continue;
    const ledger = ledgers.get(snapshot.group) ?? {
      expected: emptyShares(),
      actual: emptyShares(),
      count: 0,
    };
    for (const category of MATCH_CATEGORIES)
      ledger.expected[category] += snapshot.target[category];
    ledger.actual[snapshot.category]++;
    ledger.count++;
    ledgers.set(snapshot.group, ledger);
    for (const id of idsOf(match)) {
      const current = individual.get(id) ?? {
        expected: 0,
        actual: 0,
        count: 0,
      };
      current.expected += snapshot.mixedTargetByPlayer[id];
      current.actual += snapshot.category === "MIXED" ? 1 : 0;
      current.count++;
      individual.set(id, current);
    }
  }
  const snapshots = new WeakMap<
    V3DoublesPartition,
    BalancedMatchTypeSnapshot | null
  >();
  const snapshot = (
    partition: V3DoublesPartition,
  ): BalancedMatchTypeSnapshot | null => {
    if (snapshots.has(partition)) return snapshots.get(partition)!;
    const description = describe(partition);
    if (!description?.category) return null;
    const target = targets.get(description.group);
    if (!target || target.reason) return null;
    const result: BalancedMatchTypeSnapshot = {
      version: 1,
      group: description.group,
      category: description.category,
      target: target.shares,
      basis,
      mixedTargetByPlayer: Object.fromEntries(
        idsOf(partition).map((id) => {
          const player = byId.get(id)!;
          const cell = cellOf(player, groups, options.clubs);
          return [id, target.mixedByCell.get(cell) ?? 0];
        }),
      ),
    };
    snapshots.set(partition, result);
    return result;
  };
  const individualGains = new WeakMap<V3DoublesPartition, number>();
  const individualGain = (partition: V3DoublesPartition) => {
    const cached = individualGains.get(partition);
    if (cached !== undefined) return cached;
    const entry = snapshot(partition);
    const gain = !entry
      ? 0
      : idsOf(partition).reduce((sum, id) => {
          const before = individual.get(id) ?? {
            expected: 0,
            actual: 0,
            count: 0,
          };
          // A first appearance cannot express an individual's fractional preference.
          // Let the batch distribution and existing lineup quality settle that tie.
          if (before.count === 0) return sum;
          const after =
            before.actual +
            (entry.category === "MIXED" ? 1 : 0) -
            before.expected -
            entry.mixedTargetByPlayer[id];
          return (
            sum +
            (after * after) / (before.count + 1) -
            (before.count
              ? (before.actual - before.expected) ** 2 / before.count
              : 0)
          );
        }, 0);
    individualGains.set(partition, gain);
    return gain;
  };
  const categoryScores = new Map<string, number>();
  const categoryKey = (entries: readonly BalancedMatchTypeSnapshot[]) =>
    entries
      .map((entry) => `${entry.group}/${entry.category}`)
      .sort()
      .join("|");
  const categoryScore = (entries: readonly BalancedMatchTypeSnapshot[]) => {
    const key = categoryKey(entries);
    const cached = categoryScores.get(key);
    if (cached !== undefined) return cached;
    const batch = new Map<string, Ledger>();
    for (const entry of entries) {
      const prior = ledgers.get(entry.group);
      const ledger = batch.get(entry.group) ?? {
        expected: { ...(prior?.expected ?? emptyShares()) },
        actual: { ...(prior?.actual ?? emptyShares()) },
        count: prior?.count ?? 0,
      };
      for (const category of MATCH_CATEGORIES)
        ledger.expected[category] += entry.target[category];
      ledger.actual[entry.category]++;
      ledger.count++;
      batch.set(entry.group, ledger);
    }
    // Include untouched groups, avoiding a preference for leaving an indebted group out of a batch.
    let categoryError = 0;
    for (const group of [
      ...new Set([...ledgers.keys(), ...batch.keys()]),
    ].sort()) {
      const ledger = batch.get(group) ?? ledgers.get(group)!;
      categoryError += MATCH_CATEGORIES.reduce(
        (sum, category) =>
          sum +
          ((ledger.actual[category] - ledger.expected[category]) /
            ledger.count) **
            2,
        0,
      );
    }
    const result = bucket(categoryError);
    categoryScores.set(key, result);
    return result;
  };
  const score = (
    partitions: readonly V3DoublesPartition[],
  ): [number, number] => {
    const entries = partitions.flatMap(
      (partition) => snapshot(partition) ?? [],
    );
    return [
      categoryScore(entries),
      bucket(
        partitions
          .map(individualGain)
          .sort((a, b) => a - b)
          .reduce((sum, value) => sum + value, 0),
      ),
    ];
  };
  const lowerBound = (
    chosen: readonly V3DoublesPartition[],
    remaining: readonly (readonly V3DoublesPartition[])[],
  ): [number, number] => {
    let states: BalancedMatchTypeSnapshot[][] = [
      chosen.flatMap((partition) => snapshot(partition) ?? []),
    ];
    let individualMinimum = chosen.reduce(
      (sum, partition) => sum + individualGain(partition),
      0,
    );
    let nonnegative = chosen.every(
      (partition) => individualGain(partition) >= 0,
    );
    for (const candidates of remaining) {
      checkMatchmakingSearchBudget(options.searchBudget);
      const choices = new Map<string, BalancedMatchTypeSnapshot | null>();
      let minimum = Infinity;
      for (const candidate of candidates) {
        const entry = snapshot(candidate);
        choices.set(
          entry ? `${entry.group}/${entry.category}` : "unclassified",
          entry,
        );
        minimum = Math.min(minimum, individualGain(candidate));
      }
      individualMinimum += minimum;
      nonnegative &&= minimum >= 0;
      // Courts with the same scope/category counts have identical distribution
      // error. Merge their permutations without dropping any attainable count.
      const nextStates = new Map<string, BalancedMatchTypeSnapshot[]>();
      for (const state of states) {
        checkMatchmakingSearchBudget(options.searchBudget);
        for (const entry of choices.values()) {
          const next = entry ? [...state, entry] : state;
          nextStates.set(categoryKey(next), next);
        }
      }
      states = [...nextStates.values()];
    }
    return [
      states.reduce(
        (minimum, state) => Math.min(minimum, categoryScore(state)),
        Infinity,
      ),
      nonnegative && individualMinimum === 0
        ? 0
        : bucket(individualMinimum - 1e-10),
    ];
  };
  return {
    snapshot,
    score,
    lowerBound,
    diagnostics: [...targets].map(([group, target]) => ({
      group,
      target: target.shares,
      reason: target.reason,
    })),
  };
}

export type BalancedMatchTypeContext = ReturnType<
  typeof buildBalancedMatchTypeContext
>;
