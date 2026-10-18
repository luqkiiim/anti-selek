import { describe, expect, it, vi } from "vitest";
import { buildMatchmakingState, getRankedCandidates, selectBatchMatchesRespectingSkips } from "@/app/api/sessions/[code]/generate-match/selection";
import type { GenerateMatchSession } from "@/app/api/sessions/[code]/generate-match/shared";
import { CourtGroupType, SessionMode } from "@/types/enums";
import { isValidPartitionForMode } from "./balance";
import * as acceptance from "./balancedCandidateAcceptance";
import { createMatchmakingSearchBudget, getMatchmakingSearchPhaseDiagnostics } from "./searchBudget";
import snapshot from "./__tests__/fixtures/groupedTwentyFourSkewedThreeMatches.json";

describe("24-player grouped Points Mixed with an unattainable relaxed fairness bound", () => {
  it("fills three courts after the saved 14/10 skewed opening", async () => {
    const session = {
      ...snapshot,
      players: snapshot.players.map((player) => ({ ...player,
        availableSince: new Date(player.availableSince), joinedAt: new Date(player.joinedAt),
        ladderEntryAt: new Date(player.ladderEntryAt),
      })),
      matches: snapshot.matches.map((match) => ({ ...match,
        createdAt: new Date(match.createdAt), completedAt: new Date(match.completedAt),
      })),
    } as unknown as GenerateMatchSession;
    let state = 104730;
    const randomFn = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const searchBudget = createMatchmakingSearchBudget();
    const spy = vi.spyOn(acceptance, "runBalancedCandidateWithProductionFallback");
    try {
      const matchmakingState = await buildMatchmakingState(session);
      const { rankedCandidates } = getRankedCandidates(session, matchmakingState.busyPlayerIds);
      const result = selectBatchMatchesRespectingSkips({ ...matchmakingState, rankedCandidates, sessionData: session,
        requestedMatchCount: 3, requestedCourtIds: snapshot.courts.map((court) => court.id), randomFn, searchBudget }).selection;
      expect(result.selections).toHaveLength(3);
      const ids = result.selections.flatMap((selection) => selection.ids);
      expect(new Set(ids).size).toBe(12);
      // All twelve zero-count players cannot satisfy the grouped Mixed rules.
      // The legal optimum retains eleven and admits exactly one played player.
      expect(ids.filter((id) => snapshot.players.find((player) => player.userId === id)?.matchesPlayed === 0)).toHaveLength(11);
      const decision = spy.mock.results.flatMap((entry) => entry.type === "return" ? [entry.value.decision] : []).at(-1);
      expect(decision).toBeDefined();
      expect(["candidate-exact", "production-fallback"]).toContain(decision?.outcome);
      const proof = decision?.outcome === "candidate-exact" ? decision.candidateProof : decision?.fallbackProof;
      expect(proof).toMatchObject({ selectionPresent: true, fairnessCertified: true, scheduleCertified: true,
        starvationCertified: true, balanceCertified: true, replayCertified: true, coverageGateCertified: true });
      if (decision?.outcome === "candidate-exact") {
        expect(decision.candidateProof.fullSearchCertified).toBe(true);
      } else {
        expect(decision?.fallbackProof?.certified).toBe(true);
        expect(["core-only", "core-and-production-ranking"]).toContain(decision?.fallbackProof?.certificationScope);
      }
      const byId = new Map(session.players.map((player) => [player.userId, player]));
      for (const selection of result.selections) {
        expect(isValidPartitionForMode(selection.partition, byId, SessionMode.MIXICANO)).toBe(true);
        const teams = [selection.partition.team1, selection.partition.team2];
        expect(teams.flat().slice().sort()).toEqual([...selection.ids].sort());
        const groupA = teams.map((team) => team.filter((id) => byId.get(id)?.pool === "A").length);
        expect(Object.values(CourtGroupType)).toContain(selection.courtGroupType);
        if (selection.courtGroupType === CourtGroupType.COMPETITIVE) expect(groupA).toEqual([2, 2]);
        if (selection.courtGroupType === CourtGroupType.SOCIAL) expect(groupA).toEqual([0, 0]);
        if (selection.courtGroupType === CourtGroupType.CROSSOVER) expect(groupA).toEqual([1, 1]);
        if (selection.courtGroupType === CourtGroupType.OPEN_OVERFLOW) {
          expect([1, 2, 3]).toContain(groupA[0] + groupA[1]);
          if (groupA[0] + groupA[1] === 2) expect(groupA.slice().sort()).toEqual([0, 2]);
        }
      }
      expect(5_000 - searchBudget.remainingMs()).toBeLessThanOrEqual(4_600);
    } finally {
      console.log(JSON.stringify({ phases: getMatchmakingSearchPhaseDiagnostics(searchBudget), decisions: spy.mock.results
        .flatMap((entry) => entry.type === "return" ? [entry.value.decision] : []) }));
      spy.mockRestore();
    }
  }, 15_000);
});
