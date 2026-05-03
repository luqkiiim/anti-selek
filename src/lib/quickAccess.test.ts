import { describe, expect, it } from "vitest";
import { normalizeNameLookupKey } from "./quickAccess";

describe("quick access name lookup", () => {
  it("removes spaces, apostrophes, punctuation, and symbols", () => {
    expect(normalizeNameLookupKey("Adam's Badminton")).toBe("adamsbadminton");
    expect(normalizeNameLookupKey("adam-s-badminton")).toBe("adamsbadminton");
    expect(normalizeNameLookupKey("Tom & Jerry Crew")).toBe("tomjerrycrew");
  });

  it("normalizes casing and accents", () => {
    expect(normalizeNameLookupKey("  ÉLITE Player_01  ")).toBe("eliteplayer01");
  });
});
