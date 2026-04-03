import { describe, expect, it } from "vitest";
import {
  MixedSide,
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionPool,
  SessionType,
} from "@/types/enums";
import { parseCreateSessionRequest } from "./createSessionRequest";
import { SessionRouteError } from "./sessionRouteShared";

describe("parseCreateSessionRequest", () => {
  it("normalizes player overrides and guest config precedence", () => {
    const parsed = parseCreateSessionRequest({
      name: "  Friday Night  ",
      communityId: "community-1",
      type: SessionType.ELO,
      mode: SessionMode.MIXICANO,
      courtCount: 4,
      playerIds: ["user-1", "user-2", 3],
      playerConfigs: [
        {
          userId: "user-1",
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
        },
        {
          userId: "user-2",
          gender: "INVALID",
        },
      ],
      guestNames: ["Guest A", "Guest B", "guest a", "A"],
      guestConfigs: [
        {
          name: "Guest A",
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.FEMALE_FLEX,
          initialElo: 1200,
        },
        {
          name: "Guest C",
          initialElo: 7000,
        },
      ],
    });

    expect(parsed.name).toBe("Friday Night");
    expect(parsed.type).toBe(SessionType.ELO);
    expect(parsed.mode).toBe(SessionMode.MIXICANO);
    expect(parsed.courtCount).toBe(4);
    expect(parsed.requestedPlayerIds).toEqual(["user-1", "user-2"]);
    expect(parsed.playerConfigMap.get("user-1")).toEqual({
      gender: PlayerGender.FEMALE,
      partnerPreference: PartnerPreference.FEMALE_FLEX,
      mixedSideOverride: null,
    });
    expect(parsed.playerConfigMap.get("user-2")).toEqual({});
    expect(parsed.normalizedGuests).toEqual([
      {
        name: "Guest A",
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.FEMALE_FLEX,
        mixedSideOverride: null,
        pool: SessionPool.A,
        initialElo: 1200,
      },
      {
        name: "Guest B",
        gender: PlayerGender.MALE,
        partnerPreference: PartnerPreference.OPEN,
        mixedSideOverride: null,
        pool: SessionPool.A,
        initialElo: 1000,
      },
      {
        name: "Guest C",
        gender: PlayerGender.MALE,
        partnerPreference: PartnerPreference.OPEN,
        mixedSideOverride: null,
        pool: SessionPool.A,
        initialElo: 1000,
      },
    ]);
  });

  it("defaults open mode guests to unspecified gender", () => {
    const parsed = parseCreateSessionRequest({
      name: "Open Session",
      communityId: "community-1",
      guestNames: ["Open Guest"],
    });

    expect(parsed.mode).toBe(SessionMode.MEXICANO);
    expect(parsed.normalizedGuests).toEqual([
      {
        name: "Open Guest",
        gender: PlayerGender.UNSPECIFIED,
        partnerPreference: PartnerPreference.OPEN,
        mixedSideOverride: null,
        pool: SessionPool.A,
        initialElo: 1000,
      },
    ]);
  });

  it("maps legacy female open preferences to an upper-side override", () => {
    const parsed = parseCreateSessionRequest({
      name: "Legacy Mix",
      communityId: "community-1",
      mode: SessionMode.MIXICANO,
      playerConfigs: [
        {
          userId: "user-1",
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.OPEN,
        },
      ],
      guestConfigs: [
        {
          name: "Guest A",
          gender: PlayerGender.FEMALE,
          partnerPreference: PartnerPreference.OPEN,
        },
      ],
    });

    expect(parsed.playerConfigMap.get("user-1")).toEqual({
      gender: PlayerGender.FEMALE,
      partnerPreference: PartnerPreference.OPEN,
      mixedSideOverride: MixedSide.UPPER,
    });
    expect(parsed.normalizedGuests).toEqual([
      {
        name: "Guest A",
        gender: PlayerGender.FEMALE,
        partnerPreference: PartnerPreference.OPEN,
        mixedSideOverride: MixedSide.UPPER,
        pool: SessionPool.A,
        initialElo: 1000,
      },
    ]);
  });

  it("rejects invalid body fields", () => {
    expect(() => parseCreateSessionRequest(null)).toThrowError(
      new SessionRouteError("Invalid request body", 400)
    );
    expect(() =>
      parseCreateSessionRequest({ name: "", communityId: "community-1" })
    ).toThrowError(new SessionRouteError("Session name required", 400));
    expect(() =>
      parseCreateSessionRequest({ name: "Session", communityId: "" })
    ).toThrowError(new SessionRouteError("Community is required", 400));
    expect(() =>
      parseCreateSessionRequest({
        name: "Session",
        communityId: "community-1",
        courtCount: 0,
      })
    ).toThrowError(
      new SessionRouteError(
        "Court count must be an integer between 1 and 10",
        400
      )
    );
  });

  it("rejects invalid session modes", () => {
    expect(() =>
      parseCreateSessionRequest({
        name: "Session",
        communityId: "community-1",
        mode: "BAD_MODE",
      })
    ).toThrowError(new SessionRouteError("Invalid session mode", 400));
  });

  it("accepts ladder and race as valid session types", () => {
    const parsed = parseCreateSessionRequest({
      name: "Ladder Night",
      communityId: "community-1",
      type: SessionType.LADDER,
    });

    expect(parsed.type).toBe(SessionType.LADDER);

    const raceParsed = parseCreateSessionRequest({
      name: "Race Night",
      communityId: "community-1",
      type: SessionType.RACE,
    });

    expect(raceParsed.type).toBe(SessionType.RACE);
  });

  it("carries the test-session flag", () => {
    const parsed = parseCreateSessionRequest({
      name: "Dry Run",
      communityId: "community-1",
      isTest: true,
    });

    expect(parsed.isTest).toBe(true);
  });

  it("rejects invalid session types", () => {
    expect(() =>
      parseCreateSessionRequest({
        name: "Session",
        communityId: "community-1",
        type: "BAD_TYPE",
      })
    ).toThrowError(new SessionRouteError("Invalid session type", 400));
  });
});
