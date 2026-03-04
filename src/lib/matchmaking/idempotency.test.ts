import { describe, it, expect } from "vitest";
import { simulateGatedUpdate } from "./idempotency";
import { MatchStatus } from "../../types/enums";

describe("Idempotency Gating Logic", () => {
  it("should allow update when status matches", () => {
    const match = { id: "m1", status: MatchStatus.IN_PROGRESS };
    const result = simulateGatedUpdate(match, MatchStatus.IN_PROGRESS, MatchStatus.PENDING_APPROVAL);
    
    expect(result.count).toBe(1);
    expect(result.updatedMatch?.status).toBe(MatchStatus.PENDING_APPROVAL);
  });

  it("should block update (idempotency) when status already changed", () => {
    // Scenario: Second call to score submission
    const match = { id: "m1", status: MatchStatus.PENDING_APPROVAL };
    const result = simulateGatedUpdate(match, MatchStatus.IN_PROGRESS, MatchStatus.PENDING_APPROVAL);
    
    expect(result.count).toBe(0);
  });

  it("should block update when match is already completed", () => {
    // Scenario: Calling approve on already completed match
    const match = { id: "m1", status: MatchStatus.COMPLETED };
    const result = simulateGatedUpdate(match, MatchStatus.PENDING_APPROVAL, MatchStatus.COMPLETED);
    
    expect(result.count).toBe(0);
  });
});
