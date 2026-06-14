import { describe, expect, it } from "vitest";
import {
  SessionBalanceMetric,
  SessionMatchmakingStyle,
  SessionMode,
  SessionPairingMode,
  SessionScoringType,
  SessionType,
} from "@/types/enums";
import {
  getEffectiveSessionMode,
  getEffectiveSessionType,
  getLegacySessionModeForSettings,
  getLegacySessionTypeForSettings,
  getSessionSettings,
} from "./sessionSettings";

describe("sessionSettings", () => {
  it("maps old session types to explicit settings", () => {
    expect(getSessionSettings({ type: SessionType.POINTS })).toMatchObject({
      scoringType: SessionScoringType.POINTS,
      matchmakingStyle: SessionMatchmakingStyle.BALANCED,
      balanceMetric: SessionBalanceMetric.SESSION_POINTS,
    });
    expect(getSessionSettings({ type: SessionType.SOCIAL_MIX })).toMatchObject({
      matchmakingStyle: SessionMatchmakingStyle.SOCIAL,
      balanceMetric: SessionBalanceMetric.SESSION_POINTS,
    });
    expect(getSessionSettings({ type: SessionType.ELO })).toMatchObject({
      matchmakingStyle: SessionMatchmakingStyle.BALANCED,
      balanceMetric: SessionBalanceMetric.RATING,
    });
    expect(getSessionSettings({ type: SessionType.RACE })).toMatchObject({
      matchmakingStyle: SessionMatchmakingStyle.LEVEL_MATCH,
      balanceMetric: SessionBalanceMetric.SESSION_POINTS,
    });
  });

  it("prefers legacy type when new DB defaults disagree with an old row", () => {
    expect(
      getEffectiveSessionType({
        type: SessionType.RACE,
        matchmakingStyle: SessionMatchmakingStyle.BALANCED,
        balanceMetric: SessionBalanceMetric.SESSION_POINTS,
      })
    ).toBe(SessionType.RACE);
    expect(
      getEffectiveSessionType({
        type: SessionType.ELO,
        matchmakingStyle: SessionMatchmakingStyle.BALANCED,
        balanceMetric: SessionBalanceMetric.SESSION_POINTS,
      })
    ).toBe(SessionType.ELO);
  });

  it("derives legacy shadows from new settings", () => {
    const settings = {
      scoringType: SessionScoringType.POINTS,
      matchmakingStyle: SessionMatchmakingStyle.SOCIAL,
      balanceMetric: SessionBalanceMetric.RATING,
      pairingMode: SessionPairingMode.MIXED,
    };

    expect(getLegacySessionTypeForSettings(settings)).toBe(
      SessionType.SOCIAL_MIX
    );
    expect(getLegacySessionModeForSettings(settings)).toBe(
      SessionMode.MIXICANO
    );
    expect(getEffectiveSessionMode(settings)).toBe(SessionMode.MIXICANO);
  });
});
