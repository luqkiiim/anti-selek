import { describe, expect, it } from "vitest";
import { PlayerGender } from "@/types/enums";
import {
  getSessionCreationIssues,
  hasMissingRequiredGender,
} from "./sessionCreationIssues";

function getIssues(
  overrides: Partial<Parameters<typeof getSessionCreationIssues>[0]> = {}
) {
  return getSessionCreationIssues({
    name: "Friday Night",
    participantCount: 4,
    poolsEnabled: false,
    competitiveCount: 0,
    socialCount: 4,
    isMixed: false,
    hasMissingMixedGender: false,
    mixedModeLabel: "Mixicano",
    isInterclub: false,
    hasPartnerClub: false,
    hasInvalidInterclubRepresentation: false,
    ...overrides,
  });
}

describe("getSessionCreationIssues", () => {
  it("keeps unspecified serialized roster genders from passing mixed setup", () => {
    const hasMissingMixedGender = hasMissingRequiredGender({
      players: [
        { id: "ready", gender: PlayerGender.FEMALE },
        { id: "missing", gender: PlayerGender.UNSPECIFIED },
      ],
      selectedPlayerIds: ["ready", "missing"],
      guestGenders: [],
    });

    expect(getIssues({ isMixed: true, hasMissingMixedGender })).toContain(
      "Set Male or Female for every selected player and guest in Mixicano."
    );
  });

  it("collects every unmet prerequisite", () => {
    expect(
      getIssues({
        name: " ",
        participantCount: 1,
        poolsEnabled: true,
        competitiveCount: 1,
        socialCount: 0,
        isMixed: true,
        hasMissingMixedGender: true,
        isInterclub: true,
        hasPartnerClub: false,
      })
    ).toEqual([
      "Add a tournament name.",
      "Add 1 more player or guest.",
      "Add at least 2 Competitive players or guests.",
      "Add at least 2 Social players or guests.",
      "Set Male or Female for every selected player and guest in Mixicano.",
      "Choose a partner club for club vs club.",
    ]);
  });

  it("reports invalid interclub representation only after partner selection", () => {
    expect(
      getIssues({
        isInterclub: true,
        hasPartnerClub: true,
        hasInvalidInterclubRepresentation: true,
      })
    ).toEqual([
      "Assign every selected player and guest to a valid club side.",
    ]);
  });

  it("returns no issues when setup is ready", () => {
    expect(getIssues()).toEqual([]);
  });

  it("requires both player groups when groups are enabled", () => {
    expect(
      getIssues({
        poolsEnabled: true,
        competitiveCount: 3,
        socialCount: 1,
      })
    ).toEqual(["Add at least 2 Social players or guests."]);
  });
});
