import { describe, expect, it } from "vitest";
import { SessionMode, SessionType } from "../../../types/enums";
import { findBestBalancedRecurrenceSelection } from "./balancedRecurrence";
import { findBestRotationBatchSelection } from "./socialBatch";
import {
  findBestBalancedMatureRecurrenceSelection as frozenRecurrence,
  findBestRotationBatchSelection as frozenProduction,
} from "./__tests__/fixtures/balancedRecurrenceExhaustive";
import { createMatchmakingSearchBudget } from "./searchBudget";
import type { MatchmakerV3Player, V3SelectionConstraints } from "./types";

type Shape = "unequal" | "high-lock" | "arrivals" | "fractional" | "equal-tuples" | "unreachable" | "forced-replay-mixed" | "rank-fallback";

function makeFixture(courtCount: 2 | 3, shape: Shape) {
  const required = courtCount * 4;
  const players: MatchmakerV3Player[] = Array.from({ length: required + 2 }, (_, index) => ({
    userId: `P${index + 1}`, matchesPlayed: index < required ? index % 3 === 0 ? 1 : 0 : 8 + index,
    matchmakingBaseline: 0, availableSince: new Date("2026-01-01T00:00:00Z"),
    strength: 1000, pointDiff: index % 3, restTurns: index % 5,
    gender: "MALE", mixedSideOverride: "UPPER", pool: index % 2 === 0 ? "A" : "B",
  }));
  const target = players.slice(0, required).map((player) => player.userId);
  const high = players[required].userId;
  let lockedPlayerIds: Set<string> | undefined;
  if (shape === "high-lock") {
    players[required - 1].matchesPlayed = 4;
    lockedPlayerIds = new Set([players[required - 1].userId]);
  }
  if (shape === "arrivals") {
    players.slice(0, required).forEach((player, index) => {
      player.matchesPlayed = 0;
      player.arrivalPriorityAt = new Date(Date.UTC(2026, 0, 1, 0, index + 1));
    });
    players[required + 1].matchesPlayed = 0;
    players[required + 1].arrivalPriorityAt = new Date("2025-12-31T23:59:00Z");
    target[required - 1] = players[required + 1].userId;
  }
  if (shape === "fractional") {
    const offsets = [0, 0.2, 0.7, 1.4, 0.1, 0.5, 1.3, 2.5, 0.3, 1, 2.1, 4.1, 0.6, 1.9];
    players.forEach((player, index) => { player.strength += offsets[index]; player.pointDiff = index * 0.13; });
  }
  if (shape === "equal-tuples") {
    players.forEach((player) => { player.matchesPlayed = player === players[required] || player === players[required + 1] ? 9 : 0; player.pointDiff = 0; player.restTurns = 1; });
    players[0].strength = 1000.2;
  }
  if (shape === "forced-replay-mixed") {
    players.forEach((player, index) => {
      player.matchesPlayed = index < required ? 0 : 9;
      player.restTurns = index === 0 ? 0 : 1;
      player.gender = index % 2 === 0 ? "MALE" : "FEMALE";
      player.mixedSideOverride = index % 2 === 0 ? "UPPER" : "LOWER";
    });
  }
  if (shape === "unreachable") {
    players.slice(0, required).forEach((player) => { player.matchesPlayed = 0; });
    target[0] = high;
  }
  const a = target.slice(0, 4);
  const b = target.slice(4, 8);
  const c = target.slice(8, 12);
  const other = courtCount === 3 ? c : b;
  const left = [a, [a[0], a[1], other[0], other[1]], [a[0], a[2], other[0], other[2]]];
  const right = [other, [a[2], a[3], other[2], other[3]], [a[1], a[3], other[1], other[3]]];
  const bad = (quartet: string[]) => [players[required + 1].userId, ...quartet.slice(1)];
  const families = courtCount === 3 ? [
    [...left, bad(a)],
    [b, bad(a), bad(b), bad(c), [high, a[0], b[0], c[0]], [high, a[1], b[1], c[1]]],
    [...right, bad(b), bad(c)],
  ] : [
    [...left, bad(a)],
    [...right, bad(a), bad(b), [high, a[0], b[0], b[1]], [high, a[1], b[2], b[3]]],
  ];
  // Include the arrival competitor and an above-cutoff player as real legal
  // alternatives, so they participate in exhaustive search rather than being busy.
  if (shape === "arrivals") {
    const original = players[required - 1].userId;
    families.forEach((family) => family.push(...family.filter((quartet) => quartet.includes(target[required - 1]))
      .map((quartet) => quartet.map((id) => id === target[required - 1] ? original : id))));
  }
  const constraints = families.map((quartets): V3SelectionConstraints => {
    const keys = new Set(quartets.map((ids) => [...ids].sort().join("|")));
    return { isQuartetAllowed: (quartet) => keys.has(quartet.map((player) => player.userId).sort().join("|")) };
  });
  const options = {
    sessionType: SessionType.POINTS as const, sessionMode: SessionMode.MIXICANO,
    courtCount, respectPlayerRest: true, rotationPlayerCount: players.length,
    completedMatches: [], socialStructuralOpportunityConstraints: constraints,
    schedules: shape === "rank-fallback"
      ? [{ rank: 0, courts: Array.from({ length: courtCount }, () => constraints[0]) }, { rank: 1, courts: constraints }]
      : [{ rank: 0, courts: constraints }], lockedPlayerIds,
    pairingRandomMode: "combined" as const,
  };
  return { players, options, high, target };
}

function randomStream(seed: number) {
  let state = seed;
  return () => { state = state * 48271 % 2147483647; return state / 2147483647; };
}

describe("counted multi-court Balanced differential against frozen exhaustive search", () => {
  for (const courtCount of [2, 3] as const) for (const shape of ["unequal", "high-lock", "arrivals", "fractional", "equal-tuples", "unreachable", "forced-replay-mixed", "rank-fallback"] as const) {
    it(`${courtCount} courts / ${shape} preserves baseline, physical layout and subsequent RNG`, () => {
      const fixture = makeFixture(courtCount, shape);
      for (const seed of [1, 4729, 104729]) for (const engine of ["recurrence", "production"] as const) {
        const randomFn = randomStream(seed);
        const oracleRandom = randomStream(seed);
        const actualOptions = { ...fixture.options, randomFn, searchLimits: { maxBranches: 200_000, maxMs: 2_000 }, searchBudget: createMatchmakingSearchBudget() };
        const oracleOptions = { ...fixture.options, randomFn: oracleRandom, searchLimits: { maxBranches: 500_000, maxMs: 10_000 } };
        const actual = engine === "recurrence"
          ? findBestBalancedRecurrenceSelection(fixture.players, { ...actualOptions, recurrencePolicy: "strict-replay-rescue" })
          : findBestRotationBatchSelection(fixture.players, actualOptions);
        const expected = engine === "recurrence"
          ? frozenRecurrence(fixture.players, { ...oracleOptions, recurrencePolicy: "strict-replay-rescue" })
          : frozenProduction(fixture.players, oracleOptions);
        const label = `${engine}/${seed}`;
        expect(expected.selection, label).not.toBeNull();
        expect(expected.debug.searchLimitReached, label).toBe(false);
        expect(actual.debug.searchLimitReached, label).toBe(false);
        expect(actual.balanceCertified, label).toBe(true);
        expect(actual.varietyOptimal, label).toBe(true);
        // Guardrail fields hold the certified baseline max/total gaps; the
        // selected fairness/rank/starvation class is frozen before later ranking.
        for (const key of ["fairnessVector", "schedulingRank", "balanceGuardrail", "leftOutOverduePlayerCount", "highestLeftOutRestTurns", "totalLeftOutRestTurns"] as const) {
          expect(actual.debug[key], `${label}/${key}`).toEqual(expected.debug[key]);
        }
        expect(actual.selection, label).toEqual(expected.selection);
        expect(randomFn(), `${label}/next RNG`).toBe(oracleRandom());
        const selected = actual.selection!.selections.flatMap((court) => court.ids);
        if (shape === "unreachable") {
          // All twelve/eight lowest-count players cannot satisfy the court
          // constraints: retaining this above-global-cutoff player proves the
          // shortcut remains inactive until a global-class witness exists.
          expect(selected, label).toContain(fixture.high);
          expect(actual.selection!.fairnessVector!.slice(0, courtCount * 4).at(-1), label).toBeGreaterThan(0);
        } else {
          expect(selected, label).not.toContain(fixture.high);
        }
        if (shape === "forced-replay-mixed") {
          // The count-optimal roster must include P1, the only zero-rest player.
          // The relaxed full-roster replay bound is zero because higher-count
          // positive-rest alternatives exist, so the exact Rmin proof is needed.
          expect(actual.bestImmediateReplayCount, label).toBe(1);
          expect(expected.bestImmediateReplayCount, label).toBe(1);
          expect(actual.replayCertified, label).toBe(true);
        }
        if (shape === "rank-fallback") {
          // No two quartets from the first physical-court vocabulary are
          // disjoint. The global fairness class is attained only at rank 1;
          // rank/starvation need not attain their relaxed global bounds to
          // exclude a player above the already-proved fairness count cutoff.
          expect(actual.debug.schedulingRank, label).toBe(1);
          expect(actual.selection!.fairnessVector!.slice(0, courtCount * 4).at(-1), label).toBe(1);
        }
        for (const lock of fixture.options.lockedPlayerIds ?? []) expect(selected, label).toContain(lock);
        if (shape === "arrivals") expect(selected, label).toContain(fixture.target.at(-1));
      }
    }, 30_000);
  }
});
