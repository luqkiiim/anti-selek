import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  isBalancedMatchTypeSourceCurrent,
  appendBalancedMatchTypeSnapshot,
} from "./balancedMatchTypePersistence";
import {
  buildBalancedMatchTypeContext,
  getBalancedMatchTypePolicyKey,
} from "./v3/balancedMatchTypes";
import { buildSocialVarietySnapshot } from "./v3/socialVariety";
import type { MatchmakerV3Player, V3DoublesPartition } from "./v3/types";

const partition: V3DoublesPartition = {
  team1: ["P0", "P7"],
  team2: ["P1", "P8"],
};
function fixture() {
  const players: MatchmakerV3Player[] = Array.from({ length: 14 }, (_, i) => ({
    userId: `P${i}`,
    pool: "A",
    gender: i < 7 ? "MALE" : "FEMALE",
    partnerPreference: i < 7 ? "OPEN" : "FEMALE_FLEX",
    isPaused: false,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    strength: 1000,
    availableSince: new Date(0),
  }));
  const rawPlayers = players.map((player) => ({
    ...player,
    playerId: player.userId,
  }));
  const tx = {
    session: {
      findUnique: vi.fn().mockResolvedValue({
        type: "ELO",
        mode: "MIXICANO",
        respectPlayerRest: true,
        poolsEnabled: false,
      }),
    },
    sessionPlayer: { findMany: vi.fn().mockResolvedValue(rawPlayers) },
    match: { findMany: vi.fn().mockResolvedValue([]) },
    queuedMatch: { findUnique: vi.fn().mockResolvedValue(null) },
  };
  const snapshot = buildBalancedMatchTypeContext(players, [], {
    policy: getBalancedMatchTypePolicyKey({
      sessionType: "ELO",
      sessionMode: "MIXICANO",
    }),
  }).snapshot(partition)!;
  const assignment = {
    partition,
    matchmakingReasonJson: JSON.stringify({
      socialVariety: buildSocialVarietySnapshot(partition, players),
      balancedMatchType: snapshot,
    }),
  };
  return {
    players,
    tx,
    client: tx as unknown as Prisma.TransactionClient,
    assignment,
  };
}
describe("distribution snapshots at the writer boundary", () => {
  it("accepts a fresh batch and detects a concurrent roster-level change outside its quartet", async () => {
    const { tx, client, assignment } = fixture();
    expect(
      await isBalancedMatchTypeSourceCurrent(client, "session", [assignment]),
    ).toBe(true);
    const rows = await tx.sessionPlayer.findMany();
    rows[2].mixedSideOverride = "LOWER";
    expect(
      await isBalancedMatchTypeSourceCurrent(client, "session", [assignment]),
    ).toBe(false);
  });
  it("detects a concurrent new commitment before an automatic writer", async () => {
    const { tx, client, assignment } = fixture();
    tx.match.findMany.mockResolvedValue([
      {
        id: "other",
        status: "IN_PROGRESS",
        team1Player1Id: "P2",
        team1Player2Id: "P9",
        team2Player1Id: "P3",
        team2Player2Id: "P10",
        completedAt: null,
      },
    ]);
    expect(
      await isBalancedMatchTypeSourceCurrent(client, "session", [assignment]),
    ).toBe(false);
  });
  it("rejects a grouped selection after the crossover setting changes", async () => {
    const { players, tx, client } = fixture();
    const settings = {
      sessionType: "ELO",
      sessionMode: "MIXICANO",
      groups: true,
      crossoverFrequency: "NEVER",
    };
    const snapshot = buildBalancedMatchTypeContext(players, [], {
      groups: true,
      policy: getBalancedMatchTypePolicyKey(settings),
    }).snapshot(partition)!;
    const assignment = {
      partition,
      matchmakingReasonJson: JSON.stringify({ balancedMatchType: snapshot }),
    };
    const session = {
      type: "ELO",
      mode: "MIXICANO",
      respectPlayerRest: true,
      poolsEnabled: true,
      crossoverFrequency: "NEVER",
    };
    tx.session.findUnique.mockResolvedValue(session);
    expect(
      await isBalancedMatchTypeSourceCurrent(client, "session", [assignment]),
    ).toBe(true);
    tx.session.findUnique.mockResolvedValue({
      ...session,
      crossoverFrequency: "ALWAYS",
    });
    expect(
      await isBalancedMatchTypeSourceCurrent(client, "session", [assignment]),
    ).toBe(false);
  });
  it("excludes the old queued assignment during a replacement", async () => {
    const { tx, client, assignment } = fixture();
    tx.queuedMatch.findUnique.mockResolvedValue({
      id: "old",
      team1Player1Id: "P2",
      team1Player2Id: "P9",
      team2Player1Id: "P3",
      team2Player2Id: "P10",
    });
    expect(
      await isBalancedMatchTypeSourceCurrent(
        client,
        "session",
        [assignment],
        true,
      ),
    ).toBe(true);
    expect(tx.queuedMatch.findUnique).not.toHaveBeenCalled();
  });
  it("records a manual target while retaining the source and existing side snapshot", async () => {
    const { players, client } = fixture();
    const sideSnapshot = buildSocialVarietySnapshot(partition, players);
    const json = await appendBalancedMatchTypeSnapshot(
      client,
      "session",
      partition,
      JSON.stringify({ source: "MANUAL", socialVariety: sideSnapshot }),
      { poolsEnabled: false },
    );
    const reason = JSON.parse(json);
    expect(reason.source).toBe("MANUAL");
    expect(reason.socialVariety).toEqual(sideSnapshot);
    expect(reason.balancedMatchType.category).toBe("MIXED");
    expect(reason.balancedMatchType.target.MIXED).toBeCloseTo(1 / 3);
    expect(reason.balancedPolicyDecision).toBeUndefined();
  });
});
