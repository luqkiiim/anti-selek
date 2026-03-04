import { describe, it, expect } from "vitest";
import { getBusyPlayerIds } from "./busyFilter";

describe("getBusyPlayerIds", () => {
  it("should include players from PENDING, IN_PROGRESS, and PENDING_APPROVAL matches", () => {
    const matches = [
      {
        status: "IN_PROGRESS",
        team1User1Id: "p1",
        team1User2Id: "p2",
        team2User1Id: "p3",
        team2User2Id: "p4",
      },
      {
        status: "PENDING_APPROVAL",
        team1User1Id: "p5",
        team1User2Id: "p6",
        team2User1Id: "p7",
        team2User2Id: "p8",
      },
      {
        status: "PENDING",
        team1User1Id: "p9",
        team1User2Id: "p10",
        team2User1Id: "p11",
        team2User2Id: "p12",
      },
      {
        status: "COMPLETED",
        team1User1Id: "p13",
        team1User2Id: "p14",
        team2User1Id: "p15",
        team2User2Id: "p16",
      },
    ];

    const busyIds = getBusyPlayerIds(matches);
    
    // Players from active matches should be busy
    expect(busyIds.has("p1")).toBe(true);
    expect(busyIds.has("p5")).toBe(true);
    expect(busyIds.has("p9")).toBe(true);
    
    // Players from completed matches should NOT be busy
    expect(busyIds.has("p13")).toBe(false);
    
    expect(busyIds.size).toBe(12);
  });

  it("should handle empty matches list", () => {
    expect(getBusyPlayerIds([]).size).toBe(0);
  });
});
