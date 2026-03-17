import { describe, expect, it } from "vitest";

import { SessionMode, SessionType } from "../../../types/enums";
import { buildRotationHistory, type PartitionCandidate } from "../partitioning";
import {
  findBestBatchAutoMatchSelectionV2,
  rankPlayersByRotationLoad,
} from "./index";

function createPlayers(
  entries: Array<{ id: string; matchesPlayed: number; rating: number }>
) {
  const now = new Date("2026-03-15T00:00:00Z");

  return {
    playersById: new Map<string, PartitionCandidate>(
      entries.map(({ id, rating }) => [
        id,
        {
          userId: id,
          elo: rating,
          pointDiff: 0,
          lastPartnerId: null,
          gender: "MALE",
          partnerPreference: "OPEN",
        },
      ])
    ),
    rankedCandidates: rankPlayersByRotationLoad(
      entries.map(({ id, matchesPlayed }, index) => ({
        userId: id,
        matchesPlayed,
        matchmakingMatchesCredit: 0,
        availableSince: new Date(now.getTime() - index * 1000),
      })),
      {
        now: now.getTime(),
        randomFn: () => 0,
      }
    ),
  };
}

describe("matchmaking v2 batch", () => {
  it("finds a 3-court open-mode batch in a larger pool", () => {
    const { playersById, rankedCandidates } = createPlayers(
      Array.from({ length: 21 }, (_, index) => ({
        id: `P${index + 1}`,
        matchesPlayed: index < 12 ? 0 : 2,
        rating: 1600 - index * 25,
      }))
    );

    const selection = findBestBatchAutoMatchSelectionV2(
      rankedCandidates,
      {
        playersById,
        rotationHistory: buildRotationHistory([]),
      },
      SessionMode.MEXICANO,
      SessionType.ELO,
      3
    );

    expect(selection).not.toBeNull();
    expect(selection?.selections).toHaveLength(3);
  });
});
