import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSideSpecificCourtCreateLabel } from "@/lib/courtCreate";
import { prisma } from "@/lib/prisma";
import {
  buildSessionPoolMap,
  summarizeSessionPoolMembership,
} from "@/lib/sessionPools";
import { tryRebuildQueuedMatchForSessionId } from "../queue-match/shared";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";
import {
  applyPoolSelectionOutcome,
  buildMatchmakingState,
  createMatchesForAssignments,
  ensureEnoughPlayers,
  ensureEnoughMatchTypePlayers,
  ensureInterclubSessionReady,
  filterRankedCandidatesByMatchType,
  GenerateMatchError,
  getInterclubTeamClubIdsForPartition,
  getRankedCandidates,
  getRequestedOpenCourts,
  loadGenerateMatchContext,
  parseGenerateMatchRequest,
  parseManualTeams,
  replaceCurrentCourtMatchAssignment,
  selectReplacementMatch,
  selectBatchMatches,
  selectSingleCourtMatch,
  undoCurrentCourtMatch,
  validateManualMatchRequest,
} from "./service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:sessions:code:generate-match:post", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;

    if (typeof code !== "string" || code.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:sessions:code:generate-match");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    const body = await request.json().catch(() => ({}));
    const {
      requestedCourtIds,
      forceReshuffle,
      undoCurrentMatch,
      manualTeams,
      excludedUserId,
      replaceUserId,
      matchType,
    } = parseGenerateMatchRequest(body);

    const {
      sessionData,
      orderedTargetCourts,
      targetCourt,
      freedCourtIds,
      reshuffleSource,
    } = await loadGenerateMatchContext({
      code,
      userId: session.user.id,
      requesterIsAdmin: !!session.user.isAdmin,
      requestedCourtIds,
      forceReshuffle,
    });

    if (undoCurrentMatch) {
      return NextResponse.json(await undoCurrentCourtMatch(targetCourt));
    }

    ensureInterclubSessionReady(sessionData);

    if (matchType && sessionData.queuedMatch) {
      throw new GenerateMatchError(
        409,
        `Resolve the queued match before creating a ${getSideSpecificCourtCreateLabel(
          matchType
        )}.`
      );
    }

    if (manualTeams) {
      const { busyPlayerIds } = await buildMatchmakingState(sessionData);
      const parsedTeams = parseManualTeams(manualTeams);
      const selectedIds = validateManualMatchRequest({
        sessionData,
        targetCourt,
        parsedTeams,
        busyPlayerIds,
      });
      const teamClubIds = getInterclubTeamClubIdsForPartition(
        sessionData,
        parsedTeams
      );

      const [createdMatch] = await createMatchesForAssignments(sessionData.id, [
        {
          courtId: targetCourt.id,
          selectedIds,
          partition: parsedTeams,
          team1ClubId: teamClubIds.team1ClubId,
          team2ClubId: teamClubIds.team2ClubId,
          matchmakingReasonJson: null,
        },
      ]);

      if (sessionData.poolsEnabled) {
        const poolSummary = summarizeSessionPoolMembership(
          selectedIds,
          buildSessionPoolMap(
            sessionData.players,
            (player) => player.userId,
            (player) => player.pool
          )
        );
        if (poolSummary.dominantPool) {
          const nextPoolState = applyPoolSelectionOutcome(sessionData, {
            targetPool: poolSummary.dominantPool,
            missedPool: null,
          });
          await prisma.session.update({
            where: { id: sessionData.id },
            data: {
              poolACourtAssignments: nextPoolState.poolACourtAssignments,
              poolBCourtAssignments: nextPoolState.poolBCourtAssignments,
              poolAMissedTurns: nextPoolState.poolAMissedTurns,
              poolBMissedTurns: nextPoolState.poolBMissedTurns,
            },
          });
        }
      }

      return NextResponse.json({
        ...createdMatch,
        queuedMatch: await tryRebuildQueuedMatchForSessionId(sessionData.id),
      });
    }

    if (replaceUserId) {
      if (!targetCourt.currentMatch) {
        throw new GenerateMatchError(
          400,
          "No live match is available to replace a player."
        );
      }

      const currentMatchUserIds = [
        targetCourt.currentMatch.team1User1Id,
        targetCourt.currentMatch.team1User2Id,
        targetCourt.currentMatch.team2User1Id,
        targetCourt.currentMatch.team2User2Id,
      ];

      if (!currentMatchUserIds.includes(replaceUserId)) {
        throw new GenerateMatchError(
          400,
          "Selected player is not part of this match."
        );
      }

      const retainedUserIds = currentMatchUserIds.filter(
        (userId) => userId !== replaceUserId
      );

      if (retainedUserIds.length !== 3) {
        throw new GenerateMatchError(
          400,
          "Replace player requires exactly three retained players."
        );
      }

      const replacementSessionData = {
        ...sessionData,
        matches: sessionData.matches.filter(
          (match) => match.id !== targetCourt.currentMatch!.id
        ),
      };
      const { busyPlayerIds, playersById } = await buildMatchmakingState(
        replacementSessionData
      );
      const { rankedCandidates } = getRankedCandidates(
        replacementSessionData,
        busyPlayerIds
      );
      const replacementSelection = selectReplacementMatch({
        rankedCandidates,
        playersById,
        sessionData: replacementSessionData,
        retainedUserIds: retainedUserIds as [string, string, string],
        excludedUserIds: currentMatchUserIds,
      });

      return NextResponse.json(
        await replaceCurrentCourtMatchAssignment({
          sessionId: sessionData.id,
          courtId: targetCourt.id,
          currentMatchId: targetCourt.currentMatch.id,
          selectedIds: [...replacementSelection.ids],
          partition: replacementSelection.partition,
          team1ClubId:
            "team1ClubId" in replacementSelection
              ? replacementSelection.team1ClubId
              : null,
          team2ClubId:
            "team2ClubId" in replacementSelection
              ? replacementSelection.team2ClubId
              : null,
          matchmakingReasonJson: replacementSelection.matchmakingReasonJson ?? null,
          clearArrivalPriority: true,
        })
      );
    }

    if (forceReshuffle && targetCourt.currentMatch) {
      const reshuffleUserIds = [
        targetCourt.currentMatch.team1User1Id,
        targetCourt.currentMatch.team1User2Id,
        targetCourt.currentMatch.team2User1Id,
        targetCourt.currentMatch.team2User2Id,
      ];

      if (excludedUserId && !reshuffleUserIds.includes(excludedUserId)) {
        throw new GenerateMatchError(
          400,
          "Selected player is not part of this match."
        );
      }

      const reshuffleSessionData = {
        ...sessionData,
        matches: sessionData.matches.filter(
          (match) => match.id !== targetCourt.currentMatch!.id
        ),
      };
      const { busyPlayerIds, playersById, rotationHistory } =
        await buildMatchmakingState(reshuffleSessionData);
      const { availableCandidates, rankedCandidates } = getRankedCandidates(
        reshuffleSessionData,
        busyPlayerIds
      );
      const eligibleAvailableCandidates = excludedUserId
        ? availableCandidates.filter(
            (candidate) => candidate.userId !== excludedUserId
          )
        : availableCandidates;
      const eligibleRankedCandidates = excludedUserId
        ? rankedCandidates.filter(
            (candidate) => candidate.userId !== excludedUserId
          )
        : rankedCandidates;

      ensureEnoughPlayers(
        eligibleAvailableCandidates.length,
        eligibleRankedCandidates.length,
        1
      );

      const bestSelection = selectSingleCourtMatch({
        rankedCandidates: eligibleRankedCandidates,
        playersById,
        sessionData: reshuffleSessionData,
        rotationHistory,
        reshuffleSource,
      });

      const newMatch = await replaceCurrentCourtMatchAssignment({
        sessionId: sessionData.id,
        courtId: targetCourt.id,
        currentMatchId: targetCourt.currentMatch.id,
        selectedIds: [...bestSelection.ids],
        partition: bestSelection.partition,
        team1ClubId:
          "team1ClubId" in bestSelection ? bestSelection.team1ClubId : null,
        team2ClubId:
          "team2ClubId" in bestSelection ? bestSelection.team2ClubId : null,
        matchmakingReasonJson: bestSelection.matchmakingReasonJson ?? null,
        clearArrivalPriority: true,
      });

      if (sessionData.poolsEnabled && "targetPool" in bestSelection) {
        const nextPoolState = applyPoolSelectionOutcome(sessionData, bestSelection);
        await prisma.session.update({
          where: { id: sessionData.id },
          data: {
            poolACourtAssignments: nextPoolState.poolACourtAssignments,
            poolBCourtAssignments: nextPoolState.poolBCourtAssignments,
            poolAMissedTurns: nextPoolState.poolAMissedTurns,
            poolBMissedTurns: nextPoolState.poolBMissedTurns,
          },
        });
      }

      return NextResponse.json(newMatch);
    }

    const { busyPlayerIds, playersById, rotationHistory } =
      await buildMatchmakingState(sessionData);

    const requestedOpenCourts = getRequestedOpenCourts(
      orderedTargetCourts,
      freedCourtIds
    );
    const requestedMatchCount = requestedOpenCourts.length;
    const { availableCandidates, rankedCandidates } = getRankedCandidates(
      sessionData,
      busyPlayerIds
    );
    const eligibleRankedCandidates = matchType
      ? filterRankedCandidatesByMatchType(rankedCandidates, sessionData, matchType)
      : rankedCandidates;

    if (matchType) {
      ensureEnoughMatchTypePlayers(matchType, eligibleRankedCandidates.length);
    } else {
      ensureEnoughPlayers(
        availableCandidates.length,
        rankedCandidates.length,
        requestedMatchCount
      );
    }

    if (requestedMatchCount === 1) {
      const bestSelection = selectSingleCourtMatch({
        rankedCandidates: eligibleRankedCandidates,
        playersById,
        sessionData,
        rotationHistory,
        reshuffleSource,
      });

      const [newMatch] = await createMatchesForAssignments(sessionData.id, [
        {
          courtId: requestedOpenCourts[0].id,
          selectedIds: [...bestSelection.ids],
          partition: bestSelection.partition,
          team1ClubId:
            "team1ClubId" in bestSelection ? bestSelection.team1ClubId : null,
          team2ClubId:
            "team2ClubId" in bestSelection ? bestSelection.team2ClubId : null,
          matchmakingReasonJson: bestSelection.matchmakingReasonJson ?? null,
          clearArrivalPriority: true,
        },
      ]);

      if (sessionData.poolsEnabled && "targetPool" in bestSelection) {
        const nextPoolState = applyPoolSelectionOutcome(sessionData, bestSelection);
        await prisma.session.update({
          where: { id: sessionData.id },
          data: {
            poolACourtAssignments: nextPoolState.poolACourtAssignments,
            poolBCourtAssignments: nextPoolState.poolBCourtAssignments,
            poolAMissedTurns: nextPoolState.poolAMissedTurns,
            poolBMissedTurns: nextPoolState.poolBMissedTurns,
          },
        });
      }

      return NextResponse.json({
        ...newMatch,
        queuedMatch: await tryRebuildQueuedMatchForSessionId(sessionData.id),
      });
    }

    const batchSelection = selectBatchMatches({
      rankedCandidates,
      playersById,
      sessionData,
      rotationHistory,
      requestedMatchCount,
    });
    const newMatches = await createMatchesForAssignments(
      sessionData.id,
      requestedOpenCourts.map((court, index) => {
        const selection = batchSelection.selections[index];

        return {
          courtId: court.id,
          selectedIds: [...selection.ids],
          partition: selection.partition,
          team1ClubId:
            "team1ClubId" in selection ? selection.team1ClubId : null,
          team2ClubId:
            "team2ClubId" in selection ? selection.team2ClubId : null,
          matchmakingReasonJson: selection.matchmakingReasonJson ?? null,
          clearArrivalPriority: true,
        };
      })
    );

    if (
      sessionData.poolsEnabled &&
      "poolSchedulingState" in batchSelection &&
      batchSelection.poolSchedulingState
    ) {
      await prisma.session.update({
        where: { id: sessionData.id },
        data: {
          poolACourtAssignments:
            batchSelection.poolSchedulingState.poolACourtAssignments,
          poolBCourtAssignments:
            batchSelection.poolSchedulingState.poolBCourtAssignments,
          poolAMissedTurns: batchSelection.poolSchedulingState.poolAMissedTurns,
          poolBMissedTurns: batchSelection.poolSchedulingState.poolBMissedTurns,
        },
      });
    }

    return NextResponse.json({
      matches: newMatches,
      queuedMatch: await tryRebuildQueuedMatchForSessionId(sessionData.id),
    });
  } catch (error: unknown) {
    if (error instanceof GenerateMatchError) {
      if (error.status === 403 || error.status === 404) {
        return invalidTargetResponse(request, "api:sessions:code:generate-match");
      }

      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    logError("Generate match error", error);
    return safeErrorResponse();
  }
}
