import { describe, expect, it } from "vitest";
import {
  canQuickAccessSessionRead,
  normalizeNameLookupKey,
} from "./quickAccess";

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

describe("quick access session reads", () => {
  const quickAccessSession = {
    user: {
      id: "quick-user",
      isQuickAccess: true,
      quickAccessClubId: "club-b",
    },
  };

  it("allows reads for the host club", () => {
    expect(
      canQuickAccessSessionRead(quickAccessSession, {
        clubId: "club-b",
        sessionClubs: [],
      })
    ).toBe(true);
  });

  it("allows reads for accepted linked clubs", () => {
    expect(
      canQuickAccessSessionRead(quickAccessSession, {
        clubId: "club-a",
        sessionClubs: [
          { clubId: "club-a", status: "ACCEPTED" },
          { clubId: "club-b", status: "ACCEPTED" },
        ],
      })
    ).toBe(true);
  });

  it("rejects pending linked clubs and unrelated clubs", () => {
    expect(
      canQuickAccessSessionRead(quickAccessSession, {
        clubId: "club-a",
        sessionClubs: [{ clubId: "club-b", status: "PENDING" }],
      })
    ).toBe(false);

    expect(
      canQuickAccessSessionRead(quickAccessSession, {
        clubId: "club-a",
        sessionClubs: [{ clubId: "club-c", status: "ACCEPTED" }],
      })
    ).toBe(false);
  });
});
