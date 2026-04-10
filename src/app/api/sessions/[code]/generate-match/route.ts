import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildSessionPoolMap,
  summarizeSessionPoolMembership,
} from "@/lib/sessionPools";
import { tryRebuildQueuedMatchForSessionId } from "../queue-match/shared";
import {
  applyPoolSelectionOutcome,
  buildMatchmakingState,
  createMatchesForAssignments,
  ensureEnoughPlayers,
  GenerateMatchError,
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
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;
    const body = await request.json().catch(() => ({}));
    const {
      requestedCourtIds,
      forceReshuffle,
      undoCurrentMatch,
      manualTeams,
      excludedUserId,
      replaceUserId,
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

    if (manualTeams) {
      const { busyPlayerIds } = await buildMatchmakingState(sessionData);
      const parsedTeams = parseManualTeams(manualTeams);
      const selectedIds = validateManualMatchRequest({
        sessionData,
        targetCourt,
        parsedTeams,
        busyPlayerIds,
      });

      const [createdMatch] = await createMatchesForAssignments(sessionData.id, [
        {
          courtId: targetCourt.id,
          selectedIds,
          partition: parsedTeams,
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

    ensureEnoughPlayers(
      availableCandidates.length,
      rankedCandidates.length,
      requestedMatchCount
    );

    if (requestedMatchCount === 1) {
      const bestSelection = selectSingleCourtMatch({
        rankedCandidates,
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
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }

    console.error("Generate match error:", error);
    return NextResponse.json(
      { error: "Failed to generate match" },
      { status: 500 }
    );
  }
}
