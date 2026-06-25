import { describe, expect, it } from "vitest";
import {
  MixedSide,
  PartnerPreference,
  PlayerGender,
  SessionBalanceMetric,
  SessionCollabFormat,
  SessionMatchmakingStyle,
  SessionMode,
  SessionPairingMode,
  SessionPool,
  SessionScoringType,
  SessionType,
} from "@/types/enums";
import { parseCreateSessionRequest } from "./createSessionRequest";
import { SessionRouteError } from "./sessionRouteShared";

describe("parseCreateSessionRequest", () => {
  it("normalizes player overrides and guest config precedence", () => {
    const parsed = parseCreateSessionRequest({
      name: "  Friday Night  ",
      clubId: "community-1",
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
    expect(parsed.scoringType).toBe(SessionScoringType.POINTS);
    expect(parsed.collabFormat).toBe(SessionCollabFormat.FREE_PLAY);
    expect(parsed.matchmakingStyle).toBe(SessionMatchmakingStyle.BALANCED);
    expect(parsed.balanceMetric).toBe(SessionBalanceMetric.RATING);
    expect(parsed.pairingMode).toBe(SessionPairingMode.MIXED);
    expect(parsed.courtCount).toBe(4);
    expect(parsed.autoQueueEnabled).toBe(false);
    expect(parsed.respectPlayerRest).toBe(true);
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
      clubId: "community-1",
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

  it("defaults to two courts when court count is omitted", () => {
    const parsed = parseCreateSessionRequest({
      name: "Default Courts",
      clubId: "community-1",
    });

    expect(parsed.courtCount).toBe(2);
  });

  it("maps legacy female open preferences to an upper-side override", () => {
    const parsed = parseCreateSessionRequest({
      name: "Legacy Mix",
      clubId: "community-1",
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
      parseCreateSessionRequest({ name: "", clubId: "community-1" })
    ).toThrowError(new SessionRouteError("Session name required", 400));
    expect(() =>
      parseCreateSessionRequest({ name: "Session", clubId: "" })
    ).toThrowError(new SessionRouteError("Club is required", 400));
    expect(() =>
      parseCreateSessionRequest({
        name: "Session",
        clubId: "community-1",
        courtCount: 0,
      })
    ).toThrowError(
      new SessionRouteError(
        "Court count must be an integer between 1 and 10",
        400
      )
    );
    expect(() =>
      parseCreateSessionRequest({
        name: "Session",
        clubId: "community-1",
        partnerClubId: "community-1",
      })
    ).toThrowError(new SessionRouteError("Invalid partner club", 400));
  });

  it("rejects invalid session modes", () => {
    expect(() =>
      parseCreateSessionRequest({
        name: "Session",
        clubId: "community-1",
        mode: "BAD_MODE",
      })
    ).toThrowError(new SessionRouteError("Invalid session mode", 400));
  });

  it("normalizes legacy social mix, ladder, and race session types", () => {
    const socialMixParsed = parseCreateSessionRequest({
      name: "Social Night",
      clubId: "community-1",
      type: SessionType.SOCIAL_MIX,
    });

    expect(socialMixParsed.type).toBe(SessionType.SOCIAL_MIX);
    expect(socialMixParsed.matchmakingStyle).toBe(
      SessionMatchmakingStyle.SOCIAL
    );

    const parsed = parseCreateSessionRequest({
      name: "Ladder Night",
      clubId: "community-1",
      type: SessionType.LADDER,
    });

    expect(parsed.type).toBe(SessionType.RACE);
    expect(parsed.matchmakingStyle).toBe(SessionMatchmakingStyle.LEVEL_MATCH);

    const raceParsed = parseCreateSessionRequest({
      name: "Race Night",
      clubId: "community-1",
      type: SessionType.RACE,
    });

    expect(raceParsed.type).toBe(SessionType.RACE);
    expect(raceParsed.matchmakingStyle).toBe(
      SessionMatchmakingStyle.LEVEL_MATCH
    );
  });

  it("accepts new matchmaking settings and derives legacy shadows", () => {
    const parsed = parseCreateSessionRequest({
      name: "Level Night",
      clubId: "community-1",
      scoringType: SessionScoringType.POINTS,
      matchmakingStyle: SessionMatchmakingStyle.LEVEL_MATCH,
      balanceMetric: SessionBalanceMetric.RATING,
      pairingMode: SessionPairingMode.MIXED,
    });

    expect(parsed.scoringType).toBe(SessionScoringType.POINTS);
    expect(parsed.matchmakingStyle).toBe(SessionMatchmakingStyle.LEVEL_MATCH);
    expect(parsed.balanceMetric).toBe(SessionBalanceMetric.RATING);
    expect(parsed.pairingMode).toBe(SessionPairingMode.MIXED);
    expect(parsed.type).toBe(SessionType.RACE);
    expect(parsed.mode).toBe(SessionMode.MIXICANO);
  });

  it("carries the test-session flag", () => {
    const parsed = parseCreateSessionRequest({
      name: "Dry Run",
      clubId: "community-1",
      isTest: true,
    });

    expect(parsed.isTest).toBe(true);
  });

  it("allows auto queue to be disabled explicitly", () => {
    const parsed = parseCreateSessionRequest({
      name: "No Queue Night",
      clubId: "community-1",
      autoQueueEnabled: false,
    });

    expect(parsed.autoQueueEnabled).toBe(false);
  });

  it("allows auto queue to be enabled explicitly", () => {
    const parsed = parseCreateSessionRequest({
      name: "Queue Night",
      clubId: "community-1",
      autoQueueEnabled: true,
    });

    expect(parsed.autoQueueEnabled).toBe(true);
  });

  it("allows player rest to be disabled explicitly", () => {
    const parsed = parseCreateSessionRequest({
      name: "No Rest Night",
      clubId: "community-1",
      respectPlayerRest: false,
    });

    expect(parsed.respectPlayerRest).toBe(false);
  });

  it("accepts a distinct partner club for collab sessions", () => {
    const parsed = parseCreateSessionRequest({
      name: "Collab Night",
      clubId: "community-1",
      partnerClubId: "community-2",
    });

    expect(parsed.partnerClubId).toBe("community-2");
  });

  it("accepts club vs club collab sessions with representing clubs", () => {
    const parsed = parseCreateSessionRequest({
      name: "Interclub Night",
      clubId: "community-1",
      partnerClubId: "community-2",
      collabFormat: SessionCollabFormat.INTERCLUB,
      playerConfigs: [
        { userId: "player-1", representingClubId: "community-1" },
      ],
      guestConfigs: [
        { name: "Guest A", representingClubId: "community-2" },
      ],
    });

    expect(parsed.collabFormat).toBe(SessionCollabFormat.INTERCLUB);
    expect(parsed.playerConfigMap.get("player-1")?.representingClubId).toBe(
      "community-1"
    );
    expect(parsed.normalizedGuests[0].representingClubId).toBe("community-2");
  });

  it("rejects invalid club vs club setup", () => {
    expect(() =>
      parseCreateSessionRequest({
        name: "No Partner",
        clubId: "community-1",
        collabFormat: SessionCollabFormat.INTERCLUB,
      })
    ).toThrowError(
      new SessionRouteError(
        "Club vs club sessions require a partner club",
        400
      )
    );

    expect(() =>
      parseCreateSessionRequest({
        name: "Pooled",
        clubId: "community-1",
        partnerClubId: "community-2",
        collabFormat: SessionCollabFormat.INTERCLUB,
        poolsEnabled: true,
      })
    ).toThrowError(
      new SessionRouteError("Club vs club sessions do not support pools", 400)
    );
  });

  it("accepts legacy community identifiers", () => {
    const parsed = parseCreateSessionRequest({
      name: "Legacy Collab Night",
      communityId: "community-1",
      partnerCommunityId: "community-2",
    });

    expect(parsed.clubId).toBe("community-1");
    expect(parsed.partnerClubId).toBe("community-2");
  });

  it("rejects conflicting club and community identifiers", () => {
    expect(() =>
      parseCreateSessionRequest({
        name: "Conflict Night",
        clubId: "community-1",
        communityId: "community-2",
      })
    ).toThrowError(
      new SessionRouteError(
        "Conflicting club identifier; use either clubId or communityId.",
        400
      )
    );
    expect(() =>
      parseCreateSessionRequest({
        name: "Conflict Collab Night",
        clubId: "community-1",
        partnerClubId: "community-2",
        partnerCommunityId: "community-3",
      })
    ).toThrowError(
      new SessionRouteError(
        "Conflicting partner club identifier; use either partnerClubId or partnerCommunityId.",
        400
      )
    );
  });

  it("rejects invalid session types", () => {
    expect(() =>
      parseCreateSessionRequest({
        name: "Session",
        clubId: "community-1",
        type: "BAD_TYPE",
      })
    ).toThrowError(new SessionRouteError("Invalid session type", 400));
  });

  it("rejects invalid new matchmaking settings", () => {
    expect(() =>
      parseCreateSessionRequest({
        name: "Session",
        clubId: "community-1",
        matchmakingStyle: "BAD_STYLE",
      })
    ).toThrowError(new SessionRouteError("Invalid matchmaking style", 400));
    expect(() =>
      parseCreateSessionRequest({
        name: "Session",
        clubId: "community-1",
        balanceMetric: "BAD_METRIC",
      })
    ).toThrowError(new SessionRouteError("Invalid balance metric", 400));
    expect(() =>
      parseCreateSessionRequest({
        name: "Session",
        clubId: "community-1",
        pairingMode: "BAD_PAIRING",
      })
    ).toThrowError(new SessionRouteError("Invalid pairing mode", 400));
  });
});
