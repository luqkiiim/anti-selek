import { prisma } from "@/lib/prisma";
import { getCommunityEloByUserId } from "@/lib/communityElo";
import { isValidBadmintonScore } from "@/lib/matchRules";
import { getStandingPointsForTeam } from "@/lib/sessionStandings";
import { MatchStatus } from "@/types/enums";

const K_FACTOR = 32;
const SINGLE_GUEST_MULTIPLIER = 0.75;
const MULTI_GUEST_MULTIPLIER = 0.5;

function calculateEloChange(
  winnerElo: number,
  loserElo: number,
  winnerScore: number,
  loserScore: number
): number {
  const expectedWinner = 1 / (1 + Math.pow(10, (loserElo - winnerElo) / 400));
  const scoreDiff = winnerScore - loserScore;
  const marginMultiplier = 1 + (scoreDiff - 2) * 0.05;

  return Math.round(K_FACTOR * (1 - expectedWinner) * marginMultiplier);
}

function getGuestImpactMultiplier(guestCount: number): number {
  if (guestCount <= 0) return 1;
  if (guestCount === 1) return SINGLE_GUEST_MULTIPLIER;
  return MULTI_GUEST_MULTIPLIER;
}

function applyGuestMultiplierToDelta(delta: number, multiplier: number): number {
  if (delta === 0 || multiplier === 1) return delta;
  const magnitude = Math.max(1, Math.round(Math.abs(delta) * multiplier));
  return delta > 0 ? magnitude : -magnitude;
}

interface MatchUserSnapshot {
  id: string;
  name: string;
  elo: number;
}

export interface FinalizableMatch {
  id: string;
  sessionId: string;
  courtId: string;
  team1User1Id: string;
  team1User2Id: string;
  team2User1Id: string;
  team2User2Id: string;
  team1Score?: number | null;
  team2Score?: number | null;
  session: {
    communityId: string | null;
    type: string;
  };
  team1User1: MatchUserSnapshot;
  team1User2: MatchUserSnapshot;
  team2User1: MatchUserSnapshot;
  team2User2: MatchUserSnapshot;
}

export async function finalizeMatchResult({
  match,
  expectedStatus,
  finalTeam1Score,
  finalTeam2Score,
  scoreSubmittedByUserId,
}: {
  match: FinalizableMatch;
  expectedStatus: MatchStatus.IN_PROGRESS | MatchStatus.PENDING_APPROVAL;
  finalTeam1Score: number;
  finalTeam2Score: number;
  scoreSubmittedByUserId?: string | null;
}) {
  if (!isValidBadmintonScore(finalTeam1Score, finalTeam2Score)) {
    throw new Error("INVALID_SCORE");
  }

  const team1Points = finalTeam1Score;
  const team2Points = finalTeam2Score;
  const winnerTeam = team1Points > team2Points ? 1 : 2;
  const now = new Date();
  const team1StandingPoints = getStandingPointsForTeam(winnerTeam, 1);
  const team2StandingPoints = getStandingPointsForTeam(winnerTeam, 2);

  const playerIds = [
    match.team1User1Id,
    match.team1User2Id,
    match.team2User1Id,
    match.team2User2Id,
  ];
  const sessionPlayerRows = await prisma.sessionPlayer.findMany({
    where: {
      sessionId: match.sessionId,
      userId: { in: playerIds },
    },
    select: {
      userId: true,
      isGuest: true,
    },
  });
  const isGuestByUserId = new Map<string, boolean>(
    sessionPlayerRows.map((player) => [player.userId, player.isGuest])
  );
  const guestCount = playerIds.filter((userId) => isGuestByUserId.get(userId) === true).length;
  const guestImpactMultiplier = getGuestImpactMultiplier(guestCount);
  const communityEloByUserId =
    match.session.communityId
      ? await getCommunityEloByUserId(match.session.communityId, playerIds)
      : new Map<string, number>();

  const team1User1Elo =
    communityEloByUserId.get(match.team1User1Id) ?? match.team1User1.elo;
  const team1User2Elo =
    communityEloByUserId.get(match.team1User2Id) ?? match.team1User2.elo;
  const team2User1Elo =
    communityEloByUserId.get(match.team2User1Id) ?? match.team2User1.elo;
  const team2User2Elo =
    communityEloByUserId.get(match.team2User2Id) ?? match.team2User2.elo;

  const team1AvgElo = (team1User1Elo + team1User2Elo) / 2;
  const team2AvgElo = (team2User1Elo + team2User2Elo) / 2;

  let team1EloChange: number;
  let team2EloChange: number;

  if (winnerTeam === 1) {
    const delta = calculateEloChange(team1AvgElo, team2AvgElo, team1Points, team2Points);
    team1EloChange = delta;
    team2EloChange = -delta;
  } else {
    const delta = calculateEloChange(team2AvgElo, team1AvgElo, team2Points, team1Points);
    team1EloChange = -delta;
    team2EloChange = delta;
  }

  const persistedTeam1EloChange = applyGuestMultiplierToDelta(
    team1EloChange,
    guestImpactMultiplier
  );
  const persistedTeam2EloChange = applyGuestMultiplierToDelta(
    team2EloChange,
    guestImpactMultiplier
  );

  try {
    return await prisma.$transaction(async (tx) => {
      const updatedMatchResult = await tx.match.updateMany({
        where: { id: match.id, status: expectedStatus },
        data: {
          team1Score: finalTeam1Score,
          team2Score: finalTeam2Score,
          winnerTeam,
          team1EloChange: persistedTeam1EloChange,
          team2EloChange: persistedTeam2EloChange,
          status: MatchStatus.COMPLETED,
          completedAt: now,
          ...(scoreSubmittedByUserId !== undefined ? { scoreSubmittedByUserId } : {}),
        },
      });

      if (updatedMatchResult.count === 0) {
        throw new Error("ALREADY_PROCESSED");
      }

      const updatedMatch = await tx.match.findUnique({
        where: { id: match.id },
      });

      await tx.sessionPlayer.updateMany({
        where: {
          sessionId: match.sessionId,
          userId: { in: [match.team1User1Id, match.team1User2Id] },
        },
        data: {
          sessionPoints: { increment: team1StandingPoints },
          matchesPlayed: { increment: 1 },
          lastPlayedAt: now,
          availableSince: now,
        },
      });

      await tx.sessionPlayer.updateMany({
        where: {
          sessionId: match.sessionId,
          userId: { in: [match.team2User1Id, match.team2User2Id] },
        },
        data: {
          sessionPoints: { increment: team2StandingPoints },
          matchesPlayed: { increment: 1 },
          lastPlayedAt: now,
          availableSince: now,
        },
      });

      await tx.sessionPlayer.update({
        where: {
          sessionId_userId: { sessionId: match.sessionId, userId: match.team1User1Id },
        },
        data: { lastPartnerId: match.team1User2Id },
      });
      await tx.sessionPlayer.update({
        where: {
          sessionId_userId: { sessionId: match.sessionId, userId: match.team1User2Id },
        },
        data: { lastPartnerId: match.team1User1Id },
      });
      await tx.sessionPlayer.update({
        where: {
          sessionId_userId: { sessionId: match.sessionId, userId: match.team2User1Id },
        },
        data: { lastPartnerId: match.team2User2Id },
      });
      await tx.sessionPlayer.update({
        where: {
          sessionId_userId: { sessionId: match.sessionId, userId: match.team2User2Id },
        },
        data: { lastPartnerId: match.team2User1Id },
      });

      if (match.session.communityId) {
        const team1Ids = [match.team1User1Id, match.team1User2Id];
        const team2Ids = [match.team2User1Id, match.team2User2Id];

        const team1CommunityMemberIds = team1Ids.filter(
          (userId) => isGuestByUserId.get(userId) !== true
        );
        const team2CommunityMemberIds = team2Ids.filter(
          (userId) => isGuestByUserId.get(userId) !== true
        );

        if (team1CommunityMemberIds.length > 0) {
          await tx.communityMember.updateMany({
            where: {
              communityId: match.session.communityId,
              userId: { in: team1CommunityMemberIds },
            },
            data: { elo: { increment: persistedTeam1EloChange } },
          });
        }
        if (team2CommunityMemberIds.length > 0) {
          await tx.communityMember.updateMany({
            where: {
              communityId: match.session.communityId,
              userId: { in: team2CommunityMemberIds },
            },
            data: { elo: { increment: persistedTeam2EloChange } },
          });
        }
      } else {
        const team1CoreIds = [match.team1User1Id, match.team1User2Id].filter(
          (userId) => isGuestByUserId.get(userId) !== true
        );
        const team2CoreIds = [match.team2User1Id, match.team2User2Id].filter(
          (userId) => isGuestByUserId.get(userId) !== true
        );

        if (team1CoreIds.length > 0) {
          await tx.user.updateMany({
            where: { id: { in: team1CoreIds } },
            data: { elo: { increment: persistedTeam1EloChange } },
          });
        }
        if (team2CoreIds.length > 0) {
          await tx.user.updateMany({
            where: { id: { in: team2CoreIds } },
            data: { elo: { increment: persistedTeam2EloChange } },
          });
        }
      }

      await tx.court.update({
        where: { id: match.courtId },
        data: { currentMatchId: null },
      });

      return updatedMatch;
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    if (message === "ALREADY_PROCESSED") {
      throw error;
    }
    throw error;
  }
}
