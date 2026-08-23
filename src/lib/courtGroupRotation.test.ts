import { describe, expect, it } from "vitest";
import { rankOpenCourtsForGroupType } from "./courtGroupRotation";

const courts = [
  { id: "court-1", courtNumber: 1 },
  { id: "court-2", courtNumber: 2 },
  { id: "court-3", courtNumber: 3 },
];

describe("rankOpenCourtsForGroupType", () => {
  it("prefers the court with fewer assignments of the requested type", () => {
    const ranked = rankOpenCourtsForGroupType(
      courts,
      [
        {
          courtId: "court-1",
          courtGroupType: "COMPETITIVE",
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          courtId: "court-2",
          courtGroupType: "COMPETITIVE",
          createdAt: new Date("2026-01-01T00:01:00Z"),
        },
        {
          courtId: "court-2",
          courtGroupType: "COMPETITIVE",
          createdAt: new Date("2026-01-01T00:02:00Z"),
        },
      ],
      "COMPETITIVE"
    );

    expect(ranked.map((court) => court.id)).toEqual([
      "court-3",
      "court-1",
      "court-2",
    ]);
  });

  it("uses court number order when there is no group composition", () => {
    const ranked = rankOpenCourtsForGroupType(
      [courts[2], courts[0], courts[1]],
      [],
      null
    );

    expect(ranked.map((court) => court.courtNumber)).toEqual([1, 2, 3]);
  });
});
