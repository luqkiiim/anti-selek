import { describe, expect, it } from "vitest";
import { MixedSide, PartnerPreference, PlayerGender, SessionPool } from "@/types/enums";
import { buildCourtCreateOptionStates } from "./courtCreateOptions";
import type { Court, Player, QueuedMatch } from "./sessionTypes";

function createPlayer(
  userId: string,
  options: Partial<Player> = {}
): Player {
  return {
    userId,
    sessionPoints: 1000,
    isPaused: false,
    isGuest: false,
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    mixedSideOverride: null,
    pool: SessionPool.A,
    user: {
      id: userId,
      name: userId,
      elo: 1000,
    },
    ...options,
  };
}

function createCourt(currentMatch: Court["currentMatch"] = null): Court {
  return {
    id: "court-1",
    courtNumber: 1,
    currentMatch,
  };
}

function createQueuedMatch(ids: [string, string, string, string]): QueuedMatch {
  return {
    id: "queue-1",
    team1User1: { id: ids[0], name: ids[0] },
    team1User2: { id: ids[1], name: ids[1] },
    team2User1: { id: ids[2], name: ids[2] },
    team2User2: { id: ids[3], name: ids[3] },
  };
}

describe("buildCourtCreateOptionStates", () => {
  it("counts men's and women's courts by effective side instead of raw gender", () => {
    const options = buildCourtCreateOptionStates({
      players: [
        createPlayer("male-upper-1"),
        createPlayer("male-upper-2"),
        createPlayer("male-upper-3"),
        createPlayer("female-upper", {
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.OPEN,
          mixedSideOverride: MixedSide.UPPER,
        }),
        createPlayer("female-lower-1", {
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        }),
        createPlayer("female-lower-2", {
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        }),
        createPlayer("female-lower-3", {
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        }),
        createPlayer("male-lower", {
          mixedSideOverride: MixedSide.LOWER,
        }),
      ],
      courts: [createCourt()],
      queuedMatch: null,
    });

    expect(options).toEqual([
      {
        key: "BEST",
        label: "Best Match",
        disabled: false,
        detail: undefined,
      },
      {
        key: "MENS",
        label: "Men's Court",
        disabled: false,
        detail: undefined,
      },
      {
        key: "WOMENS",
        label: "Women's Court",
        disabled: false,
        detail: undefined,
      },
      {
        key: "MANUAL",
        label: "Manual",
        disabled: false,
      },
    ]);
  });

  it("disables automatic options when a queued match already exists", () => {
    const options = buildCourtCreateOptionStates({
      players: [
        createPlayer("A"),
        createPlayer("B"),
        createPlayer("C"),
        createPlayer("D"),
      ],
      courts: [createCourt()],
      queuedMatch: createQueuedMatch(["Q1", "Q2", "Q3", "Q4"]),
    });

    expect(options).toEqual([
      {
        key: "BEST",
        label: "Best Match",
        disabled: true,
        detail: "Resolve queued match first",
      },
      {
        key: "MENS",
        label: "Men's Court",
        disabled: true,
        detail: "Resolve queued match first",
      },
      {
        key: "WOMENS",
        label: "Women's Court",
        disabled: true,
        detail: "Resolve queued match first",
      },
      {
        key: "MANUAL",
        label: "Manual",
        disabled: false,
      },
    ]);
  });

  it("excludes live-court and paused players from availability counts", () => {
    const options = buildCourtCreateOptionStates({
      players: [
        createPlayer("busy-1"),
        createPlayer("busy-2"),
        createPlayer("busy-3"),
        createPlayer("busy-4"),
        createPlayer("idle-1"),
        createPlayer("idle-2"),
        createPlayer("idle-3"),
        createPlayer("paused", { isPaused: true }),
      ],
      courts: [
        createCourt({
          id: "match-1",
          status: "IN_PROGRESS",
          team1User1: { id: "busy-1", name: "busy-1" },
          team1User2: { id: "busy-2", name: "busy-2" },
          team2User1: { id: "busy-3", name: "busy-3" },
          team2User2: { id: "busy-4", name: "busy-4" },
        }),
      ],
      queuedMatch: null,
    });

    expect(options[0]).toEqual({
      key: "BEST",
      label: "Best Match",
      disabled: true,
      detail: "Only 3 available",
    });
    expect(options[3]).toEqual({
      key: "MANUAL",
      label: "Manual",
      disabled: false,
    });
  });
});
