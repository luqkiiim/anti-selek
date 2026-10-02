import { describe, expect, it } from "vitest";
import { MatchStatus } from "@/types/enums";
import { buildSocialSessionHistory } from "./socialSessionHistory";
import { buildSocialVarietySnapshot } from "./v3/socialVariety";

const partition = { team1: ["M1", "F1"] as [string, string], team2: ["M2", "F2"] as [string, string] };
const players = ["M1", "M2", "F1", "F2"].map((userId) => ({
  userId, gender: userId.startsWith("M") ? "MALE" : "FEMALE",
  partnerPreference: userId.startsWith("M") ? "OPEN" : "FEMALE_FLEX",
}));
function row(id: string, status: MatchStatus) {
  return {
    id, status, team1User1Id: "M1", team1User2Id: "F1",
    team2User1Id: "M2", team2User2Id: "F2", matchmakingReasonJson: null as string | null,
  };
}

describe("Social committed history", () => {
  it("retains completed repeats and counts every committed/manual status", () => {
    const matches = [
      row("done1", MatchStatus.COMPLETED), row("done2", MatchStatus.COMPLETED),
      row("pending", MatchStatus.PENDING), row("playing", MatchStatus.IN_PROGRESS),
      row("approval", MatchStatus.PENDING_APPROVAL),
      { ...row("cancelled", MatchStatus.PENDING), status: "CANCELLED" },
    ];
    expect(buildSocialSessionHistory({ matches }).map((match) => match.id)).toEqual([
      "done1", "done2", "pending", "playing", "approval",
    ]);
  });

  it("counts queue-to-active transition once but allows another game after completion", () => {
    const queuedMatch = row("queued", MatchStatus.PENDING);
    expect(buildSocialSessionHistory({ matches: [row("active", MatchStatus.IN_PROGRESS)], queuedMatch })).toHaveLength(1);
    expect(buildSocialSessionHistory({ matches: [row("done", MatchStatus.COMPLETED)], queuedMatch })).toHaveLength(2);
    expect(buildSocialSessionHistory({ matches: [], queuedMatch })).toHaveLength(1);
  });

  it("drops replaced reservations and preserves snapshots independent of the reason format", () => {
    const snapshot = buildSocialVarietySnapshot(partition, players);
    const matches = [
      { ...row("manual", MatchStatus.COMPLETED), matchmakingReasonJson: JSON.stringify({ socialVariety: snapshot }) },
      { ...row("interclub", MatchStatus.PENDING), matchmakingReasonJson: JSON.stringify({ type: "INTERCLUB", socialVariety: snapshot }) },
    ];
    expect(buildSocialSessionHistory({ matches }).map((match) => match.socialVariety)).toEqual([snapshot, snapshot]);
    expect(buildSocialSessionHistory({ matches, queuedMatch: row("queue", MatchStatus.PENDING) }, {
      excludeMatchIds: new Set(["interclub"]), excludeQueuedMatch: true,
    }).map((match) => match.id)).toEqual(["manual"]);
    expect(buildSocialSessionHistory({ matches: matches.slice(0, 1) })).toHaveLength(1);
  });
});
