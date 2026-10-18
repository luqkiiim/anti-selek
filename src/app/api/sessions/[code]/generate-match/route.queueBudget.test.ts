import { describe, expect, it } from "vitest";
import { createMatchmakingSearchBudget } from "@/lib/matchmaking/v3/searchBudget";
import { SessionMode, SessionType } from "@/types/enums";
import { canAttemptQueueWithinSearchBudget, usesGroupedMixedCapacityBudget } from "./queueBudget";

describe("grouped mixed capacity budget target", () => {
  const target = (eligiblePlayerCount: number) => usesGroupedMixedCapacityBudget({
    poolsEnabled: true,
    sessionType: SessionType.POINTS,
    sessionMode: SessionMode.MIXICANO,
    requestedMatchCount: 3,
    eligiblePlayerCount,
  });

  it("covers every legal three-court roster from 12 through 24", () => {
    for (let count = 12; count <= 24; count += 1) expect(target(count)).toBe(true);
    expect(target(11)).toBe(false);
    expect(target(25)).toBe(false);
  });

  it("leaves other formats and court counts on their existing policy", () => {
    expect(usesGroupedMixedCapacityBudget({
      poolsEnabled: false,
      sessionType: SessionType.POINTS,
      sessionMode: SessionMode.MIXICANO,
      requestedMatchCount: 3,
      eligiblePlayerCount: 23,
    })).toBe(false);
    expect(usesGroupedMixedCapacityBudget({
      poolsEnabled: true,
      sessionType: SessionType.ELO,
      sessionMode: SessionMode.MIXICANO,
      requestedMatchCount: 3,
      eligiblePlayerCount: 23,
    })).toBe(false);
    expect(usesGroupedMixedCapacityBudget({
      poolsEnabled: true,
      sessionType: SessionType.POINTS,
      sessionMode: SessionMode.MEXICANO,
      requestedMatchCount: 3,
      eligiblePlayerCount: 23,
    })).toBe(false);
    expect(usesGroupedMixedCapacityBudget({
      poolsEnabled: true,
      sessionType: SessionType.POINTS,
      sessionMode: SessionMode.MIXICANO,
      requestedMatchCount: 2,
      eligiblePlayerCount: 23,
    })).toBe(false);
  });
});

describe("optional queue computation window", () => {
  it("uses the original search clock and defers after the fallback cutoff", () => {
    let elapsed = 0;
    const searchBudget = createMatchmakingSearchBudget({ now: () => elapsed });

    expect(canAttemptQueueWithinSearchBudget(searchBudget)).toBe(true);
    elapsed = 4_200;
    expect(canAttemptQueueWithinSearchBudget(searchBudget)).toBe(true);
    elapsed = 4_251;
    expect(canAttemptQueueWithinSearchBudget(searchBudget)).toBe(false);
    elapsed = 4_600;
    expect(searchBudget.remainingMs()).toBe(400);
    expect(canAttemptQueueWithinSearchBudget(searchBudget)).toBe(false);
  });
});
