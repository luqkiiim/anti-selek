import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { getEffectiveSessionMode, getEffectiveSessionType, getSessionSettings } from "@/lib/sessionSettings";
import { getNormalizedSessionPool, getSessionCrossoverFrequency } from "@/lib/sessionPools";
import { withLegacySportingAliases } from "@/lib/sportingIdentity";
import { MatchStatus, SessionType } from "@/types/enums";
import { buildLevelDistributionTargets, isLevelMatch3Enabled, type LevelDistributionPlayer } from "./ladder/levelDistribution";
import { withSocialVarietySnapshot } from "./v3/socialVariety";
import type { V3DoublesPartition } from "./v3/types";

const committedStatuses = [MatchStatus.COMPLETED, MatchStatus.PENDING, MatchStatus.IN_PROGRESS, MatchStatus.PENDING_APPROVAL];
type Commitment = {
  id?: string;
  team1User1Id: string;
  team1User2Id: string;
  team2User1Id: string;
  team2User2Id: string;
  matchmakingReasonJson?: string | null;
  completedAt?: Date | null;
  status?: string;
  winnerTeam?: number | null;
  team1Score?: number | null;
  team2Score?: number | null;
  gameScoresJson?: string | null;
  courtGroupType?: string | null;
  poolASeatCount?: number | null;
  poolBSeatCount?: number | null;
  isAutomatic?: boolean;
};

type BasisSource = Parameters<typeof getSessionSettings>[0] & {
  poolsEnabled?: boolean;
  crossoverFrequency?: string | null;
  respectPlayerRest?: boolean;
  collabFormat?: string | null;
  status?: string;
  autoQueueEnabled?: boolean;
  players: readonly (LevelDistributionPlayer & {
    matchesPlayed?: number;
    matchmakingMatchesCredit?: number;
    arrivalPriorityAt?: Date | null;
    availableSince?: Date | null;
    ladderEntryAt?: Date | null;
    skipNextMatchAt?: Date | null;
  })[];
  matches: readonly Commitment[];
  queuedMatch?: Commitment | null;
};

function commitmentKey(match: Commitment) {
  return [match.id ?? null, match.team1User1Id, match.team1User2Id, match.team2User1Id, match.team2User2Id,
    match.status ?? null, match.completedAt ?? null, match.winnerTeam ?? null,
    match.team1Score ?? null, match.team2Score ?? null, match.gameScoresJson ?? null, match.courtGroupType ?? null,
    match.poolASeatCount ?? null, match.poolBSeatCount ?? null, match.isAutomatic ?? null, match.matchmakingReasonJson ?? null];
}

/** The writer recomputes this over the same source used for the automatic decision. */
export function getLevelMatch3Basis(session: BasisSource) {
  const roster = [...session.players].sort((a, b) => a.userId.localeCompare(b.userId)).map((player) => [
    player.userId, getEffectiveMixedSide(player), getNormalizedSessionPool(player.pool), Boolean(player.isPaused),
    player.matchesPlayed ?? 0, player.matchmakingMatchesCredit ?? 0, player.arrivalPriorityAt ?? null,
    player.availableSince ?? null, player.ladderEntryAt ?? null, player.skipNextMatchAt ?? null,
  ]);
  const matches = session.matches.filter((match) => committedStatuses.some((status) => status === match.status))
    .map((match) => JSON.stringify(commitmentKey(match))).sort();
  const settings = [getEffectiveSessionType(session), getEffectiveSessionMode(session), getSessionSettings(session).balanceMetric,
    Boolean(session.poolsEnabled), getSessionCrossoverFrequency(session.crossoverFrequency), session.respectPlayerRest !== false,
    session.collabFormat ?? null, session.status ?? null, Boolean(session.autoQueueEnabled)];
  return createHash("sha256").update(JSON.stringify([settings, roster, matches,
    session.queuedMatch ? commitmentKey(session.queuedMatch) : null])).digest("hex");
}

function parseReason(reason?: string | null): Record<string, unknown> | null {
  if (!reason) return null;
  try {
    const parsed: unknown = JSON.parse(reason);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

export function hasLevelMatch3Commitment(reason?: string | null) {
  const metadata = parseReason(reason);
  return !!metadata && ("levelMatch3Basis" in metadata || "levelMatchType" in metadata);
}

export async function isLevelMatchTypeSourceCurrent(
  tx: Prisma.TransactionClient, sessionId: string, assignments: readonly { matchmakingReasonJson?: string | null }[], excludeQueue = false,
) {
  const bases = assignments.flatMap(({ matchmakingReasonJson }) => {
    const reason = parseReason(matchmakingReasonJson);
    return reason?.source === "level" && "levelMatch3Basis" in reason ? [reason.levelMatch3Basis] : [];
  });
  if (!bases.length) return true;
  if (!isLevelMatch3Enabled()) return false;
  const session = await tx.session.findUnique({ where: { id: sessionId }, include: {
    players: true, matches: { where: { status: { in: committedStatuses } } }, queuedMatch: !excludeQueue,
  } });
  if (!session || getEffectiveSessionType(session) !== SessionType.RACE) return false;
  const basis = getLevelMatch3Basis(withLegacySportingAliases({ ...session, queuedMatch: excludeQueue ? null : session.queuedMatch }));
  return bases.every((value) => value === basis);
}

/** A manual commitment joins the ledger at the current roster's target. */
export async function appendManualLevelMatchType(
  tx: Prisma.TransactionClient, sessionId: string, partition: V3DoublesPartition, reason: string | null | undefined, poolsEnabled: boolean,
) {
  const rows = await tx.sessionPlayer.findMany({ where: { sessionId }, select: {
    playerId: true, gender: true, partnerPreference: true, mixedSideOverride: true, isPaused: true, pool: true,
  } });
  const players = withLegacySportingAliases(rows);
  const snapshot = buildLevelDistributionTargets(players, poolsEnabled)(partition);
  if (!snapshot) return reason ?? null;
  return JSON.stringify({ ...parseReason(withSocialVarietySnapshot(reason, partition, players)), levelMatchType: snapshot });
}
