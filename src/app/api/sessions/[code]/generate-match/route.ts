import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildSessionPoolMap,
  summarizeSessionPoolMembership,
} from "@/lib/sessionPools";
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
  reshuffleCurrentCourtMatch,
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
      ignorePools,
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

    if (forceReshuffle && targetCourt.currentMatch) {
      await reshuffleCurrentCourtMatch(sessionData, targetCourt, freedCourtIds);
    }

    const { busyPlayerIds, playersById, rotationHistory } =
      await buildMatchmakingState(sessionData);

    if (manualTeams) {
      const parsedTeams = parseManualTeams(manualTeams);
      const selectedIds = validateManualMatchRequest({
        sessionData,
        targetCourt,
        parsedTeams,
        busyPlayerIds,
        playersById,
        rotationHistory,
        ignorePools,
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

      return NextResponse.json(createdMatch);
    }

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

      return NextResponse.json(newMatch);
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

    return NextResponse.json({ matches: newMatches });
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
