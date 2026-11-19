import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getGuestRatingsByUserId } from "@/lib/guestRating";
import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { withSessionProfileRatings } from "@/lib/sessionProfileIdentity";
import { getEffectiveSessionType, getSessionSettings } from "@/lib/sessionSettings";
import { withLegacySportingAliases } from "@/lib/sportingIdentity";
import { MatchStatus, SessionType } from "@/types/enums";
import {
  buildClubPlayDistributionTargets,
  parseClubPlayDistributionSnapshot,
} from "./ladder/clubPlayDistribution";
import type { V3DoublesPartition } from "./v3/types";

type RatingSeat = { playerId: string; isGuest?: boolean; player: { elo: number } };
type RatingSource = { clubId?: string | null; ratingPolicyVersion?: number; players: readonly RatingSeat[] };

export async function getClubPlayRatings(db: Prisma.TransactionClient, session: RatingSource) {
  const members = session.ratingPolicyVersion !== 2 && session.clubId
    ? await db.clubMember.findMany({
        where: { clubId: session.clubId, playerId: { in: session.players.map((seat) => seat.playerId) } },
        select: { playerId: true, elo: true },
      })
    : [];
  const memberRatings = new Map(members.map((member) => [member.playerId, member.elo]));
  const guests = await getGuestRatingsByUserId(db, session.players.filter((seat) => seat.isGuest)
    .map((seat) => ({ userId: seat.playerId, startingRating: seat.player.elo })));
  return new Map(session.players.map((seat) => {
    const rating = guests.get(seat.playerId) ?? memberRatings.get(seat.playerId) ?? seat.player.elo;
    return [seat.playerId, Number.isFinite(rating) ? rating : 1000];
  }));
}

const commitmentStatuses = [MatchStatus.PENDING, MatchStatus.IN_PROGRESS, MatchStatus.PENDING_APPROVAL, MatchStatus.COMPLETED];
type Commitment = {
  id: string;
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
  createdAt: Date;
  updatedAt?: Date;
  completedAt?: Date | null;
  status?: string;
  courtId?: string;
  matchmakingReasonJson: string | null;
  isAutomatic?: boolean;
};
type DecisionSource = Parameters<typeof getSessionSettings>[0] & {
  respectPlayerRest?: boolean;
  autoQueueEnabled?: boolean;
  courts: readonly { id: string }[];
  players: readonly ((Parameters<typeof getEffectiveMixedSide>[0]) & {
    playerId: string;
    isPaused: boolean;
    matchesPlayed: number;
    matchmakingMatchesCredit?: number;
    arrivalPriorityAt?: Date | null;
    availableSince?: Date | null;
    skipNextMatchAt?: Date | null;
  })[];
  matches: readonly Commitment[];
  queuedMatch?: Commitment | null;
};

function commitmentKey(match: Commitment) {
  return [match.id, match.team1Player1Id, match.team1Player2Id, match.team2Player1Id, match.team2Player2Id,
    match.createdAt, match.updatedAt ?? null, match.completedAt ?? null, match.status ?? null, match.courtId ?? null,
    match.matchmakingReasonJson, match.isAutomatic ?? null];
}

export function getClubPlayDecisionBasis(session: DecisionSource, ratings: ReadonlyMap<string, number>) {
  const roster = session.players.map((seat) => JSON.stringify([
    seat.playerId, getEffectiveMixedSide(seat), seat.isPaused, seat.matchesPlayed, seat.matchmakingMatchesCredit ?? 0,
    seat.arrivalPriorityAt ?? null, seat.availableSince ?? null, seat.skipNextMatchAt ?? null, ratings.get(seat.playerId),
  ])).sort();
  const matches = session.matches.filter((match) => commitmentStatuses.some((status) => status === match.status))
    .map((match) => JSON.stringify(commitmentKey(match))).sort();
  const settings = [getSessionSettings(session), session.respectPlayerRest !== false, Boolean(session.autoQueueEnabled)];
  return createHash("sha256").update(JSON.stringify([
    settings, session.courts.map((court) => court.id).sort(), roster, matches,
    session.queuedMatch ? commitmentKey(session.queuedMatch) : null,
  ])).digest("hex");
}

function parseReason(reason?: string | null): Record<string, unknown> | null {
  try {
    const value: unknown = reason ? JSON.parse(reason) : null;
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function isAutomaticClubPlayReason(reason?: string | null) {
  return parseReason(reason)?.source === "club-play";
}

/** Re-read the inputs after the shared transaction has acquired the database writer. */
export async function isClubPlayDecisionCurrent(
  tx: Prisma.TransactionClient, sessionId: string, assignments: readonly { matchmakingReasonJson?: string | null }[],
  excludeQueue = false,
) {
  const reasons = assignments.map((assignment) => parseReason(assignment.matchmakingReasonJson))
    .filter((reason) => reason?.source === "club-play");
  if (!reasons.length) return true;
  const session = await tx.session.findUnique({
    where: { id: sessionId },
    include: {
      players: { include: { player: { select: { elo: true } } } },
      matches: { where: { status: { in: commitmentStatuses } } },
      courts: { where: { isActive: true }, select: { id: true } },
      queuedMatch: !excludeQueue,
    },
  });
  if (!session || getEffectiveSessionType(session) !== SessionType.CLUB_PLAY) return false;
  const players = await withSessionProfileRatings(tx, session, session.players);
  const ratings = await getClubPlayRatings(tx, { ...session, players });
  const basis = getClubPlayDecisionBasis({ ...session, queuedMatch: excludeQueue ? null : session.queuedMatch }, ratings);
  return reasons.every((reason) => reason?.clubPlayBasis === basis);
}

export async function appendManualClubPlayMatchType(
  tx: Prisma.TransactionClient, sessionId: string, partition: V3DoublesPartition, reason?: string | null,
) {
  const parsed = parseReason(reason);
  if (parseClubPlayDistributionSnapshot(parsed?.clubPlayMatchType, partition)) return reason ?? null;
  const players = await tx.sessionPlayer.findMany({
    where: { sessionId },
    select: { playerId: true, gender: true, partnerPreference: true, mixedSideOverride: true, isPaused: true },
  });
  const snapshot = buildClubPlayDistributionTargets(withLegacySportingAliases(players))(partition);
  return snapshot ? JSON.stringify({ ...parsed, clubPlayMatchType: snapshot }) : reason ?? null;
}
