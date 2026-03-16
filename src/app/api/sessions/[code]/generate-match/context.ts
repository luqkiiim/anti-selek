import { prisma } from "@/lib/prisma";
import { MatchStatus, SessionStatus } from "@/types/enums";
import {
  GenerateMatchError,
  type GenerateMatchContext,
  type GenerateMatchCourt,
  type GenerateMatchSession,
  loadCourtRecords,
  loadSessionRecord,
} from "./shared";

async function ensureManagePermission(
  communityId: string | null | undefined,
  userId: string,
  requesterIsAdmin: boolean
) {
  if (requesterIsAdmin) return;

  let isCommunityAdmin = false;
  if (communityId) {
    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId,
        },
      },
      select: { role: true },
    });
    isCommunityAdmin = membership?.role === "ADMIN";
  }

  if (!isCommunityAdmin) {
    throw new GenerateMatchError(403, "Unauthorized");
  }
}

export async function loadGenerateMatchContext({
  code,
  userId,
  requesterIsAdmin,
  requestedCourtIds,
  forceReshuffle,
}: {
  code: string;
  userId: string;
  requesterIsAdmin: boolean;
  requestedCourtIds: string[];
  forceReshuffle: boolean;
}): Promise<GenerateMatchContext> {
  const sessionData = await loadSessionRecord(code);

  if (!sessionData) {
    throw new GenerateMatchError(404, "Session not found");
  }
  if (sessionData.status !== SessionStatus.ACTIVE) {
    throw new GenerateMatchError(400, "Session not active");
  }

  await ensureManagePermission(
    sessionData.communityId,
    userId,
    requesterIsAdmin
  );

  const targetCourts = await loadCourtRecords(
    sessionData.id,
    requestedCourtIds
  );
  if (targetCourts.length !== requestedCourtIds.length) {
    throw new GenerateMatchError(404, "Court not found in this session");
  }

  const targetCourtById = new Map(targetCourts.map((court) => [court.id, court]));
  const orderedTargetCourts = requestedCourtIds.map(
    (id) => targetCourtById.get(id)!
  );
  const targetCourt = orderedTargetCourts[0];
  const reshuffleSource =
    forceReshuffle && targetCourt.currentMatch
      ? {
          ids: [
            targetCourt.currentMatch.team1User1Id,
            targetCourt.currentMatch.team1User2Id,
            targetCourt.currentMatch.team2User1Id,
            targetCourt.currentMatch.team2User2Id,
          ] as [string, string, string, string],
          partition: {
            team1: [
              targetCourt.currentMatch.team1User1Id,
              targetCourt.currentMatch.team1User2Id,
            ] as [string, string],
            team2: [
              targetCourt.currentMatch.team2User1Id,
              targetCourt.currentMatch.team2User2Id,
            ] as [string, string],
          },
        }
      : null;

  return {
    sessionData,
    orderedTargetCourts,
    targetCourt,
    freedCourtIds: new Set<string>(),
    reshuffleSource,
  };
}

export async function undoCurrentCourtMatch(targetCourt: GenerateMatchCourt) {
  if (!targetCourt.currentMatch) {
    throw new GenerateMatchError(400, "No active match to undo.");
  }

  const undoableStatuses: string[] = [MatchStatus.PENDING, MatchStatus.IN_PROGRESS];
  if (!undoableStatuses.includes(targetCourt.currentMatch.status)) {
    throw new GenerateMatchError(400, "Only unscored matches can be undone.");
  }

  await prisma.$transaction([
    prisma.match.delete({ where: { id: targetCourt.currentMatch.id } }),
    prisma.court.update({
      where: { id: targetCourt.id },
      data: { currentMatchId: null },
    }),
  ]);

  return { ok: true, undoneMatchId: targetCourt.currentMatch.id };
}

export async function reshuffleCurrentCourtMatch(
  sessionData: GenerateMatchSession,
  targetCourt: GenerateMatchCourt,
  freedCourtIds: Set<string>
) {
  if (!targetCourt.currentMatch) return;

  const allowedStatuses: string[] = [MatchStatus.PENDING, MatchStatus.IN_PROGRESS];
  if (!allowedStatuses.includes(targetCourt.currentMatch.status)) {
    throw new GenerateMatchError(
      400,
      "Cannot reshuffle a match that is already scored or completed."
    );
  }

  await prisma.$transaction([
    prisma.match.delete({ where: { id: targetCourt.currentMatch.id } }),
    prisma.court.update({
      where: { id: targetCourt.id },
      data: { currentMatchId: null },
    }),
  ]);

  sessionData.matches = sessionData.matches.filter(
    (match) => match.id !== targetCourt.currentMatch!.id
  );
  freedCourtIds.add(targetCourt.id);
}
