import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
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
      });

      const [createdMatch] = await createMatchesForAssignments(sessionData.id, [
        {
          courtId: targetCourt.id,
          selectedIds,
          partition: parsedTeams,
        },
      ]);

      return NextResponse.json(createdMatch);
    }

    const requestedOpenCourts = getRequestedOpenCourts(
      orderedTargetCourts,
      freedCourtIds
    );
    const requestedMatchCount = requestedOpenCourts.length;
    const { availableCandidates, rankedCandidates, matchmakerVersion } =
      getRankedCandidates(
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
        matchmakerVersion,
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

      return NextResponse.json({
        ...newMatch,
        matchmakerVersion,
      });
    }

    const batchSelection = selectBatchMatches({
      matchmakerVersion,
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

    return NextResponse.json({
      matchmakerVersion,
      matches: newMatches,
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
