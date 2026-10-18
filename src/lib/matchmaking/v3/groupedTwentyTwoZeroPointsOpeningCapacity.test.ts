import { describe, expect, it, vi } from "vitest";
import { buildMatchmakingState, getRankedCandidates, selectBatchMatchesRespectingSkips } from "@/app/api/sessions/[code]/generate-match/selection";
import type { GenerateMatchSession } from "@/app/api/sessions/[code]/generate-match/shared";
import { CourtGroupType, SessionMode } from "@/types/enums";
import { isValidPartitionForMode } from "./balance";
import * as acceptance from "./balancedCandidateAcceptance";
import { createMatchmakingSearchBudget } from "./searchBudget";
import snapshot from "./__tests__/fixtures/groupedTwentyTwoZeroPointsOpening.json";

describe("22-player grouped Points Mixed with all-zero opening standings", () => {
  it("certifies the exact opening before falling back to production ranking", async () => {
    // Sanitized from the synthetic hosted opening: source array order, settings,
    // timestamps, count/Points/rest state and preferences are preserved. IDs and
    // names are renamed; club/UI metadata is irrelevant to Points preparation.
    const session = { ...snapshot,
      players: snapshot.players.map((player) => ({ ...player,
        availableSince: new Date(player.availableSince), joinedAt: new Date(player.joinedAt),
        ladderEntryAt: new Date(player.ladderEntryAt),
      })),
    } as unknown as GenerateMatchSession;
    let state = 1;
    const randomFn = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const searchBudget = createMatchmakingSearchBudget();
    const spy = vi.spyOn(acceptance, "runBalancedCandidateWithProductionFallback");
    try {
      const matchmakingState = await buildMatchmakingState(session);
      const { rankedCandidates } = getRankedCandidates(session, matchmakingState.busyPlayerIds);
      const result = selectBatchMatchesRespectingSkips({ ...matchmakingState, rankedCandidates, sessionData: session,
        requestedMatchCount: 3, requestedCourtIds: snapshot.courts.map((court) => court.id), randomFn, searchBudget }).selection;
      expect(result.selections).toHaveLength(3);
      expect(new Set(result.selections.flatMap((selection) => selection.ids)).size).toBe(12);
      expect(result.selections.map((selection) => selection.courtGroupType).sort()).toEqual([
        CourtGroupType.COMPETITIVE, CourtGroupType.CROSSOVER, CourtGroupType.SOCIAL,
      ].sort());
      const byId = new Map(session.players.map((player) => [player.userId, player]));
      for (const selection of result.selections) {
        expect(isValidPartitionForMode(selection.partition, byId, SessionMode.MIXICANO)).toBe(true);
        const groupA = [selection.partition.team1, selection.partition.team2]
          .map((team) => team.filter((id) => byId.get(id)?.pool === "A").length);
        if (selection.courtGroupType === CourtGroupType.COMPETITIVE) expect(groupA).toEqual([2, 2]);
        if (selection.courtGroupType === CourtGroupType.CROSSOVER) expect(groupA).toEqual([1, 1]);
        if (selection.courtGroupType === CourtGroupType.SOCIAL) expect(groupA).toEqual([0, 0]);
      }
      const decision = spy.mock.results.flatMap((entry) => entry.type === "return" ? [entry.value.decision] : []).at(-1);
      expect(decision).toMatchObject({ outcome: "candidate-exact", candidateProof: {
        selectionPresent: true, fairnessCertified: true, scheduleCertified: true, starvationCertified: true,
        balanceCertified: true, replayCertified: true, coverageGateCertified: true,
        recurrenceFrontierCertified: true, recurrenceAdmissionCertified: true, fullSearchCertified: true,
      } });
    } finally {
      spy.mockRestore();
    }
  }, 15_000);
});
