import { describe, expect, it } from "vitest";
import { MixedSide, SessionMode, SessionType } from "../../types/enums";
import { buildRotationHistory, type PartitionCandidate } from "./partitioning";
import {
  getManualMatchPlayerIds,
  hasDuplicateManualMatchPlayers,
  isValidManualMatchPartition,
  type ManualMatchTeams,
} from "./manualMatch";

function createPlayers(
  entries: Array<[string, string, string, (string | null)?]>
) {
  return new Map<string, PartitionCandidate>(
    entries.map(([userId, gender, partnerPreference, mixedSideOverride]) => [
      userId,
      {
        userId,
        elo: 1000,
        pointDiff: 0,
        lastPartnerId: null,
        gender,
        partnerPreference,
        mixedSideOverride: mixedSideOverride ?? null,
      },
    ])
  );
}

describe("manual match helpers", () => {
  it("returns the four manual match players in slot order", () => {
    const teams: ManualMatchTeams = {
      team1: ["A", "B"],
      team2: ["C", "D"],
    };

    expect(getManualMatchPlayerIds(teams)).toEqual(["A", "B", "C", "D"]);
  });

  it("detects duplicate players across manual teams", () => {
    expect(
      hasDuplicateManualMatchPlayers({
        team1: ["A", "B"],
        team2: ["A", "D"],
      })
    ).toBe(true);

    expect(
      hasDuplicateManualMatchPlayers({
        team1: ["A", "B"],
        team2: ["C", "D"],
      })
    ).toBe(false);
  });

  it("accepts side-balanced Mixicano structures that cross legacy gender lines", () => {
    const playersById = createPlayers([
      ["M1", "MALE", "OPEN"],
      ["M2", "MALE", "OPEN", MixedSide.LOWER],
      ["F1", "FEMALE", "FEMALE_FLEX"],
      ["F2", "FEMALE", "OPEN", MixedSide.UPPER],
    ]);

    expect(
      isValidManualMatchPartition(
        {
          team1: ["F1", "F2"],
          team2: ["M1", "M2"],
        },
        playersById,
        SessionMode.MIXICANO,
        SessionType.ELO,
        buildRotationHistory([])
      )
    ).toBe(true);
  });
});
