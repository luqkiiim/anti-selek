import { describe, expect, it } from "vitest";

import { PartnerPreference, PlayerGender, SessionMode } from "../../../types/enums";
import {
  buildSocialVarietyContext,
  buildSocialVarietySnapshot,
  getSocialVarietyGains,
  parseSocialVarietySnapshot,
  sumSocialVarietyGains,
  withSocialVarietySnapshot,
} from "./socialVariety";
import type { MatchmakerV3Player, SocialHistoryMatch, V3DoublesPartition } from "./types";

function createRoster(upperCount: number, lowerCount: number): MatchmakerV3Player[] {
  return [
    ...Array.from({ length: upperCount }, (_, index) => ({ userId: `U${index + 1}`, gender: PlayerGender.MALE })),
    ...Array.from({ length: lowerCount }, (_, index) => ({ userId: `L${index + 1}`, gender: PlayerGender.FEMALE })),
  ].map((player) => ({
    ...player,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-10-02T00:00:00Z"),
    strength: 0,
    partnerPreference: player.gender === PlayerGender.FEMALE ? PartnerPreference.FEMALE_FLEX : PartnerPreference.OPEN,
  }));
}

const mixed: V3DoublesPartition = { team1: ["U1", "L1"], team2: ["U2", "L2"] };
const upper: V3DoublesPartition = { team1: ["U1", "U2"], team2: ["U3", "U4"] };
const lower: V3DoublesPartition = { team1: ["L1", "L2"], team2: ["L3", "L4"] };

function histogramEntropy(counts: ReadonlyMap<string, number>, opportunities: ReadonlySet<string>) {
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (total === 0 || opportunities.size < 2) return 0;
  return [...counts.values()].reduce((sum, count) => {
    const probability = count / total;
    return sum - probability * Math.log(probability);
  }, 0) / Math.log(opportunities.size);
}

describe("Social lifetime normalized diversity", () => {
  it("uses the full unpaused roster, including busy players, and freezes its vocabulary", () => {
    const players = createRoster(7, 7);
    players[6].isBusy = true;
    const context = buildSocialVarietyContext(players, [], { sessionMode: SessionMode.MIXICANO });
    const player = context.playersByUserId.get("U1")!;
    expect(player.courtmates.opportunities.size).toBe(13);
    expect(player.partners.opportunities.size).toBe(13);
    expect(player.opponents.opportunities.size).toBe(13);
    expect(player.matchType.opportunities).toEqual(new Set(["MIXED", "OWN_SIDE"]));
    expect(player.partners.opportunities.has("U7")).toBe(true);
    players[6].isPaused = true;
    players[6].mixedSideOverride = "LOWER";
    expect(player.partners.opportunities.has("U7")).toBe(true);
    expect(context.effectiveSideByUserId.get("U7")).toBe("UPPER");
    const changed = buildSocialVarietyContext(players, [], { sessionMode: SessionMode.MIXICANO });
    expect(changed.playersByUserId.get("U1")!.partners.opportunities.size).toBe(12);
  });

  it("excludes impossible same-side partners and type diversity when a side has fewer than four", () => {
    const context = buildSocialVarietyContext(createRoster(3, 7), [], { sessionMode: SessionMode.MIXICANO });
    const player = context.playersByUserId.get("U1")!;
    expect(player.partners.opportunities).toEqual(new Set(Array.from({ length: 7 }, (_, index) => `L${index + 1}`)));
    expect(player.courtmates.opportunities.size).toBe(9);
    expect(player.opponents.opportunities.size).toBe(9);
    expect(player.matchType.opportunities).toEqual(new Set(["MIXED"]));
    expect(getSocialVarietyGains(mixed, context).matchType).toBe(0);
  });

  it("defines structural opportunity constraints as a union independent of busy/rest state", () => {
    const players = createRoster(4, 4).map((player) => ({
      ...player,
      pool: ["U1", "U2", "L1", "L2"].includes(player.userId) ? "A" : "B",
      isBusy: true,
      needsMoreRest: true,
    }));
    const context = buildSocialVarietyContext(players, [], {
      sessionMode: SessionMode.MIXICANO,
      opportunityConstraints: ["A", "B"].map((pool) => ({
        isQuartetAllowed: (quartet) => quartet.every((player) => player.pool === pool && !player.isBusy && !player.needsMoreRest),
      })),
    });
    expect(context.playersByUserId.get("U1")!.partners.opportunities).toEqual(new Set(["L1", "L2"]));
    expect(context.playersByUserId.get("U1")!.courtmates.opportunities).toEqual(new Set(["U2", "L1", "L2"]));
    expect(context.playersByUserId.get("U1")!.matchType.opportunities).toEqual(new Set(["MIXED"]));
    expect(context.playersByUserId.get("U3")!.partners.opportunities).toEqual(new Set(["L3", "L4"]));
  });

  it("has finite, meaningful cold-start gains with no pseudocounts", () => {
    const context = buildSocialVarietyContext(createRoster(7, 7), [], { sessionMode: SessionMode.MIXICANO });
    const gains = getSocialVarietyGains(mixed, context);
    expect(gains.courtmates).toBeCloseTo(4 * Math.log(3) / Math.log(13), 12);
    expect(gains.partners).toBe(0);
    expect(gains.opponents).toBeCloseTo(4 * Math.log(2) / Math.log(13), 12);
    expect(gains.matchType).toBe(0);
    expect(Number.isFinite(sumSocialVarietyGains(gains))).toBe(true);
  });

  it("matches the whole-state entropy change and adds exactly across disjoint courts", () => {
    const players = createRoster(7, 7);
    const history: SocialHistoryMatch[] = [mixed, upper, lower, mixed, upper];
    const before = buildSocialVarietyContext(players, history, { sessionMode: SessionMode.MIXICANO });
    const after = buildSocialVarietyContext(players, [...history, upper, lower], { sessionMode: SessionMode.MIXICANO });
    const expected = { courtmates: 0, partners: 0, opponents: 0, matchType: 0 };
    for (const [id, facets] of before.playersByUserId) {
      const next = after.playersByUserId.get(id)!;
      for (const facet of ["courtmates", "partners", "opponents", "matchType"] as const) {
        expected[facet] += histogramEntropy(next[facet].counts, next[facet].opportunities) - histogramEntropy(facets[facet].counts, facets[facet].opportunities);
      }
    }
    const upperGains = getSocialVarietyGains(upper, before);
    const lowerGains = getSocialVarietyGains(lower, before);
    for (const facet of ["courtmates", "partners", "opponents", "matchType"] as const) {
      expect(upperGains[facet] + lowerGains[facet]).toBeCloseTo(expected[facet], 12);
    }
  });

  it("gives equivalent team/seat permutations exactly equal gains", () => {
    const history = [mixed, upper, lower, mixed, upper, mixed, lower];
    const context = buildSocialVarietyContext(createRoster(7, 7), history, { sessionMode: SessionMode.MIXICANO });
    const expected = getSocialVarietyGains(mixed, context);
    expect(getSocialVarietyGains({ team1: ["L1", "U1"], team2: ["L2", "U2"] }, context)).toEqual(expected);
    expect(getSocialVarietyGains({ team1: ["U2", "L2"], team2: ["L1", "U1"] }, context)).toEqual(expected);
  });

  it("keeps rewarding a neglected type after it has appeared once and at large lifetime counts", () => {
    const players = createRoster(4, 4);
    const history: SocialHistoryMatch[] = [upper, lower];
    const mixedWithOthers: V3DoublesPartition = { team1: ["U3", "L3"], team2: ["U4", "L4"] };
    for (let index = 0; index < 2_000; index += 1) history.push(mixed, mixedWithOthers);
    const context = buildSocialVarietyContext(players, history, { sessionMode: SessionMode.MIXICANO });
    const ownGain = getSocialVarietyGains(upper, context).matchType;
    const mixedGain = getSocialVarietyGains(mixed, context).matchType;
    expect(ownGain).toBeGreaterThan(0);
    expect(mixedGain).toBeLessThan(0);
    expect(ownGain).toBeGreaterThan(mixedGain);
    expect(context.playersByUserId.get("U1")!.matchType.total).toBe(2_001);
  });

  it("preserves tiny meaningful type gains without an absolute late-session cutoff", () => {
    const context = buildSocialVarietyContext(createRoster(4, 4), [], { sessionMode: SessionMode.MIXICANO });
    const mixedCount = 1_000_000_000;
    const playersByUserId = new Map([...context.playersByUserId].map(([id, player]) => [id, {
      ...player,
      matchType: {
        ...player.matchType,
        counts: new Map([["MIXED", mixedCount], ["OWN_SIDE", 1]]),
        total: mixedCount + 1,
        countLogCountSum: mixedCount * Math.log(mixedCount),
      },
    }]));
    const longContext = { ...context, playersByUserId };
    expect(getSocialVarietyGains(upper, longContext).matchType).toBeGreaterThan(0);
    expect(getSocialVarietyGains(mixed, longContext).matchType).toBeLessThan(0);
  });

  it("retains negative gains when repeating a court reduces variety", () => {
    const players = createRoster(4, 4);
    const context = buildSocialVarietyContext(players, [mixed, upper, lower], { sessionMode: SessionMode.MIXICANO });
    expect(getSocialVarietyGains(mixed, context).matchType).toBeLessThan(0);
  });

  it("projects both counts and denominators onto current opportunities and restores returning peers", () => {
    const players = createRoster(4, 4);
    const context = buildSocialVarietyContext(players, [mixed, upper], { sessionMode: SessionMode.MIXICANO });
    expect(context.playersByUserId.get("U1")!.courtmates.total).toBe(6);
    players.find((player) => player.userId === "U4")!.isPaused = true;
    const paused = buildSocialVarietyContext(players, [mixed, upper], { sessionMode: SessionMode.MIXICANO });
    expect(paused.playersByUserId.get("U1")!.courtmates.total).toBe(5);
    expect(paused.playersByUserId.get("U1")!.partners.counts.get("U2")).toBeUndefined();
    players.find((player) => player.userId === "U4")!.isPaused = false;
    const resumed = buildSocialVarietyContext(players, [mixed, upper], { sessionMode: SessionMode.MIXICANO });
    expect(resumed.playersByUserId.get("U1")!.courtmates.total).toBe(6);
    expect(resumed.playersByUserId.get("U1")!.partners.counts.get("U2")).toBe(1);
  });

  it("counts repeated completed layouts but deduplicates the same row identity", () => {
    const context = buildSocialVarietyContext(createRoster(4, 4), [
      { ...mixed, id: "first" }, { ...mixed, id: "first" }, { ...mixed, id: "second" }, mixed,
    ], { sessionMode: SessionMode.MIXICANO });
    expect(context.playersByUserId.get("U1")!.partners.counts.get("L1")).toBe(3);
    expect(context.playersByUserId.get("U1")!.matchType.counts.get("MIXED")).toBe(3);
  });

  it("leaves match-type diversity inactive in Open pairing", () => {
    const context = buildSocialVarietyContext(createRoster(4, 4), [mixed, upper], { sessionMode: SessionMode.MEXICANO });
    expect(context.playersByUserId.get("U1")!.partners.opportunities.size).toBe(7);
    expect(context.playersByUserId.get("U1")!.matchType.opportunities.size).toBe(0);
    expect(getSocialVarietyGains(mixed, context).matchType).toBe(0);
  });
});

describe("Social immutable effective-side history snapshots", () => {
  it("honors explicit and legacy effective-side overrides", () => {
    const players = createRoster(3, 1);
    players.find((player) => player.userId === "L1")!.partnerPreference = PartnerPreference.OPEN;
    const partition: V3DoublesPartition = { team1: ["U1", "L1"], team2: ["U2", "U3"] };
    expect(buildSocialVarietySnapshot(partition, players).courtType).toBe("UPPER");
    players.find((player) => player.userId === "U1")!.mixedSideOverride = "LOWER";
    expect(buildSocialVarietySnapshot(partition, players).courtType).toBeNull();
  });

  it("does not reinterpret a recorded game after side edits", () => {
    const players = createRoster(4, 4);
    const snapshot = buildSocialVarietySnapshot(mixed, players);
    players.find((player) => player.userId === "L1")!.mixedSideOverride = "UPPER";
    const context = buildSocialVarietyContext(players, [{ ...mixed, socialVariety: snapshot }], { sessionMode: SessionMode.MIXICANO });
    expect(context.playersByUserId.get("U1")!.matchType.counts.get("MIXED")).toBe(1);
    expect(buildSocialVarietySnapshot(mixed, players).courtType).toBeNull();
  });

  it("preserves known null classifications rather than substituting current genders", () => {
    const players = createRoster(4, 4);
    const missing = players.map((player) => ({ ...player, gender: PlayerGender.UNSPECIFIED }));
    const snapshot = buildSocialVarietySnapshot(mixed, missing);
    expect(snapshot.courtType).toBeNull();
    expect(parseSocialVarietySnapshot({ socialVariety: snapshot }, mixed)?.courtType).toBeNull();
    const context = buildSocialVarietyContext(players, [{ ...mixed, socialVariety: snapshot }], { sessionMode: SessionMode.MIXICANO });
    expect(context.playersByUserId.get("U1")!.matchType.total).toBe(0);
    expect(context.playersByUserId.get("U1")!.partners.total).toBe(1);
    const legacy = buildSocialVarietyContext(players, [mixed], { sessionMode: SessionMode.MIXICANO });
    expect(legacy.playersByUserId.get("U1")!.matchType.total).toBe(1);
  });

  it("rejects malformed/mismatched metadata and safely adds snapshots to manual or existing reasons", () => {
    const players = createRoster(4, 4);
    const snapshot = buildSocialVarietySnapshot(mixed, players);
    expect(parseSocialVarietySnapshot("broken json", mixed)).toBeNull();
    expect(parseSocialVarietySnapshot(snapshot, upper)).toBeNull();
    expect(parseSocialVarietySnapshot({ ...snapshot, courtType: "UPPER" }, mixed)).toBeNull();
    const manual = withSocialVarietySnapshot(null, mixed, players);
    expect(JSON.parse(manual)).toEqual({ socialVariety: snapshot });
    const original = JSON.stringify({ version: 1, summary: ["Existing reason"], metrics: { balanceGap: 0 } });
    const annotated = withSocialVarietySnapshot(original, mixed, players);
    expect(JSON.parse(annotated).summary).toEqual(["Existing reason"]);
    const formatted = JSON.stringify(JSON.parse(annotated), null, 2);
    players.find((player) => player.userId === "L1")!.mixedSideOverride = "UPPER";
    expect(withSocialVarietySnapshot(formatted, mixed, players)).toBe(formatted);
  });
});
