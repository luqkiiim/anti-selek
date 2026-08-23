import { describe, expect, it } from "vitest";
import { CourtGroupType, SessionPool } from "@/types/enums";
import { classifyCourtGroupSnapshot } from "./playerGroups";

const pools = new Map([
  ["a1", SessionPool.A],
  ["a2", SessionPool.A],
  ["a3", SessionPool.A],
  ["a4", SessionPool.A],
  ["b1", SessionPool.B],
  ["b2", SessionPool.B],
  ["b3", SessionPool.B],
  ["b4", SessionPool.B],
]);

describe("classifyCourtGroupSnapshot", () => {
  it("classifies dedicated Competitive and Social courts", () => {
    expect(
      classifyCourtGroupSnapshot(["a1", "a2"], ["a3", "a4"], pools)
    ).toEqual({
      courtGroupType: CourtGroupType.COMPETITIVE,
      poolASeatCount: 4,
      poolBSeatCount: 0,
    });
    expect(
      classifyCourtGroupSnapshot(["b1", "b2"], ["b3", "b4"], pools)
    ).toEqual({
      courtGroupType: CourtGroupType.SOCIAL,
      poolASeatCount: 0,
      poolBSeatCount: 4,
    });
  });

  it("only classifies a 2+2 court as Crossover when both teams are mixed", () => {
    expect(
      classifyCourtGroupSnapshot(["a1", "b1"], ["a2", "b2"], pools)
    ).toEqual({
      courtGroupType: CourtGroupType.CROSSOVER,
      poolASeatCount: 2,
      poolBSeatCount: 2,
    });
    expect(
      classifyCourtGroupSnapshot(["a1", "a2"], ["b1", "b2"], pools)
    ).toEqual({
      courtGroupType: CourtGroupType.OPEN_OVERFLOW,
      poolASeatCount: 2,
      poolBSeatCount: 2,
    });
  });

  it("classifies irregular group ratios as Open Overflow", () => {
    expect(
      classifyCourtGroupSnapshot(["a1", "a2"], ["a3", "b1"], pools)
    ).toEqual({
      courtGroupType: CourtGroupType.OPEN_OVERFLOW,
      poolASeatCount: 3,
      poolBSeatCount: 1,
    });
  });
});
