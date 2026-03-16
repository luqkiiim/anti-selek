import { prisma } from "@/lib/prisma";
import { getCommunityEloByUserId } from "@/lib/communityElo";
import { rankPlayersByFairness } from "@/lib/matchmaking/fairness";
import { getSessionModeLabel } from "@/lib/sessionModeLabels";
import {
  getManualMatchPlayerIds,
  hasDuplicateManualMatchPlayers,
  isValidManualMatchPartition,
  type ManualMatchTeams,
} from "@/lib/matchmaking/manualMatch";
import {
  buildRotationHistory,
  evaluateBestPartition,
  getPartitionKey,
  getQuartetKey,
  type PartitionCandidate,
} from "@/lib/matchmaking/partitioning";
import { findBestAutoMatchSelection } from "@/lib/matchmaking/autoMatch";
import { findBestBatchAutoMatchSelection } from "@/lib/matchmaking/batchAutoMatch";
import { getBusyPlayerIds } from "@/lib/matchmaking/busyFilter";
import {
  MatchStatus,
  SessionMode,
  SessionStatus,
  SessionType,
} from "@/types/enums";

const mixedModeLabel = getSessionModeLabel(SessionMode.MIXICANO);

export class GenerateMatchError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface ParsedGenerateMatchRequest {
  requestedCourtIds: string[];
  forceReshuffle: boolean;
  undoCurrentMatch: boolean;
  manualTeams?: unknown;
}

export function parseGenerateMatchRequest(
  body: unknown
): ParsedGenerateMatchRequest {
  const {
    courtId,
    courtIds,
    forceReshuffle = false,
    undoCurrentMatch = false,
    manualTeams,
  } = (typeof body === "object" && body !== null ? body : {}) as {
    courtId?: string;
    courtIds?: unknown;
    forceReshuffle?: boolean;
    undoCurrentMatch?: boolean;
    manualTeams?: unknown;
  };

  const requestedCourtIds = Array.isArray(courtIds)
    ? courtIds.filter((value): value is string => typeof value === "string")
    : typeof courtId === "string"
      ? [courtId]
      : [];

  if (requestedCourtIds.length === 0) {
    throw new GenerateMatchError(400, "Court ID required");
  }
  if (forceReshuffle && undoCurrentMatch) {
    throw new GenerateMatchError(
      400,
      "Choose either reshuffle or undo, not both."
    );
  }
  if (manualTeams && (forceReshuffle || undoCurrentMatch)) {
    throw new GenerateMatchError(
      400,
      "Manual match creation cannot be combined with reshuffle or undo."
    );
  }
  if (
    requestedCourtIds.length > 1 &&
    (forceReshuffle || undoCurrentMatch || manualTeams)
  ) {
    throw new GenerateMatchError(
      400,
      "Reshuffle, undo, and manual match creation are only supported for one court at a time."
    );
  }

  return {
    requestedCourtIds,
    forceReshuffle,
    undoCurrentMatch,
    manualTeams,
  };
}

async function loadSessionRecord(code: string) {
  return prisma.session.findUnique({
    where: { code },
    include: {
      players: {
        include: { user: { select: { id: true, name: true, elo: true } } },
      },
      matches: true,
    },
  });
}

async function loadCourtRecords(sessionId: string, requestedCourtIds: string[]) {
  return prisma.court.findMany({
    where: {
      id: { in: requestedCourtIds },
      sessionId,
    },
    include: { currentMatch: true },
  });
}

export type GenerateMatchSession = NonNullable<
  Awaited<ReturnType<typeof loadSessionRecord>>
>;
export type GenerateMatchCourt = Awaited<
  ReturnType<typeof loadCourtRecords>
>[number];

export interface ReshuffleSource {
  ids: [string, string, string, string];
  partition: ManualMatchTeams;
}

export interface GenerateMatchContext {
  sessionData: GenerateMatchSession;
  orderedTargetCourts: GenerateMatchCourt[];
  targetCourt: GenerateMatchCourt;
  freedCourtIds: Set<string>;
  reshuffleSource: ReshuffleSource | null;
}

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

export interface MatchmakingState {
  busyPlayerIds: Set<string>;
  playersById: Map<string, PartitionCandidate>;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
}

export async function buildMatchmakingState(
  sessionData: GenerateMatchSession
): Promise<MatchmakingState> {
  const busyPlayerIds = getBusyPlayerIds(sessionData.matches);
  const communityEloByUserId =
    sessionData.communityId && sessionData.players.length > 0
      ? await getCommunityEloByUserId(
          sessionData.communityId,
          sessionData.players.map((player) => player.userId)
        )
      : new Map<string, number>();
  const pointDiffByUserId = new Map<string, number>();

  for (const match of sessionData.matches) {
    if (
      match.status !== MatchStatus.COMPLETED ||
      typeof match.team1Score !== "number" ||
      typeof match.team2Score !== "number"
    ) {
      continue;
    }

    const team1Diff = match.team1Score - match.team2Score;
    const team2Diff = match.team2Score - match.team1Score;

    for (const userId of [match.team1User1Id, match.team1User2Id]) {
      pointDiffByUserId.set(
        userId,
        (pointDiffByUserId.get(userId) ?? 0) + team1Diff
      );
    }

    for (const userId of [match.team2User1Id, match.team2User2Id]) {
      pointDiffByUserId.set(
        userId,
        (pointDiffByUserId.get(userId) ?? 0) + team2Diff
      );
    }
  }

  const playersById = new Map<string, PartitionCandidate>(
    sessionData.players.map((player) => [
      player.userId,
      {
        userId: player.userId,
        elo:
          sessionData.type === SessionType.POINTS
            ? player.sessionPoints
            : communityEloByUserId.get(player.userId) ?? player.user.elo,
        pointDiff: pointDiffByUserId.get(player.userId) ?? 0,
        lastPartnerId: player.lastPartnerId,
        gender: player.gender,
        partnerPreference: player.partnerPreference,
      },
    ])
  );
  const rotationHistory = buildRotationHistory(
    sessionData.matches
      .filter((match) => match.status === MatchStatus.COMPLETED)
      .sort((matchA, matchB) => {
        const timeA =
          matchA.completedAt?.getTime() ?? matchA.createdAt.getTime();
        const timeB =
          matchB.completedAt?.getTime() ?? matchB.createdAt.getTime();

        return timeA - timeB;
      })
  );

  return { busyPlayerIds, playersById, rotationHistory };
}

export async function createMatchesForAssignments(
  sessionId: string,
  assignments: Array<{
    courtId: string;
    selectedIds: string[];
    partition: ManualMatchTeams;
  }>
) {
  return prisma.$transaction(async (tx) => {
    const allSelectedIds = assignments.flatMap(
      (assignment) => assignment.selectedIds
    );
    const uniqueSelectedIds = new Set(allSelectedIds);

    if (uniqueSelectedIds.size !== allSelectedIds.length) {
      throw new GenerateMatchError(
        409,
        "One or more selected players just started another match. Please retry."
      );
    }

    const concurrentBusyMatches = await tx.match.findMany({
      where: {
        sessionId,
        status: {
          in: [
            MatchStatus.PENDING,
            MatchStatus.IN_PROGRESS,
            MatchStatus.PENDING_APPROVAL,
          ],
        },
        OR: [
          { team1User1Id: { in: [...uniqueSelectedIds] } },
          { team1User2Id: { in: [...uniqueSelectedIds] } },
          { team2User1Id: { in: [...uniqueSelectedIds] } },
          { team2User2Id: { in: [...uniqueSelectedIds] } },
        ],
      },
    });

    if (concurrentBusyMatches.length > 0) {
      throw new GenerateMatchError(
        409,
        "One or more selected players just started another match. Please retry."
      );
    }

    const matches = [];

    for (const assignment of assignments) {
      const match = await tx.match.create({
        data: {
          sessionId,
          courtId: assignment.courtId,
          status: MatchStatus.IN_PROGRESS,
          team1User1Id: assignment.partition.team1[0],
          team1User2Id: assignment.partition.team1[1],
          team2User1Id: assignment.partition.team2[0],
          team2User2Id: assignment.partition.team2[1],
        },
        include: {
          team1User1: { select: { id: true, name: true } },
          team1User2: { select: { id: true, name: true } },
          team2User1: { select: { id: true, name: true } },
          team2User2: { select: { id: true, name: true } },
        },
      });

      const updatedCourt = await tx.court.updateMany({
        where: { id: assignment.courtId, currentMatchId: null },
        data: { currentMatchId: match.id },
      });

      if (updatedCourt.count === 0) {
        throw new GenerateMatchError(
          409,
          "This court already has a match in progress."
        );
      }

      matches.push(match);
    }

    return matches;
  });
}

export function parseManualTeams(manualTeams: unknown): ManualMatchTeams {
  if (typeof manualTeams !== "object" || manualTeams === null) {
    throw new GenerateMatchError(400, "Invalid manual team selection.");
  }

  const candidate = manualTeams as {
    team1?: unknown;
    team2?: unknown;
  };
  if (
    !Array.isArray(candidate.team1) ||
    !Array.isArray(candidate.team2) ||
    candidate.team1.length !== 2 ||
    candidate.team2.length !== 2 ||
    candidate.team1.some((id) => typeof id !== "string") ||
    candidate.team2.some((id) => typeof id !== "string")
  ) {
    throw new GenerateMatchError(400, "Invalid manual team selection.");
  }

  return {
    team1: [candidate.team1[0], candidate.team1[1]],
    team2: [candidate.team2[0], candidate.team2[1]],
  } as ManualMatchTeams;
}

export function validateManualMatchRequest({
  sessionData,
  targetCourt,
  parsedTeams,
  busyPlayerIds,
  playersById,
  rotationHistory,
}: {
  sessionData: GenerateMatchSession;
  targetCourt: GenerateMatchCourt;
  parsedTeams: ManualMatchTeams;
  busyPlayerIds: Set<string>;
  playersById: Map<string, PartitionCandidate>;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
}) {
  if (targetCourt.currentMatch) {
    throw new GenerateMatchError(
      409,
      "This court already has a match. Undo it first to create a manual match."
    );
  }

  if (hasDuplicateManualMatchPlayers(parsedTeams)) {
    throw new GenerateMatchError(
      400,
      "Manual matches require 4 different players."
    );
  }

  const selectedIds = getManualMatchPlayerIds(parsedTeams);
  const selectedPlayers = selectedIds.map((id) =>
    sessionData.players.find((player) => player.userId === id)
  );

  if (selectedPlayers.some((player) => !player)) {
    throw new GenerateMatchError(
      400,
      "Every manual match player must already be in this session."
    );
  }

  if (selectedPlayers.some((player) => player?.isPaused)) {
    throw new GenerateMatchError(
      400,
      "Paused players cannot be added to a manual match."
    );
  }

  const busyManualIds = selectedIds.filter((id) => busyPlayerIds.has(id));
  if (busyManualIds.length > 0) {
    throw new GenerateMatchError(
      409,
      "One or more selected players are already busy on another court."
    );
  }

  if (
    !isValidManualMatchPartition(
      parsedTeams,
      playersById,
      sessionData.mode as SessionMode,
      sessionData.type as SessionType,
      rotationHistory
    )
  ) {
    throw new GenerateMatchError(
      400,
      sessionData.mode === SessionMode.MIXICANO
        ? `That manual pairing is invalid for current ${mixedModeLabel} preferences.`
        : "Invalid manual pairing."
    );
  }

  return selectedIds;
}

export function getRequestedOpenCourts(
  orderedTargetCourts: GenerateMatchCourt[],
  freedCourtIds: Set<string>
) {
  const requestedOpenCourts = orderedTargetCourts.filter(
    (court) => freedCourtIds.has(court.id) || !court.currentMatch
  );

  if (requestedOpenCourts.length !== orderedTargetCourts.length) {
    throw new GenerateMatchError(
      409,
      "Selected courts must be empty before creating matches."
    );
  }

  return requestedOpenCourts;
}

export function getRankedCandidates(
  sessionData: GenerateMatchSession,
  busyPlayerIds: Set<string>
) {
  const availableCandidates = sessionData.players
    .filter((player) => !busyPlayerIds.has(player.userId) && !player.isPaused)
    .map((player) => ({
      userId: player.userId,
      matchesPlayed: player.matchesPlayed,
      availableSince: player.availableSince,
      joinedAt: player.joinedAt,
      inactiveSeconds: player.inactiveSeconds,
    }));

  return {
    availableCandidates,
    rankedCandidates: rankPlayersByFairness(availableCandidates),
  };
}

export function ensureEnoughPlayers(
  availableCandidatesCount: number,
  rankedCandidatesCount: number,
  requestedMatchCount: number
) {
  if (rankedCandidatesCount < requestedMatchCount * 4) {
    throw new GenerateMatchError(
      400,
      `Not enough players available (need ${requestedMatchCount * 4}, have ${availableCandidatesCount})`
    );
  }
}

export function selectSingleCourtMatch({
  rankedCandidates,
  playersById,
  sessionData,
  rotationHistory,
  reshuffleSource,
}: {
  rankedCandidates: ReturnType<typeof rankPlayersByFairness>;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
  reshuffleSource: ReshuffleSource | null;
}) {
  let bestSelection = findBestAutoMatchSelection(
    rankedCandidates,
    playersById,
    sessionData.mode as SessionMode,
    sessionData.type as SessionType,
    rotationHistory
  );

  if (!bestSelection) {
    throw new GenerateMatchError(
      400,
      `No valid pairing found for current ${mixedModeLabel} preferences. Try changing player preferences.`
    );
  }

  if (!reshuffleSource) {
    return bestSelection;
  }

  const previousQuartetKey = getQuartetKey(reshuffleSource.ids);
  const previousPartitionKey = getPartitionKey(reshuffleSource.partition);
  const selectedQuartetKey = getQuartetKey(bestSelection.ids);
  const selectedPartitionKey = getPartitionKey(bestSelection.partition);

  if (selectedQuartetKey !== previousQuartetKey) {
    return bestSelection;
  }

  const alternativeQuartet = findBestAutoMatchSelection(
    rankedCandidates,
    playersById,
    sessionData.mode as SessionMode,
    sessionData.type as SessionType,
    rotationHistory,
    {
      excludedQuartetKey: previousQuartetKey,
    }
  );

  if (alternativeQuartet) {
    return alternativeQuartet;
  }

  if (selectedPartitionKey !== previousPartitionKey) {
    return bestSelection;
  }

  const alternativePartition = evaluateBestPartition(
    bestSelection.ids,
    playersById,
    sessionData.mode as SessionMode,
    sessionData.type as SessionType,
    rotationHistory,
    {
      excludedPartitionKey: previousPartitionKey,
    }
  );

  if (!alternativePartition) {
    throw new GenerateMatchError(
      409,
      "No alternative reshuffle was available. Undo this match if you want the same players returned to the pool."
    );
  }

  return {
    ...bestSelection,
    partition: alternativePartition.partition,
    score: alternativePartition.score,
    exactPartitionPenalty: alternativePartition.exactPartitionPenalty,
  };
}

export function selectBatchMatches({
  rankedCandidates,
  playersById,
  sessionData,
  rotationHistory,
  requestedMatchCount,
}: {
  rankedCandidates: ReturnType<typeof rankPlayersByFairness>;
  playersById: Map<string, PartitionCandidate>;
  sessionData: GenerateMatchSession;
  rotationHistory: ReturnType<typeof buildRotationHistory>;
  requestedMatchCount: number;
}) {
  const batchSelection = findBestBatchAutoMatchSelection(
    rankedCandidates,
    playersById,
    sessionData.mode as SessionMode,
    sessionData.type as SessionType,
    rotationHistory,
    requestedMatchCount
  );

  if (!batchSelection) {
    throw new GenerateMatchError(
      400,
      `No valid set of matches found for current ${mixedModeLabel} preferences. Try changing player preferences.`
    );
  }

  return batchSelection;
}
