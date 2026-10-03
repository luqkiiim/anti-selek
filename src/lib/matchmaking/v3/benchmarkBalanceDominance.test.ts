import { describe, expect, it } from "vitest";
import { SessionType, PlayerGender, PartnerPreference } from "../../../types/enums";
import { getBalanceGuardrailPolicy } from "./balanceGuardrail";
import type { MatchmakerV3Player, V3DoublesPartition } from "./types";

type Facet = "partners" | "opponents";
type TargetRelation = { facet: Facet; left: string; right: string };

// These are the distinct facet-pairs excluded by the static equal-count,
// two-court wide-profile audit. This test separately proves their stronger
// same-quartet dominance for each later ordinary one-court refill.
const WIDE_POINTS_EXCLUSIONS: TargetRelation[] = [
  { facet: "partners", left: "P1", right: "P2" },
  { facet: "partners", left: "P13", right: "P14" },
  { facet: "partners", left: "P6", right: "P7" },
  { facet: "partners", left: "P8", right: "P9" },
];

const WIDE_ELO_EXCLUSIONS: TargetRelation[] = [
  { facet: "partners", left: "P1", right: "P2" },
  { facet: "partners", left: "P1", right: "P3" },
  { facet: "partners", left: "P1", right: "P8" },
  { facet: "partners", left: "P8", right: "P10" },
  { facet: "partners", left: "P12", right: "P14" },
  { facet: "partners", left: "P13", right: "P14" },
  { facet: "partners", left: "P14", right: "P7" },
  { facet: "partners", left: "P5", right: "P7" },
  { facet: "partners", left: "P6", right: "P7" },
  { facet: "partners", left: "P8", right: "P9" },
  { facet: "opponents", left: "P1", right: "P14" },
  { facet: "opponents", left: "P7", right: "P8" },
];

function wideRoster(sessionType: SessionType.POINTS | SessionType.ELO): MatchmakerV3Player[] {
  return Array.from({ length: 14 }, (_unused, index) => {
    const rank = 13 - index;
    const gender = index < 7 ? PlayerGender.MALE : PlayerGender.FEMALE;
    const strength = sessionType === SessionType.ELO ? 900 + rank * 40 : 10 + rank;
    return {
      userId: `P${index + 1}`,
      matchesPlayed: 0,
      matchmakingBaseline: 0,
      availableSince: new Date("2026-10-03T00:00:00.000Z"),
      strength,
      pointDiff: 0,
      gender,
      partnerPreference: gender === PlayerGender.FEMALE ? PartnerPreference.FEMALE_FLEX : PartnerPreference.OPEN,
    };
  });
}

function partitionings(ids: readonly string[]): V3DoublesPartition[] {
  const [a, b, c, d] = ids;
  return [
    { team1: [a, b], team2: [c, d] },
    { team1: [a, c], team2: [b, d] },
    { team1: [a, d], team2: [b, c] },
  ];
}

function lowerCount(team: readonly string[], playersById: ReadonlyMap<string, MatchmakerV3Player>) {
  return team.filter((id) => playersById.get(id)?.gender === PlayerGender.FEMALE).length;
}

function isLegalMixedPartition(partition: V3DoublesPartition, playersById: ReadonlyMap<string, MatchmakerV3Player>) {
  // This benchmark roster has seven UPPER men and seven LOWER women. For its
  // MIXED legality, both teams must have the same number of LOWER players.
  return lowerCount(partition.team1, playersById) === lowerCount(partition.team2, playersById);
}

function gap(partition: V3DoublesPartition, playersById: ReadonlyMap<string, MatchmakerV3Player>) {
  const average = (team: readonly string[]) => team.reduce((sum, id) => sum + playersById.get(id)!.strength, 0) / 2;
  return Math.abs(average(partition.team1) - average(partition.team2));
}

function exposes(target: TargetRelation, partition: V3DoublesPartition) {
  const leftTeam = partition.team1.includes(target.left);
  const rightTeam = partition.team2.includes(target.left);
  const targetLeftSide = leftTeam ? partition.team1 : rightTeam ? partition.team2 : null;
  if (!targetLeftSide) return false;
  const targetRightSide = targetLeftSide === partition.team1 ? partition.team2 : partition.team1;
  return target.facet === "partners"
    ? targetLeftSide.includes(target.right)
    : targetRightSide.includes(target.right);
}

function collectSameQuartetMargins(
  players: readonly MatchmakerV3Player[],
  targets: readonly TargetRelation[]
) {
  const playersById = new Map(players.map((player) => [player.userId, player]));
  const margins = new Map(targets.map((target) => [target, [] as number[]]));
  for (let a = 0; a < players.length - 3; a += 1) {
    for (let b = a + 1; b < players.length - 2; b += 1) {
      for (let c = b + 1; c < players.length - 1; c += 1) {
        for (let d = c + 1; d < players.length; d += 1) {
          const quartet = [players[a].userId, players[b].userId, players[c].userId, players[d].userId];
          const legal = partitionings(quartet)
            .filter((partition) => isLegalMixedPartition(partition, playersById))
            .map((partition) => ({ partition, gap: gap(partition, playersById) }));
          if (legal.length === 0) continue;
          const bestSameQuartetGap = Math.min(...legal.map((layout) => layout.gap));
          for (const layout of legal) {
            for (const target of targets) {
              if (exposes(target, layout.partition)) {
                margins.get(target)!.push(layout.gap - bestSameQuartetGap);
              }
            }
          }
        }
      }
    }
  }
  return margins;
}

describe("fixed-roster wide-skill balance dominance proof", () => {
  it("proves every wide Points excluded partner layout is outside the same-quartet near-best window", () => {
    const policy = getBalanceGuardrailPolicy(SessionType.POINTS)!;
    const margins = collectSameQuartetMargins(wideRoster(SessionType.POINTS), WIDE_POINTS_EXCLUSIONS);

    for (const target of WIDE_POINTS_EXCLUSIONS) {
      const candidateMargins = margins.get(target)!;
      expect(candidateMargins).toHaveLength(10);
      expect(Math.min(...candidateMargins)).toBe(2);
      expect(candidateMargins.every((margin) => margin > policy.nearBestWindow)).toBe(true);
    }
  });

  it("proves every wide Elo excluded partner/opponent layout is outside the same-quartet near-best window", () => {
    const policy = getBalanceGuardrailPolicy(SessionType.ELO)!;
    const margins = collectSameQuartetMargins(wideRoster(SessionType.ELO), WIDE_ELO_EXCLUSIONS);

    for (const target of WIDE_ELO_EXCLUSIONS) {
      const candidateMargins = margins.get(target)!;
      expect(candidateMargins).toHaveLength(target.left === "P1" && target.right === "P8" ||
        target.facet === "opponents" || target.left === "P14" && target.right === "P7" ? 36 : 10);
      expect(Math.min(...candidateMargins)).toBe(target.left === "P1" && target.right === "P2" ||
        target.left === "P13" && target.right === "P14" || target.left === "P6" && target.right === "P7" ||
        target.left === "P8" && target.right === "P9" ? 80 : 40);
      expect(candidateMargins.every((margin) => margin > policy.nearBestWindow)).toBe(true);
    }
  });
});
