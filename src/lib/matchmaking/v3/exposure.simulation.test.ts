import { describe, expect, it } from "vitest";
import { SessionType } from "../../../types/enums";
import { simulateBalancedMixedExposure } from "./exposureSimulation";

const SIMULATION_TIMEOUT_MS = 30_000;

describe("Balanced + Mixed deterministic exposure simulation", () => {
  it.each([SessionType.POINTS, SessionType.ELO])(
    "completes 20 scheduled matches fairly and with legal, balance-safe courts in %s mode",
    (sessionType) => {
      const result = simulateBalancedMixedExposure(sessionType, 4729);
      console.info(
        "BALANCED_MIXED_EXPOSURE " + JSON.stringify(result)
      );

      expect(result.scheduledMatches).toBe(20);
      expect(result.completedMatches).toBe(20);
      expect(
        Object.values(result.matchCountsByPlayer).reduce(
          (sum, count) => sum + count,
          0
        )
      ).toBe(80);
      expect(result.matchCountSpread).toBeLessThanOrEqual(1);
      expect(Object.values(result.matchCountsByPlayer).filter((count) => count === 6)).toHaveLength(10);
      expect(Object.values(result.matchCountsByPlayer).filter((count) => count === 5)).toHaveLength(4);
      expect(result.invalidMixicanoMatches).toBe(0);
      if (sessionType === SessionType.ELO) {
        expect(result.worstBalanceGap).toBeLessThanOrEqual(50);
      }
      expect(result.decisionsWithOutstandingMatches).toBeGreaterThan(0);
      expect(result.maximumOutstandingMatchCount).toBeGreaterThan(0);
      expect(result.uniqueSharedCourtRelationships).toBeLessThanOrEqual(91);
    },
    SIMULATION_TIMEOUT_MS
  );
});
