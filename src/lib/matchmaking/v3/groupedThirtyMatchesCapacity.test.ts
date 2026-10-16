import { describe, expect, it, vi } from "vitest";
import { buildMatchmakingState, getRankedCandidates, selectBatchMatches } from "@/app/api/sessions/[code]/generate-match/selection";
import type { GenerateMatchSession } from "@/app/api/sessions/[code]/generate-match/shared";
import { SessionMode, SessionType } from "@/types/enums";
import * as acceptance from "./balancedCandidateAcceptance";
import { createMatchmakingSearchBudget, getMatchmakingSearchPhaseDiagnostics } from "./searchBudget";
import snapshot from "./__tests__/fixtures/groupedThirtyMatches.json";

describe("24-player grouped Points Mixed after thirty matches", () => {
  it("fills all three courts after thirty actual completed matches", async () => {
    const joinedAt = new Date("2026-10-15T00:00:00Z");
    const session = {
      id: "capacity-12-12", code: "CAPACITY", clubId: null,
      type: SessionType.POINTS, mode: SessionMode.MIXICANO, poolsEnabled: true,
      respectPlayerRest: true, sessionClubs: [], queuedMatch: null,
      players: snapshot.players.map((player, index) => ({
        ...player, availableSince: new Date(player.availableSince), joinedAt, ladderEntryAt: joinedAt,
        arrivalPriorityAt: null, matchmakingMatchesCredit: 0, isPaused: false, isGuest: false,
        user: { id: player.userId, name: player.userId, elo: 1000 + index * 7 },
      })),
      matches: snapshot.matches.map((match) => ({ ...match, createdAt: new Date(match.createdAt), completedAt: new Date(match.completedAt) })),
      courts: snapshot.courts,
    } as unknown as GenerateMatchSession;
    let state = 1047291;
    const randomFn = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const searchBudget = createMatchmakingSearchBudget();
    const spy = vi.spyOn(acceptance, "runBalancedCandidateWithProductionFallback");
    try {
      const matchmakingState = await buildMatchmakingState(session);
      const { rankedCandidates } = getRankedCandidates(session, matchmakingState.busyPlayerIds);
      const result = selectBatchMatches({ ...matchmakingState, rankedCandidates, sessionData: session,
        requestedMatchCount: 3, requestedCourtIds: snapshot.courts.map((court) => court.id), randomFn, searchBudget });
      expect(result.selections).toHaveLength(3);
      const ids = result.selections.flatMap((selection) => selection.ids);
      expect(new Set(ids).size).toBe(12);
      expect(ids.every((id) => snapshot.players.some((player) => player.userId === id))).toBe(true);
      expect(result.selections.every((selection) => selection.balancedPolicyDecision?.outcome !== "no-certified-selection")).toBe(true);
      expect(5_000 - searchBudget.remainingMs()).toBeLessThanOrEqual(4_600);
    } finally {
      console.log(JSON.stringify({ phases: getMatchmakingSearchPhaseDiagnostics(searchBudget), decisions: spy.mock.results
        .flatMap((entry) => entry.type === "return" ? [entry.value.decision] : []) }));
      spy.mockRestore();
    }
  }, 15_000);
});
