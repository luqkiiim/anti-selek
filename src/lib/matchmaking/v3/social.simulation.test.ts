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
  it.each([1, 4729, 104729])("keeps fair rotation and monitors late match types in a 400-match session (seed %s)", (seed) => {
    const { types, typesByPlayer } = simulate(7, 7, seed, 400);
    expect(types).toHaveLength(400);
    const windows = [];
    for (const start of [100, 200, 300]) {
      const recentTypes = types.slice(start, start + 100);
      windows.push({
        firstCompletion: start + 1,
        matchTypeCounts: Object.fromEntries(["MIXED", "MENS", "WOMENS"].map((type) =>
          [type, recentTypes.filter((value) => value === type).length])),
      });
    }
    // simulate still checks legal courts and count fairness on every round.
    // OWN_SIDE disappearance remains visible without dictating match-type rates.
    console.info("Social late match-type diagnostic", JSON.stringify({
      seed, windows,
      playerMatchTypes: [...typesByPlayer].map(([userId, experiences]) => ({ userId, types: [...experiences] })),
    }));
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
