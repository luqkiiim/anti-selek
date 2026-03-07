import { describe, expect, it } from "vitest";
import { SessionMode } from "../../types/enums";
import { buildRotationHistory, type PartitionCandidate } from "./partitioning";
import {
  getManualMatchPlayerIds,
  hasDuplicateManualMatchPlayers,
  isValidManualMatchPartition,
  type ManualMatchTeams,
} from "./manualMatch";

function createPlayers(entries: Array<[string, string, string]>) {
  return new Map<string, PartitionCandidate>(
    entries.map(([userId, gender, partnerPreference]) => [
      userId,
      {
        userId,
        elo: 1000,
        lastPartnerId: null,
        gender,
        partnerPreference,
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

  it("rejects invalid Mixicano team structures", () => {
    const playersById = createPlayers([
      ["M1", "MALE", "OPEN"],
      ["M2", "MALE", "OPEN"],
      ["F1", "FEMALE", "FEMALE_FLEX"],
      ["F2", "FEMALE", "FEMALE_FLEX"],
    ]);

    expect(
      isValidManualMatchPartition(
        {
          team1: ["F1", "F2"],
          team2: ["M1", "M2"],
        },
        playersById,
        SessionMode.MIXICANO,
        buildRotationHistory([])
      )
    ).toBe(false);

    expect(
      isValidManualMatchPartition(
        {
          team1: ["F1", "M1"],
          team2: ["F2", "M2"],
        },
        playersById,
        SessionMode.MIXICANO,
        buildRotationHistory([])
      )
    ).toBe(true);
  });
});
