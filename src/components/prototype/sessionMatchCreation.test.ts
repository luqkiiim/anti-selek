import { describe, expect, it } from "vitest";
import {
  buildGenerateMatchesRequest,
  buildManualGenerateMatchRequest,
} from "./sessionMatchCreation";

describe("prototype session match request bodies", () => {
  it("uses the API's single court request for one court and batch request for several", () => {
    expect(buildGenerateMatchesRequest(["court-1"])).toEqual({
      courtId: "court-1",
    });
    expect(buildGenerateMatchesRequest(["court-1", "court-2"])).toEqual({
      courtIds: ["court-1", "court-2"],
    });
    expect(buildGenerateMatchesRequest([])).toBeNull();
  });

  it("formats manual teams for the generate-match endpoint", () => {
    expect(
      buildManualGenerateMatchRequest("court-2", {
        team1: ["a", "b"],
        team2: ["c", "d"],
      })
    ).toEqual({
      courtId: "court-2",
      manualTeams: { team1: ["a", "b"], team2: ["c", "d"] },
    });
  });
});
