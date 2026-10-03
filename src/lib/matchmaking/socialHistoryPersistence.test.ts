import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { PlayerGender, SessionMode, SessionType } from "@/types/enums";
import { parseMatchmakingReasonJson } from "./matchReason";
import { resolveSocialHistoryReasonJson } from "./socialHistoryPersistence";
import { withSocialVarietySnapshot } from "./v3/socialVariety";

const partition = {
  team1: ["M1", "F1"] as [string, string],
  team2: ["M2", "F2"] as [string, string],
};
const players = ["M1", "M2", "F1", "F2"].map((userId) => ({
  userId,
  gender: userId.startsWith("M") ? PlayerGender.MALE : PlayerGender.FEMALE,
  partnerPreference: userId.startsWith("M") ? "OPEN" : "FEMALE_FLEX",
  mixedSideOverride: null,
}));

function transaction(type = SessionType.SOCIAL_MIX) {
  const tx = {
    session: {
      findUnique: vi.fn().mockResolvedValue({ type, mode: SessionMode.MIXICANO }),
    },
    sessionPlayer: {
      findMany: vi.fn().mockResolvedValue(players),
    },
  };
  return { tx, client: tx as unknown as Prisma.TransactionClient };
}

describe("shared rotation history persistence", () => {
  it.each([SessionType.SOCIAL_MIX, SessionType.POINTS, SessionType.ELO])("stores manual sides for %s without inventing an automatic matchmaking reason", async (type) => {
    const { client } = transaction(type);
    const json = await resolveSocialHistoryReasonJson(client, "session", partition, null);
    expect(JSON.parse(json!).socialVariety).toMatchObject({
      basis: "EFFECTIVE_MIXED_SIDE",
      courtType: "MIXED",
      effectiveSideByUserId: { M1: "UPPER", M2: "UPPER", F1: "LOWER", F2: "LOWER" },
    });
    expect(parseMatchmakingReasonJson(json)).toBeNull();
  });

  it("preserves a queue snapshot exactly after current roles change", async () => {
    const { tx, client } = transaction();
    const assignedPlayers = players.map((player) => ({ ...player, mixedSideOverride: "LOWER" }));
    const json = withSocialVarietySnapshot(null, partition, assignedPlayers);
    tx.sessionPlayer.findMany.mockResolvedValue([]);
    const stored = await resolveSocialHistoryReasonJson(client, "session", partition, json);
    expect(stored).toBe(json);
    expect(tx.session.findUnique).not.toHaveBeenCalled();
    expect(tx.sessionPlayer.findMany).not.toHaveBeenCalled();
  });

  it("rebuilds the snapshot for a changed lineup and retains unrelated reason fields", async () => {
    const { tx, client } = transaction();
    const oldJson = withSocialVarietySnapshot(JSON.stringify({ type: "INTERCLUB", team1ClubId: "club" }), partition, players);
    const replacement = { team1: ["M1", "F3"] as [string, string], team2: partition.team2 };
    tx.sessionPlayer.findMany.mockResolvedValue([
      { userId: "M1", gender: PlayerGender.MALE, partnerPreference: "OPEN" },
      { userId: "M2", gender: PlayerGender.MALE, partnerPreference: "OPEN" },
      { userId: "F2", gender: PlayerGender.FEMALE, partnerPreference: "FEMALE_FLEX" },
      { userId: "F3", gender: PlayerGender.FEMALE, partnerPreference: "FEMALE_FLEX" },
    ]);
    const json = await resolveSocialHistoryReasonJson(client, "session", replacement, oldJson);
    const stored = JSON.parse(json!);
    expect(stored.type).toBe("INTERCLUB");
    expect(stored.team1ClubId).toBe("club");
    expect(stored.socialVariety.courtType).toBe("MIXED");
    expect(stored.socialVariety.effectiveSideByUserId).toHaveProperty("F3", "LOWER");
    expect(stored.socialVariety.effectiveSideByUserId).not.toHaveProperty("F1");
  });

  it("records unknown manual match types as null and preserves that history", async () => {
    const { tx, client } = transaction();
    tx.sessionPlayer.findMany.mockResolvedValue([
      { userId: "M1", gender: PlayerGender.UNSPECIFIED },
    ]);
    const json = await resolveSocialHistoryReasonJson(client, "session", partition, null);
    expect(JSON.parse(json!).socialVariety.courtType).toBeNull();
    const stored = await resolveSocialHistoryReasonJson(client, "session", partition, json);
    expect(stored).toBe(json);
  });

  it("leaves ladder records unchanged", async () => {
    const { tx, client } = transaction(SessionType.LADDER);
    expect(await resolveSocialHistoryReasonJson(client, "session", partition, null)).toBeNull();
    expect(await resolveSocialHistoryReasonJson(client, "session", partition, "legacy-reason")).toBe("legacy-reason");
    expect(tx.sessionPlayer.findMany).not.toHaveBeenCalled();
  });
});
