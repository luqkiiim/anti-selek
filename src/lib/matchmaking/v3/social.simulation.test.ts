import { describe, expect, it } from "vitest";
import { SessionMode, SessionType } from "../../../types/enums";
import { createSimulationPlayers, createSimulationState, playRound } from "./simulation";

function simulate(men: number, women: number, seed: number, matches: number) {
  const players = createSimulationPlayers(men + women, { strengthStep: 0 }).map((player, index) => ({
    ...player,
    gender: index < men ? "MALE" : "FEMALE",
    partnerPreference: index < men ? "OPEN" : "FEMALE_FLEX",
  }));
  const genders = new Map(players.map((player) => [player.userId, player.gender]));
  const state = createSimulationState(players);
  let value = seed;
  const randomFn = () => { value = (value * 48271) % 2147483647; return value / 2147483647; };
  const types: string[] = [];
  const typesByPlayer = new Map(players.map((player) => [player.userId, new Set<string>()]));
  while (types.length < matches) {
    const round = playRound(state, {
      courtCount: 2, sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.SOCIAL_MIX, randomFn,
    });
    expect(round.selections).toHaveLength(2);
    for (const selection of round.selections) {
      const menOnCourt = selection.ids.filter((id) => genders.get(id) === "MALE").length;
      expect([0, 2, 4]).toContain(menOnCourt);
      const type = menOnCourt === 4 ? "MENS" : menOnCourt === 0 ? "WOMENS" : "MIXED";
      types.push(type);
      for (const id of selection.ids) typesByPlayer.get(id)!.add(type);
    }
    const counts = state.players.map((player) => player.matchesPlayed);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);
  }
  return { types, typesByPlayer };
}

describe("ongoing Social Mixed variety", () => {
  it.each([1, 4729, 104729])("keeps all match experiences recurring late in a 400-match session (seed %s)", (seed) => {
    const { types, typesByPlayer } = simulate(7, 7, seed, 400);
    for (const start of [100, 200, 300]) {
      expect(new Set(types.slice(start, start + 100))).toEqual(new Set(["MIXED", "MENS", "WOMENS"]));
    }
    for (const experiences of typesByPlayer.values()) {
      expect(experiences.has("MIXED")).toBe(true);
      expect(experiences.size).toBe(2);
    }
  }, 180_000);

  it("naturally produces more men's doubles with a larger male roster", () => {
    const count = (types: string[]) => types.filter((type) => type === "MENS").length;
    let larger = 0;
    let smaller = 0;
    for (const seed of [1, 4729, 104729]) {
      larger += count(simulate(10, 4, seed, 100).types);
      smaller += count(simulate(4, 4, seed, 100).types);
    }
    expect(larger).toBeGreaterThan(smaller);
  }, 180_000);
});
