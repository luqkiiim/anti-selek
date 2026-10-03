import { describe, expect, it } from "vitest";
import { SessionType } from "../../../types/enums";
import { buildBalanceGuardrail, getBalanceGuardrailPolicy, isBalanceGuardrailAdmissible } from "./balanceGuardrail";

describe("fixed balance admissibility", () => {
  it("includes the Points boundary without letting good courts hide a bad court", () => {
    const envelope = buildBalanceGuardrail(getBalanceGuardrailPolicy(SessionType.POINTS)!, {
      maxBalanceGap: 2, totalBalanceGap: 2,
    });
    expect([2, 2.7, 3.4, 3.5, 3.6, 8].map((gap) => isBalanceGuardrailAdmissible({
      maxBalanceGap: gap, totalBalanceGap: gap,
    }, envelope))).toEqual([true, true, true, true, false, false]);
    expect(isBalanceGuardrailAdmissible({ maxBalanceGap: 4, totalBalanceGap: 4 }, envelope)).toBe(false);
  });

  it("requires both near-best and absolute Rating safety", () => {
    const policy = getBalanceGuardrailPolicy(SessionType.ELO)!;
    const nearBest = buildBalanceGuardrail(policy, { maxBalanceGap: 2, totalBalanceGap: 2 });
    expect(isBalanceGuardrailAdmissible({ maxBalanceGap: 49, totalBalanceGap: 49 }, nearBest)).toBe(false);
    const ceiling = buildBalanceGuardrail(policy, { maxBalanceGap: 40, totalBalanceGap: 60 });
    expect(isBalanceGuardrailAdmissible({ maxBalanceGap: 50, totalBalanceGap: 100 }, ceiling)).toBe(true);
    expect(isBalanceGuardrailAdmissible({ maxBalanceGap: 50.1, totalBalanceGap: 50.1 }, ceiling)).toBe(false);
  });

  it("keeps both best achievable gaps when stronger rotation makes the Rating ceiling impossible", () => {
    const envelope = buildBalanceGuardrail(getBalanceGuardrailPolicy(SessionType.ELO)!, {
      maxBalanceGap: 60, totalBalanceGap: 80,
    });
    expect(envelope.ceilingFeasible).toBe(false);
    expect(isBalanceGuardrailAdmissible({ maxBalanceGap: 60, totalBalanceGap: 80 }, envelope)).toBe(true);
    expect(isBalanceGuardrailAdmissible({ maxBalanceGap: 61, totalBalanceGap: 61 }, envelope)).toBe(false);
    expect(isBalanceGuardrailAdmissible({ maxBalanceGap: 60, totalBalanceGap: 81 }, envelope)).toBe(false);
  });

  it("allows explicit tuning while rejecting invalid tolerances", () => {
    const tuned = getBalanceGuardrailPolicy(SessionType.ELO, { nearBestWindow: 10, absoluteCeiling: 40 })!;
    expect(buildBalanceGuardrail(tuned, { maxBalanceGap: 2, totalBalanceGap: 2 }).allowedMaxBalanceGap).toBe(12);
    for (const nearBestWindow of [-1, NaN, Infinity]) {
      expect(() => getBalanceGuardrailPolicy(SessionType.POINTS, { nearBestWindow })).toThrow(RangeError);
    }
    expect(getBalanceGuardrailPolicy(SessionType.SOCIAL_MIX)).toBeNull();
  });
});
