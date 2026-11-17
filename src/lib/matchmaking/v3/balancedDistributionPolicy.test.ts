import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionMode, SessionType } from "../../../types/enums";
import {
  runBalancedCandidateWithProductionFallback,
  verifyBalancedCandidateAcceptance,
} from "./balancedCandidateAcceptance";
import { buildBalancedMatchTypeContext } from "./balancedMatchTypes";
import { getDoublesPartitions, isValidPartitionForMode } from "./balance";
import { buildSocialVarietySnapshot } from "./socialVariety";
import type {
  MatchmakerV3Player,
  SocialHistoryMatch,
  V3DoublesPartition,
} from "./types";

const round = (value: number) => Math.round(value * 1e12) / 1e12;
function fixture() {
  const players: MatchmakerV3Player[] = Array.from(
    { length: 8 },
    (_, index) => ({
      userId: `P${index}`,
      matchesPlayed: 2,
      matchmakingBaseline: 0,
      availableSince: new Date(0),
      restTurns: 2,
      strength: 1000,
      gender: index < 4 ? "MALE" : "FEMALE",
      partnerPreference: index < 4 ? "OPEN" : "FEMALE_FLEX",
    }),
  );
  const mixed: V3DoublesPartition = {
    team1: ["P0", "P4"],
    team2: ["P1", "P5"],
  };
  const initial = buildBalancedMatchTypeContext(players, []);
  const history: SocialHistoryMatch[] = Array.from({ length: 3 }, (_, i) => ({
    id: `h${i}`,
    ...mixed,
    completedAt: new Date(i + 1),
    socialVariety: buildSocialVarietySnapshot(mixed, players),
    balancedMatchType: initial.snapshot(mixed)!,
  }));
  return { players, history };
}

/** Independent arithmetic for the fixture, without the production score/context helper. */
function oracleScore(
  partitions: V3DoublesPartition[],
  history: SocialHistoryMatch[],
): [number, number] {
  const counts = { UPPER: 0, MIXED: 3, LOWER: 0 };
  let individual = 0;
  for (const partition of partitions) {
    const ids = [...partition.team1, ...partition.team2];
    const maleCount = ids.filter((id) => Number(id.slice(1)) < 4).length;
    const type =
      maleCount === 4 ? "UPPER" : maleCount === 0 ? "LOWER" : "MIXED";
    counts[type]++;
    for (const id of ids) {
      const n = history.filter((match) =>
        [...match.team1, ...match.team2].includes(id),
      ).length;
      if (!n) continue;
      const before = n - n / 3,
        after = n + (type === "MIXED" ? 1 : 0) - (n + 1) / 3;
      individual += (after * after) / (n + 1) - (before * before) / n;
    }
  }
  const total = 3 + partitions.length;
  return [
    round(
      Object.values(counts).reduce(
        (sum, count) => sum + ((count - total / 3) / total) ** 2,
        0,
      ),
    ),
    round(individual),
  ];
}
const compare = (a: number[], b: number[]) => a[0] - b[0] || a[1] - b[1];
afterEach(() => vi.unstubAllEnvs());

describe("adaptive Balanced selection and acceptance", () => {
  it.each([1, 2])(
    "matches an independent exhaustive category/individual oracle for %s courts",
    (courtCount) => {
      vi.stubEnv("BALANCED_MATCH_TYPE_DISTRIBUTION_ENABLED", "1");
      const { players, history } = fixture();
      const options = {
        courtCount,
        sessionMode: SessionMode.MIXICANO,
        sessionType: SessionType.ELO,
        respectPlayerRest: true,
        socialStructuralOpportunityConstraints: [],
        completedMatches: history,
        socialHistoryMatches: history,
        randomFn: () => 0.3,
      };
      const run = runBalancedCandidateWithProductionFallback({
        candidatePlayers: players,
        options,
      });
      expect(run.decision.outcome).toBe("candidate-exact");
      const byId = new Map(players.map((player) => [player.userId, player]));
      const candidates: V3DoublesPartition[] = [];
      for (let a = 0; a < 5; a++)
        for (let b = a + 1; b < 6; b++)
          for (let c = b + 1; c < 7; c++)
            for (let d = c + 1; d < 8; d++)
              for (const partition of getDoublesPartitions([
                `P${a}`,
                `P${b}`,
                `P${c}`,
                `P${d}`,
              ]))
                if (
                  isValidPartitionForMode(partition, byId, SessionMode.MIXICANO)
                )
                  candidates.push(partition);
      let best: [number, number] = [Infinity, Infinity];
      for (const first of candidates) {
        const batches =
          courtCount === 1
            ? [[first]]
            : candidates
                .filter(
                  (second) =>
                    new Set([
                      ...first.team1,
                      ...first.team2,
                      ...second.team1,
                      ...second.team2,
                    ]).size === 8,
                )
                .map((second) => [first, second]);
        for (const batch of batches) {
          const score = oracleScore(batch, history);
          if (compare(score, best) < 0) best = score;
        }
      }
      expect(
        oracleScore(
          run.result.selection!.selections.map((court) => court.partition),
          history,
        ),
      ).toEqual(best);
      expect(run.decision.matchTypeDistribution?.score).toEqual(best);
      // The T frontier is flat before first exposure completes. It still must
      // establish the category optimum rather than reusing an arbitrary witness.
      expect(run.decision.matchTypeDistribution?.minimumReplay?.error).toBe(
        best[0],
      );
    },
  );
  it("rejects a tampered distribution certificate", () => {
    vi.stubEnv("BALANCED_MATCH_TYPE_DISTRIBUTION_ENABLED", "1");
    const { players, history } = fixture();
    const options = {
      courtCount: 1,
      sessionMode: SessionMode.MIXICANO,
      sessionType: SessionType.ELO,
      socialStructuralOpportunityConstraints: [],
      completedMatches: history,
      socialHistoryMatches: history,
      randomFn: () => 0.2,
    };
    const run = runBalancedCandidateWithProductionFallback({
      candidatePlayers: players,
      options,
    });
    const result = run.result as Parameters<
      typeof verifyBalancedCandidateAcceptance<MatchmakerV3Player>
    >[3];
    expect(run.decision.outcome).toBe("candidate-exact");
    result!.matchTypeDistribution!.score = [1, 1];
    const candidateOptions = {
      ...options,
      sessionType: SessionType.ELO as const,
      recurrencePolicy: "strict-replay-rescue" as const,
      balancedMatchTypeContext: buildBalancedMatchTypeContext(players, history),
    };
    expect(
      verifyBalancedCandidateAcceptance(
        players,
        candidateOptions,
        options,
        result,
      ),
    ).toContain("MATCH_TYPE_SCORE_MISMATCH");
  });
  it("supports the explicit rest opt-out without claiming enabled replay gates", () => {
    vi.stubEnv("BALANCED_MATCH_TYPE_DISTRIBUTION_ENABLED", "1");
    const { players, history } = fixture();
    const run = runBalancedCandidateWithProductionFallback({
      candidatePlayers: players,
      options: {
        courtCount: 1,
        sessionType: SessionType.POINTS,
        sessionMode: SessionMode.MIXICANO,
        respectPlayerRest: false,
        socialStructuralOpportunityConstraints: [],
        completedMatches: history,
        socialHistoryMatches: history,
        randomFn: () => 0.4,
      },
    });
    expect(run.decision.outcome).toBe("candidate-exact");
    expect(run.result.replayEnvelopeStatus).toBe("DISABLED");
    expect(run.decision.matchTypeDistribution?.certified).toBe(true);
  });
  it("requires strict category improvement for a replay exception", () => {
    vi.stubEnv("BALANCED_MATCH_TYPE_DISTRIBUTION_ENABLED", "1");
    const { players, history } = fixture();
    players[0].restTurns = 0;
    const run = runBalancedCandidateWithProductionFallback({
      candidatePlayers: players,
      options: {
        courtCount: 1,
        sessionMode: SessionMode.MIXICANO,
        sessionType: SessionType.ELO,
        respectPlayerRest: true,
        socialStructuralOpportunityConstraints: [],
        completedMatches: history,
        socialHistoryMatches: history,
        randomFn: () => 0.3,
      },
    });
    expect(run.decision.outcome).toBe("candidate-exact");
    expect(run.decision.matchTypeDistribution?.rescue).toBe(false);
    expect(run.decision.matchTypeDistribution?.minimumReplay?.error).toBe(
      oracleScore([{ team1: ["P4", "P5"], team2: ["P6", "P7"] }], history)[0],
    );
  });
  it("rejects a falsified minimum-replay category witness", () => {
    vi.stubEnv("BALANCED_MATCH_TYPE_DISTRIBUTION_ENABLED", "1");
    const { players, history } = fixture();
    const options = {
      courtCount: 1,
      sessionType: SessionType.ELO as const,
      sessionMode: SessionMode.MIXICANO,
      respectPlayerRest: true,
      socialStructuralOpportunityConstraints: [],
      completedMatches: history,
      socialHistoryMatches: history,
      randomFn: () => 0.3,
    };
    const run = runBalancedCandidateWithProductionFallback({
      candidatePlayers: players,
      options,
    });
    expect(run.decision.outcome).toBe("candidate-exact");
    const result = run.result as Parameters<
      typeof verifyBalancedCandidateAcceptance<MatchmakerV3Player>
    >[3];
    result!.matchTypeDistribution!.minimumReplay!.error += 0.1;
    expect(
      verifyBalancedCandidateAcceptance(
        players,
        {
          ...options,
          recurrencePolicy: "strict-replay-rescue",
          balancedMatchTypeContext: buildBalancedMatchTypeContext(
            players,
            history,
          ),
        },
        options,
        result,
      ),
    ).toContain("MATCH_TYPE_REPLAY_FRONTIER_SCORE_MISMATCH");
    result!.matchTypeDistribution!.minimumReplay!.partitions[0].team1 = [
      "P0",
      "P0",
    ];
    expect(
      verifyBalancedCandidateAcceptance(
        players,
        {
          ...options,
          recurrencePolicy: "strict-replay-rescue",
          balancedMatchTypeContext: buildBalancedMatchTypeContext(
            players,
            history,
          ),
        },
        options,
        result,
      ),
    ).toContain("MATCH_TYPE_REPLAY_WITNESS_LAYOUT_INVALID");
  });
});
