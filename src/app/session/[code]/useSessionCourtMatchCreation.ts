"use client";

import { useState } from "react";
import { applyGeneratedMatches, applyQueuedMatch } from "./sessionDataMutations";
import {
  deleteSessionAction,
  postGenerateMatchAction,
  postSessionAction,
} from "./sessionCourtActionApi";
import type {
  ManualMatchFormState,
  ManualMatchSlot,
} from "@/components/session/sessionTypes";
import type { UseSessionMatchActionsDependencies } from "./sessionMatchActionTypes";

const emptyManualMatchForm = (): ManualMatchFormState => ({
  team1User1Id: "",
  team1User2Id: "",
  team2User1Id: "",
  team2User2Id: "",
});

export function useSessionCourtMatchCreation({
  code,
  sessionData,
  safeJson,
  patchSessionData,
  scheduleSessionRefresh,
  setError,
}: UseSessionMatchActionsDependencies) {
  const [creatingOpenMatches, setCreatingOpenMatches] = useState(false);
  const [creatingOpenCourtCount, setCreatingOpenCourtCount] = useState(0);
  const [creatingQueuedMatch, setCreatingQueuedMatch] = useState(false);
  const [clearingQueuedMatch, setClearingQueuedMatch] = useState(false);
  const [assigningQueuedMatch, setAssigningQueuedMatch] = useState(false);
  const [manualCourtId, setManualCourtId] = useState<string | null>(null);
  const [creatingManualMatch, setCreatingManualMatch] = useState(false);
  const [manualMatchForm, setManualMatchForm] =
    useState<ManualMatchFormState>(emptyManualMatchForm);

  const createMatchesForCourts = async (courtIds: string[]) => {
    if (courtIds.length === 0) return;

    setCreatingOpenMatches(true);
    setCreatingOpenCourtCount(courtIds.length);
    setError("");
    try {
      const { res, data } = await postGenerateMatchAction({
        code,
        safeJson,
        body: courtIds.length === 1 ? { courtId: courtIds[0] } : { courtIds },
      });

      if (res.ok) {
        const matches = Array.isArray(data.matches) ? data.matches : [data];
        patchSessionData((current) => applyGeneratedMatches(current, matches));
        scheduleSessionRefresh();
      } else {
        setError(data.error || "Failed to create matches");
      }
    } catch (err) {
      console.error(err);
      setError("Network error creating matches");
    } finally {
      setCreatingOpenMatches(false);
      setCreatingOpenCourtCount(0);
    }
  };

  const openManualMatchModal = (courtId: string) => {
    setManualCourtId(courtId);
    setManualMatchForm(emptyManualMatchForm());
    setError("");
  };

  const closeManualMatchModal = () => {
    setManualCourtId(null);
    setCreatingManualMatch(false);
    setManualMatchForm(emptyManualMatchForm());
  };

  const updateManualMatchSlot = (slot: ManualMatchSlot, value: string) => {
    setManualMatchForm((prev) => ({
      ...prev,
      [slot]: value,
    }));
  };

  const createManualMatch = async () => {
    if (!manualCourtId || !sessionData) return;

    const { team1User1Id, team1User2Id, team2User1Id, team2User2Id } =
      manualMatchForm;
    if (!team1User1Id || !team1User2Id || !team2User1Id || !team2User2Id) {
      setError("Choose all 4 players before creating a manual match");
      return;
    }

    setCreatingManualMatch(true);
    setError("");
    try {
      const { res, data } = await postGenerateMatchAction({
        code,
        safeJson,
        body: {
          courtId: manualCourtId,
          manualTeams: {
            team1: [team1User1Id, team1User2Id],
            team2: [team2User1Id, team2User2Id],
          },
        },
      });

      if (!res.ok) {
        setError(data.error || "Failed to create manual match");
        return;
      }

      closeManualMatchModal();
      patchSessionData((current) => applyGeneratedMatches(current, [data]));
      scheduleSessionRefresh();
    } catch (err) {
      console.error(err);
      setError("Network error creating manual match");
    } finally {
      setCreatingManualMatch(false);
    }
  };

  const queueNextMatch = async () => {
    if (!sessionData) return;

    setCreatingQueuedMatch(true);
    setError("");
    try {
      const { res, data } = await postSessionAction(
        `/api/sessions/${code}/queue-match`,
        { safeJson }
      );

      if (!res.ok) {
        setError(data.error || "Failed to queue next match");
        return;
      }

      patchSessionData((current) => applyQueuedMatch(current, data.queuedMatch ?? null));
      scheduleSessionRefresh();
    } catch (err) {
      console.error(err);
      setError("Network error queueing next match");
    } finally {
      setCreatingQueuedMatch(false);
    }
  };

  const clearQueuedMatch = async () => {
    if (!sessionData?.queuedMatch) return;

    setClearingQueuedMatch(true);
    setError("");
    try {
      const { res, data } = await deleteSessionAction(
        `/api/sessions/${code}/queue-match`,
        { safeJson }
      );

      if (!res.ok) {
        setError(data.error || "Failed to clear queued match");
        return;
      }

      patchSessionData((current) => applyQueuedMatch(current, null));
      scheduleSessionRefresh();
    } catch (err) {
      console.error(err);
      setError("Network error clearing queued match");
    } finally {
      setClearingQueuedMatch(false);
    }
  };

  const assignQueuedMatch = async () => {
    if (!sessionData?.queuedMatch) return;

    setAssigningQueuedMatch(true);
    setError("");
    try {
      const { res, data } = await postSessionAction(
        `/api/sessions/${code}/queue-match/assign`,
        { safeJson }
      );

      if (!res.ok) {
        setError(data.error || "Failed to assign queued match");
        return;
      }

      patchSessionData((current) =>
        applyQueuedMatch(applyGeneratedMatches(current, [data]), null)
      );
      scheduleSessionRefresh();
    } catch (err) {
      console.error(err);
      setError("Network error assigning queued match");
    } finally {
      setAssigningQueuedMatch(false);
    }
  };

  return {
    creatingOpenMatches,
    creatingOpenCourtCount,
    creatingQueuedMatch,
    clearingQueuedMatch,
    assigningQueuedMatch,
    manualCourtId,
    creatingManualMatch,
    manualMatchForm,
    createMatchesForCourts,
    queueNextMatch,
    clearQueuedMatch,
    assignQueuedMatch,
    openManualMatchModal,
    closeManualMatchModal,
    updateManualMatchSlot,
    createManualMatch,
  };
}
