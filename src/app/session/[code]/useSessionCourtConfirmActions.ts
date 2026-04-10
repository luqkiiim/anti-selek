"use client";

import { getCourtDisplayLabel } from "@/lib/courtLabels";
import { useState } from "react";
import {
  applyGeneratedMatches,
  applyQueuedMatch,
  applyUndoneCourtMatch,
} from "./sessionDataMutations";
import { postGenerateMatchAction } from "./sessionCourtActionApi";
import type {
  CourtActionDraft,
  UseSessionMatchActionsDependencies,
} from "./sessionMatchActionTypes";

export function useSessionCourtConfirmActions({
  code,
  sessionData,
  safeJson,
  patchSessionData,
  scheduleSessionRefresh,
  setError,
}: UseSessionMatchActionsDependencies) {
  const [reshufflingCourtId, setReshufflingCourtId] = useState<string | null>(
    null
  );
  const [undoingCourtId, setUndoingCourtId] = useState<string | null>(null);
  const [reshufflingCourtPlayerId, setReshufflingCourtPlayerId] = useState<
    string | null
  >(null);
  const [courtActionDraft, setCourtActionDraft] =
    useState<CourtActionDraft | null>(null);

  const openCourtActionDraft = (
    courtId: string,
    action: CourtActionDraft["action"]
  ) => {
    const court = sessionData?.courts.find((candidate) => candidate.id === courtId);
    if (!court?.currentMatch) return;

    setError("");
    setCourtActionDraft({
      action,
      courtId,
      courtNumber: court.courtNumber,
      courtLabel: getCourtDisplayLabel(court),
      team1Names: [
        court.currentMatch.team1User1.name,
        court.currentMatch.team1User2.name,
      ],
      team2Names: [
        court.currentMatch.team2User1.name,
        court.currentMatch.team2User2.name,
      ],
    });
  };

  const closeCourtActionDraft = () => {
    if (
      courtActionDraft?.action === "undo" &&
      undoingCourtId === courtActionDraft.courtId
    ) {
      return;
    }

    if (
      courtActionDraft?.action === "reshuffle" &&
      reshufflingCourtId === courtActionDraft.courtId
    ) {
      return;
    }

    setCourtActionDraft(null);
  };

  const reshuffleMatch = (courtId: string) => {
    openCourtActionDraft(courtId, "reshuffle");
  };

  const undoMatchSelection = (courtId: string) => {
    openCourtActionDraft(courtId, "undo");
  };

  const reshuffleMatchWithoutPlayer = async (courtId: string, userId: string) => {
    setReshufflingCourtPlayerId(userId);
    setError("");
    try {
      const { res, data } = await postGenerateMatchAction({
        code,
        safeJson,
        body: {
          courtId,
          forceReshuffle: true,
          excludedUserId: userId,
        },
      });

      if (res.ok) {
        patchSessionData((current) => applyGeneratedMatches(current, [data]));
        scheduleSessionRefresh();
      } else {
        setError(data.error || "Failed to reshuffle match");
      }
    } catch (err) {
      console.error(err);
      setError("Network error reshuffling match");
    } finally {
      setReshufflingCourtPlayerId(null);
    }
  };

  const confirmCourtAction = async () => {
    if (!courtActionDraft) return;

    if (courtActionDraft.action === "reshuffle") {
      setReshufflingCourtId(courtActionDraft.courtId);
      setError("");
      try {
        const { res, data } = await postGenerateMatchAction({
          code,
          safeJson,
          body: {
            courtId: courtActionDraft.courtId,
            forceReshuffle: true,
          },
        });

        if (res.ok) {
          patchSessionData((current) => applyGeneratedMatches(current, [data]));
          setCourtActionDraft(null);
          scheduleSessionRefresh();
        } else {
          setError(data.error || "Failed to reshuffle match");
        }
      } catch (err) {
        console.error(err);
        setError("Network error reshuffling match");
      } finally {
        setReshufflingCourtId(null);
      }

      return;
    }

    setUndoingCourtId(courtActionDraft.courtId);
    setError("");
    try {
      const { res, data } = await postGenerateMatchAction({
        code,
        safeJson,
        body: {
          courtId: courtActionDraft.courtId,
          undoCurrentMatch: true,
        },
      });

      if (res.ok) {
        patchSessionData((current) => {
          let updated = applyUndoneCourtMatch(current, courtActionDraft.courtId);

          if (data.autoAssignedMatch) {
            updated = applyGeneratedMatches(updated, [data.autoAssignedMatch]);
          }

          return applyQueuedMatch(updated, data.queuedMatch ?? null);
        });
        setCourtActionDraft(null);
        scheduleSessionRefresh();
      } else {
        setError(data.error || "Failed to undo match");
      }
    } catch (err) {
      console.error(err);
      setError("Network error undoing match");
    } finally {
      setUndoingCourtId(null);
    }
  };

  return {
    reshufflingCourtId,
    undoingCourtId,
    reshufflingCourtPlayerId,
    courtActionDraft,
    closeCourtActionDraft,
    reshuffleMatch,
    reshuffleMatchWithoutPlayer,
    undoMatchSelection,
    confirmCourtAction,
  };
}
