import { describe, expect, it } from "vitest";

import {
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionType,
} from "../../../types/enums";
import {
  buildBalancedMixedRotationObligations,
  buildBalancedMixedBatchSelectionOverride,
  buildBalancedMixedSingleSelectionOverride,
  isBalancedMixedRotationBatchWithinBounds,
} from "./balancedMixedRotation";
import type {
  ActiveMatchmakerV3Player,
  V3BalancedMixedRotationMetadata,
  V3BatchSelection,
  V3CompletedMatch,
  V3SingleCourtSelection,
} from "./types";
import { findBestBatchSelectionV3 } from "./batch";
import { findBestSingleCourtSelectionV3 } from "./singleCourt";
import type { V3MixedHistoryMatch } from "./mixedVariety";

const BASE_TIME = "2026-09-30T10:00:00.000Z";

function createPlayer(
  userId: string,
  side: "UPPER" | "LOWER",
  overrides: Partial<ActiveMatchmakerV3Player> = {}
): ActiveMatchmakerV3Player {
  return {
    userId,
    matchesPlayed: 0,
    matchmakingBaseline: 0,
    availableSince: new Date("2026-09-30T00:00:00.000Z"),
    strength: 1000,
    gender: side === "UPPER" ? PlayerGender.MALE : PlayerGender.FEMALE,
    partnerPreference:
      side === "UPPER"
        ? PartnerPreference.OPEN
        : PartnerPreference.FEMALE_FLEX,
    isBusy: false,
    isPaused: false,
    effectiveMatchCount: 0,
    restTurns: 0,
    needsMoreRest: false,
    moreRestTarget: 0,
    moreRestDeficit: 0,
    randomScore: 0,
    rank: 0,
    ...overrides,
  };
}

function createPlayers(count = 12) {
  return Array.from({ length: count }, (_, index) =>
    createPlayer(
      `P${index + 1}`,
      index < Math.ceil(count / 2) ? "UPPER" : "LOWER"
    )
  );
}

function createSelection(
  players: ActiveMatchmakerV3Player[],
  ids: [string, string, string, string],
  mixedVarietyPenalty = 0,
  balanceGap = 0
): V3SingleCourtSelection<ActiveMatchmakerV3Player> {
  const playersById = new Map(players.map((player) => [player.userId, player]));
  const selectedPlayers = ids.map((id) => playersById.get(id)!);
  const upper = selectedPlayers.filter(
    (player) => player.gender === PlayerGender.MALE
  );
  const lower = selectedPlayers.filter(
    (player) => player.gender === PlayerGender.FEMALE
  );
  const partition = {
    team1: [upper[0]!.userId, lower[0]!.userId] as [string, string],
    team2: [upper[1]!.userId, lower[1]!.userId] as [string, string],
  };

  return {
    ids,
    players: selectedPlayers as V3SingleCourtSelection<ActiveMatchmakerV3Player>["players"],
    partition,
    restSummary: {
      totalRestTurns: 0,
      minimumRestTurns: 0,
      restTurnVector: [0, 0, 0, 0],
    },
    balanceGap,
    pointDiffGap: 0,
    sharedCourtRepeatPenalty: 0,
    partnerCoveragePenalty: 0,
    opponentCoveragePenalty: 0,
    partnerRepeatPenalty: 0,
    opponentRepeatPenalty: 0,
    exactRematchPenalty: 0,
    mixedVarietyPenalty,
    mixedGlobalVarietyPenalty: 0,
    mixedGame: true,
    consecutivePlayCount: 0,
    consecutivePlayMaxBurden: 0,
    consecutivePlayTotalBurden: 0,
    randomScore: 0,
    pairingRandomScore: 0,
  };
}

function makeRotationMetadata(
  decisionId: string,
  timestamp: string,
  deferredPlayerIds: string[],
  overrides: Partial<V3BalancedMixedRotationMetadata> = {}
): V3BalancedMixedRotationMetadata {
  return {
    decisionId,
    timestamp,
    courtType: "MIXED",
    deferredPlayerIds,
    servedPlayerIds: [],
    obligationOwner: true,
    target: { mixed: 0.5, upperSameSide: 0.25, lowerSameSide: 0.25 },
    ...overrides,
  };
}

function createBatch(
  selection: V3SingleCourtSelection<ActiveMatchmakerV3Player>,
  totalMixedVarietyPenalty: number
): V3BatchSelection<ActiveMatchmakerV3Player> {
  return {
    selections: [selection],
    restSummary: selection.restSummary,
    maxBalanceGap: selection.balanceGap,
    totalBalanceGap: selection.balanceGap,
    maxPointDiffGap: selection.pointDiffGap,
    totalPointDiffGap: selection.pointDiffGap,
    totalSharedCourtRepeatPenalty: 0,
    totalPartnerCoveragePenalty: 0,
    totalOpponentCoveragePenalty: 0,
    totalPartnerRepeatPenalty: 0,
    totalOpponentRepeatPenalty: 0,
    totalExactRematchPenalty: 0,
    totalMixedVarietyPenalty,
    totalMixedGlobalVarietyPenalty: 0,
    totalRandomScore: 0,
    totalPairingRandomScore: 0,
    sidePairingLayoutKeys: ["", ""],
    sidePairingRandomScores: [0, 0],
  };
}

function event(
  createdAt: string,
  userIds: string[],
  metadata?: V3BalancedMixedRotationMetadata
) {
  return {
    createdAt,
    userIds,
    matchmakingReasonJson: metadata
      ? JSON.stringify({ balancedMixedRotation: metadata })
      : null,
  };
}

describe("Balanced Mixed rotation safety", () => {
  it("caps whole-batch deferrals at two and permits a one-match replacement gap", () => {
    const players = [
      createPlayer("P1", "UPPER"),
      createPlayer("P2", "UPPER"),
      createPlayer("P3", "LOWER"),
      createPlayer("P4", "LOWER"),
      createPlayer("P5", "UPPER"),
      createPlayer("P6", "UPPER"),
      createPlayer("P7", "LOWER"),
      createPlayer("P8", "LOWER"),
      createPlayer("P9", "LOWER", { effectiveMatchCount: 1 }),
      createPlayer("P10", "LOWER", { effectiveMatchCount: 1 }),
      createPlayer("P11", "LOWER"),
    ];
    for (const id of ["P4", "P8"]) {
      players.find((player) => player.userId === id)!.effectiveMatchCount = 0;
    }
    for (const id of ["P9", "P10"]) {
      players.find((player) => player.userId === id)!.effectiveMatchCount = 1;
    }

    const baselineSelections = [
      createSelection(players, ["P1", "P2", "P3", "P4"]),
      createSelection(players, ["P5", "P6", "P7", "P8"]),
    ];
    const oneForOneSelections = [
      createSelection(players, ["P1", "P2", "P3", "P9"]),
      createSelection(players, ["P5", "P6", "P7", "P10"]),
    ];

    expect(
      isBalancedMixedRotationBatchWithinBounds({
        baselineSelections,
        candidateSelections: oneForOneSelections,
        players,
        sessionType: SessionType.POINTS,
        respectPlayerRest: true,
      })
    ).toBe(true);

    const threeDeferredSelections = [
      createSelection(players, ["P1", "P2", "P9", "P10"]),
      createSelection(players, ["P5", "P6", "P7", "P11"]),
    ];
    expect(
      isBalancedMixedRotationBatchWithinBounds({
        baselineSelections,
        candidateSelections: threeDeferredSelections,
        players,
        sessionType: SessionType.POINTS,
        respectPlayerRest: true,
      })
    ).toBe(false);

    players.find((player) => player.userId === "P9")!.effectiveMatchCount = 2;
    expect(
      isBalancedMixedRotationBatchWithinBounds({
        baselineSelections,
        candidateSelections: oneForOneSelections,
        players,
        sessionType: SessionType.POINTS,
        respectPlayerRest: true,
      })
    ).toBe(false);
  });

  it("projects outstanding matches before accepting a replacement batch", () => {
    const players = createPlayers(8);
    const baseline = [createSelection(players, ["P1", "P2", "P5", "P6"])];
    const candidate = [createSelection(players, ["P1", "P2", "P7", "P8"])];

    expect(
      isBalancedMixedRotationBatchWithinBounds({
        baselineSelections: baseline,
        candidateSelections: candidate,
        players,
        sessionType: SessionType.POINTS,
        respectPlayerRest: true,
      })
    ).toBe(true);

    const outstanding = new Map(
      ["P7", "P8"].map((id) => [id, 2])
    );
    expect(
      isBalancedMixedRotationBatchWithinBounds({
        baselineSelections: baseline,
        candidateSelections: candidate,
        players,
        outstandingMatchCountByUserId: outstanding,
        sessionType: SessionType.POINTS,
        respectPlayerRest: true,
      })
    ).toBe(false);
  });

  it("does not add a player who is owed more rest, and bypasses rest-only guards when disabled", () => {
    const players = createPlayers(8);
    const newPlayer = players.find((player) => player.userId === "P8")!;
    newPlayer.moreRestDeficit = 1;
    const baseline = [createSelection(players, ["P1", "P2", "P5", "P6"])];
    const candidate = [createSelection(players, ["P1", "P2", "P5", "P8"])];
    const completedMatches: V3CompletedMatch[] = [
      {
        team1: ["P8", "P1"],
        team2: ["P2", "P3"],
        completedAt: new Date("2026-09-30T09:00:00.000Z"),
      },
      {
        team1: ["P8", "P4"],
        team2: ["P5", "P6"],
        completedAt: new Date("2026-09-30T09:30:00.000Z"),
      },
    ];

    expect(
      isBalancedMixedRotationBatchWithinBounds({
        baselineSelections: baseline,
        candidateSelections: candidate,
        players,
        completedMatches,
        sessionType: SessionType.POINTS,
        respectPlayerRest: true,
      })
    ).toBe(false);
    expect(
      isBalancedMixedRotationBatchWithinBounds({
        baselineSelections: baseline,
        candidateSelections: candidate,
        players,
        completedMatches,
        sessionType: SessionType.POINTS,
        respectPlayerRest: false,
      })
    ).toBe(true);
  });

  it("rejects an added player who would play a third consecutive match", () => {
    const players = createPlayers(8);
    const baseline = [createSelection(players, ["P1", "P2", "P5", "P6"])];
    const candidate = [createSelection(players, ["P1", "P2", "P5", "P8"])];
    const completedMatches: V3CompletedMatch[] = [
      {
        team1: ["P8", "P1"],
        team2: ["P2", "P3"],
        completedAt: new Date("2026-09-30T09:00:00.000Z"),
      },
      {
        team1: ["P8", "P4"],
        team2: ["P5", "P6"],
        completedAt: new Date("2026-09-30T09:30:00.000Z"),
      },
    ];

    expect(
      isBalancedMixedRotationBatchWithinBounds({
        baselineSelections: baseline,
        candidateSelections: candidate,
        players,
        completedMatches,
        sessionType: SessionType.POINTS,
        respectPlayerRest: true,
      })
    ).toBe(false);
  });

  it("preserves a baseline player's arrival priority", () => {
    const players = createPlayers(8);
    players.find((player) => player.userId === "P1")!.arrivalPriorityAt =
      new Date("2026-09-30T09:45:00.000Z");
    const baseline = [createSelection(players, ["P1", "P2", "P5", "P6"])];
    const candidate = [createSelection(players, ["P3", "P2", "P5", "P6"])];

    expect(
      isBalancedMixedRotationBatchWithinBounds({
        baselineSelections: baseline,
        candidateSelections: candidate,
        players,
        sessionType: SessionType.POINTS,
        respectPlayerRest: true,
      })
    ).toBe(false);
  });

  it("catches up the oldest feasible obligation and never defers a player already owed a turn", () => {
    const players = [
      createPlayer("U1", "UPPER"),
      createPlayer("U2", "UPPER"),
      createPlayer("U3", "UPPER"),
      createPlayer("U4", "UPPER"),
      createPlayer("L1", "LOWER"),
      createPlayer("L2", "LOWER"),
      createPlayer("L3", "LOWER"),
      createPlayer("L4", "LOWER"),
    ];
    const baseline = createSelection(
      players,
      ["U1", "U2", "L1", "L2"],
      0
    );
    const catchupU3 = createSelection(
      players,
      ["U1", "U3", "L1", "L2"],
      -1
    );
    const catchupU4 = createSelection(
      players,
      ["U2", "U4", "L1", "L2"],
      -2
    );
    const choose = buildBalancedMixedSingleSelectionOverride({
      players,
      mixedHistoryMatches: [],
      completedMatches: [],
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.POINTS,
      respectPlayerRest: true,
      pendingObligations: [
        { playerId: "OFFLINE", decisionId: "d0", timestamp: new Date(BASE_TIME) },
        {
          playerId: "U3",
          decisionId: "d1",
          timestamp: new Date("2026-09-30T10:01:00.000Z"),
        },
        {
          playerId: "U4",
          decisionId: "d2",
          timestamp: new Date("2026-09-30T10:02:00.000Z"),
        },
      ],
      decisionId: "catchup",
      timestamp: BASE_TIME,
    })!;

    const selected = choose({
      baselineSelection: baseline,
      candidates: [catchupU3, catchupU4],
    });
    expect(selected?.ids).toEqual(catchupU3.ids);
    expect(selected?.balancedMixedRotation?.servedPlayerIds).toEqual(["U3"]);
    expect(selected?.balancedMixedRotation?.deferredPlayerIds).toEqual(["U2"]);

    const owedU2 = buildBalancedMixedSingleSelectionOverride({
      players,
      mixedHistoryMatches: [],
      completedMatches: [],
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.POINTS,
      respectPlayerRest: true,
      pendingObligations: [
        { playerId: "U2", decisionId: "old", timestamp: new Date(BASE_TIME) },
      ],
      decisionId: "no-repeat",
      timestamp: BASE_TIME,
    })!;
    const attemptedRedeferral = owedU2({
      baselineSelection: baseline,
      candidates: [catchupU3],
    });
    expect(attemptedRedeferral?.ids).toEqual(baseline.ids);
    expect(attemptedRedeferral?.balancedMixedRotation?.servedPlayerIds).toEqual([
      "U2",
    ]);
    expect(
      attemptedRedeferral?.balancedMixedRotation?.deferredPlayerIds
    ).toEqual([]);
  });

  it("honors the oldest feasible batch catch-up even when it increases composition debt", () => {
    const players = [
      createPlayer("U1", "UPPER"),
      createPlayer("U2", "UPPER"),
      createPlayer("U3", "UPPER"),
      createPlayer("U4", "UPPER"),
      createPlayer("L1", "LOWER"),
      createPlayer("L2", "LOWER"),
      createPlayer("L3", "LOWER"),
      createPlayer("L4", "LOWER"),
    ];
    const baseline = createSelection(players, ["U1", "U2", "L1", "L2"], 0);
    const catchup = createSelection(players, ["U1", "U3", "L1", "L2"], 100);
    const choose = buildBalancedMixedBatchSelectionOverride({
      players,
      mixedHistoryMatches: [],
      completedMatches: [],
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.POINTS,
      respectPlayerRest: true,
      pendingObligations: [
        { playerId: "U3", decisionId: "older", timestamp: new Date(BASE_TIME) },
      ],
      decisionId: "batch-catchup",
      timestamp: BASE_TIME,
    })!;

    const selected = choose({
      baselineSelection: createBatch(baseline, 0),
      candidates: [createBatch(catchup, 100)],
    });
    expect(selected?.selections[0]?.ids).toEqual(catchup.ids);
    expect(selected?.selections[0]?.balancedMixedRotation?.servedPlayerIds).toEqual([
      "U3",
    ]);
    expect(
      selected?.selections[0]?.balancedMixedRotation?.deferredPlayerIds
    ).toEqual(["U2"]);
  });

  it("marks a strict batch fallback after the varied search budget is exhausted", () => {
    const players = createPlayers(8);
    const mixedHistoryMatches: V3MixedHistoryMatch[] = [];
    const result = findBestBatchSelectionV3(players, {
      courtCount: 1,
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.POINTS,
      mixedHistoryMatches,
      selectionOverride: buildBalancedMixedBatchSelectionOverride({
        players,
        mixedHistoryMatches,
        sessionMode: SessionMode.MIXICANO,
        sessionType: SessionType.POINTS,
        respectPlayerRest: true,
      }),
      randomFn: () => 0.25,
      searchLimits: { maxBranches: 3, maxMs: 1000 },
    });

    expect(result.selection).not.toBeNull();
    expect(result.debug.searchLimitReached).toBe(true);
    expect(
      result.selection?.selections[0]?.balancedMixedRotation?.fallbackReason
    ).toBe("SEARCH_BUDGET");
    expect(
      result.selection?.selections[0]?.balancedMixedRotation?.deferredPlayerIds
    ).toEqual([]);
  });

  it("searches batches that can skip the first unlocked anchor player", () => {
    const players = createPlayers(12);
    let searchedCandidates: V3BatchSelection[] = [];
    const result = findBestBatchSelectionV3(players, {
      courtCount: 2,
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.POINTS,
      selectionOverride: ({ baselineSelection, candidates }) => {
        searchedCandidates = candidates;
        return baselineSelection;
      },
      randomFn: () => 0.25,
      searchLimits: { maxBranches: 100_000, maxMs: 10_000 },
    });
    const firstAnchorId = result.debug.candidatePlayerIds[0];

    expect(result.selection).not.toBeNull();
    expect(firstAnchorId).toBeDefined();
    expect(
      searchedCandidates.some((selection) =>
        selection.selections.every((match) => !match.ids.includes(firstAnchorId!))
      )
    ).toBe(true);
  }, 15_000);

  it("reports the pool that contains the selected single-court quartet", () => {
    const players = createPlayers(12);
    const mixedHistoryMatches: V3MixedHistoryMatch[] = [];
    const result = findBestSingleCourtSelectionV3(players, {
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.POINTS,
      mixedHistoryMatches,
      selectionOverride: buildBalancedMixedSingleSelectionOverride({
        players,
        mixedHistoryMatches,
        completedMatches: [],
        sessionMode: SessionMode.MIXICANO,
        sessionType: SessionType.POINTS,
        respectPlayerRest: true,
      }),
      randomFn: () => 0.25,
    });

    expect(result.selection).not.toBeNull();
    expect(
      result.selection!.ids.every((id) => result.debug.candidatePlayerIds.includes(id))
    ).toBe(true);
  });

  it("replays queue changes, clearing replaced, canceled, newly available, and paused obligations", () => {
    const deferredAt = "2026-09-30T10:00:00.000Z";
    const deferP1 = event(deferredAt, ["P2", "P3", "P4", "P5"],
      makeRotationMetadata("decision-1", deferredAt, ["P1"]));
    const players = [
      { userId: "P1", availableSince: "2026-09-30T09:00:00.000Z", isPaused: false },
      { userId: "P2", availableSince: "2026-09-30T09:00:00.000Z", isPaused: false },
      { userId: "P3", availableSince: "2026-09-30T09:00:00.000Z", isPaused: false },
      { userId: "P4", availableSince: "2026-09-30T09:00:00.000Z", isPaused: false },
      { userId: "P5", availableSince: "2026-09-30T09:00:00.000Z", isPaused: false },
    ];

    expect(
      buildBalancedMixedRotationObligations({ players, events: [deferP1] }).map(
        (item) => item.playerId
      )
    ).toEqual(["P1"]);

    const replacedByLaterSchedule = event(
      "2026-09-30T10:05:00.000Z",
      ["P1", "P2", "P3", "P4"]
    );
    expect(
      buildBalancedMixedRotationObligations({
        players,
        events: [deferP1, replacedByLaterSchedule],
      })
    ).toEqual([]);

    const replacedQueuedRecordWithOldCreatedAt = {
      createdAt: deferredAt,
      userIds: ["P1", "P2", "P3", "P4"],
      matchmakingReasonJson: JSON.stringify({
        type: "INTERCLUB",
        balancedMixedRotation: makeRotationMetadata(
          "replacement-decision",
          "2026-09-30T10:05:00.000Z",
          []
        ),
      }),
    };
    expect(
      buildBalancedMixedRotationObligations({
        players,
        events: [deferP1, replacedQueuedRecordWithOldCreatedAt],
      })
    ).toEqual([]);

    expect(
      buildBalancedMixedRotationObligations({ players, events: [] })
    ).toEqual([]);

    expect(
      buildBalancedMixedRotationObligations({
        players: players.map((player) =>
          player.userId === "P1"
            ? { ...player, availableSince: "2026-09-30T10:01:00.000Z" }
            : player
        ),
        events: [deferP1],
      })
    ).toEqual([]);
    expect(
      buildBalancedMixedRotationObligations({
        players: players.map((player) =>
          player.userId === "P1" ? { ...player, isPaused: true } : player
        ),
        events: [deferP1],
      })
    ).toEqual([]);
  });

  it("ignores non-owner and legacy events without rotation metadata", () => {
    const time = "2026-09-30T10:00:00.000Z";
    const players = [
      { userId: "P1", availableSince: "2026-09-30T09:00:00.000Z", isPaused: false },
    ];
    const notOwner = makeRotationMetadata("batch-1", time, ["P1"], {
      obligationOwner: false,
    });

    expect(
      buildBalancedMixedRotationObligations({
        players,
        events: [
          event(time, ["P1"], notOwner),
          { createdAt: time, userIds: ["P1"], matchmakingReasonJson: null },
          { createdAt: time, userIds: ["P1"], matchmakingReasonJson: "not-json" },
        ],
      })
    ).toEqual([]);
  });
});
