import { describe, expect, it } from "vitest";
import type { ManualMatchFormState } from "@/components/session/sessionTypes";
import {
  buildManualMatchFormFromSelectedIds,
  getManualMatchSelectionOrder,
  toggleManualMatchPlayer,
} from "./manualMatchSelection";

const emptyManualMatchForm: ManualMatchFormState = {
  team1User1Id: "",
  team1User2Id: "",
  team2User1Id: "",
  team2User2Id: "",
};

describe("manualMatchSelection", () => {
  it("fills slots in selection order", () => {
    const form = buildManualMatchFormFromSelectedIds(["A", "B", "C", "D"]);

    expect(form).toEqual({
      team1User1Id: "A",
      team1User2Id: "B",
      team2User1Id: "C",
      team2User2Id: "D",
    });
    expect(getManualMatchSelectionOrder(form)).toEqual(["A", "B", "C", "D"]);
  });

  it("removes a selected player and compacts later picks leftward", () => {
    const nextForm = toggleManualMatchPlayer(
      buildManualMatchFormFromSelectedIds(["A", "B", "C", "D"]),
      "B"
    );

    expect(nextForm).toEqual({
      team1User1Id: "A",
      team1User2Id: "C",
      team2User1Id: "D",
      team2User2Id: "",
    });
    expect(getManualMatchSelectionOrder(nextForm)).toEqual(["A", "C", "D"]);
  });

  it("appends a replacement player into the next open slot", () => {
    const nextForm = toggleManualMatchPlayer(
      {
        team1User1Id: "A",
        team1User2Id: "C",
        team2User1Id: "D",
        team2User2Id: "",
      },
      "E"
    );

    expect(nextForm).toEqual({
      team1User1Id: "A",
      team1User2Id: "C",
      team2User1Id: "D",
      team2User2Id: "E",
    });
  });

  it("ignores a fifth unselected player when four are already chosen", () => {
    const nextForm = toggleManualMatchPlayer(
      buildManualMatchFormFromSelectedIds(["A", "B", "C", "D"]),
      "E"
    );

    expect(nextForm).toEqual({
      team1User1Id: "A",
      team1User2Id: "B",
      team2User1Id: "C",
      team2User2Id: "D",
    });
  });

  it("starts from an empty form when selecting the first player", () => {
    const nextForm = toggleManualMatchPlayer(emptyManualMatchForm, "A");

    expect(nextForm).toEqual({
      team1User1Id: "A",
      team1User2Id: "",
      team2User1Id: "",
      team2User2Id: "",
    });
  });
});
