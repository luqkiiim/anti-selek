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

type GeneratedMatchesPayload = Parameters<typeof applyGeneratedMatches>[1];
type QueuedMatchPayload = Parameters<typeof applyQueuedMatch>[1];

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
  const [reshufflingQueuedMatch, setReshufflingQueuedMatch] = useState(false);
  const [reshufflingQueuedPlayerId, setReshufflingQueuedPlayerId] = useState<
    string | null
  >(null);
  const [manualCourtId, setManualCourtId] = useState<string | null>(null);
  const [manualQueueOpen, setManualQueueOpen] = useState(false);
  const [creatingManualMatch, setCreatingManualMatch] = useState(false);
  const [manualMatchForm, setManualMatchForm] =
    useState<ManualMatchFormState>(emptyManualMatchForm);

  const syncMatchGenerationResult = (
    matches: GeneratedMatchesPayload,
    queuedMatch?: QueuedMatchPayload | null
  ) => {
    patchSessionData((current) => {
      let next = applyGeneratedMatches(current, matches);

      if (queuedMatch !== undefined) {
        next = applyQueuedMatch(next, queuedMatch ?? null);
      }

      return next;
    });
    scheduleSessionRefresh();
  };

  const syncQueuedMatch = (queuedMatch: QueuedMatchPayload) => {
    patchSessionData((current) => applyQueuedMatch(current, queuedMatch));
    scheduleSessionRefresh();
  };

  const buildManualTeams = (missingPlayersMessage: string) => {
    const { team1User1Id, team1User2Id, team2User1Id, team2User2Id } =
      manualMatchForm;
    if (!team1User1Id || !team1User2Id || !team2User1Id || !team2User2Id) {
      setError(missingPlayersMessage);
      return null;
    }

    return {
      team1: [team1User1Id, team1User2Id] as [string, string],
      team2: [team2User1Id, team2User2Id] as [string, string],
    };
  };

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
        syncMatchGenerationResult(
          matches,
          "queuedMatch" in data ? (data.queuedMatch ?? null) : undefined
        );
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
    setManualQueueOpen(false);
    setManualCourtId(courtId);
    setManualMatchForm(emptyManualMatchForm());
    setError("");
  };

  const openManualQueuedMatchModal = () => {
    setManualCourtId(null);
    setManualQueueOpen(true);
    setManualMatchForm(emptyManualMatchForm());
    setError("");
  };

  const closeManualMatchModal = () => {
    setManualCourtId(null);
    setManualQueueOpen(false);
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

    const manualTeams = buildManualTeams(
      "Choose all 4 players before creating a manual match"
    );
    if (!manualTeams) {
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
          manualTeams,
        },
      });

      if (!res.ok) {
        setError(data.error || "Failed to create manual match");
        return;
      }

      closeManualMatchModal();
      syncMatchGenerationResult([data], data.queuedMatch ?? null);
    } catch (err) {
      console.error(err);
      setError("Network error creating manual match");
    } finally {
      setCreatingManualMatch(false);
    }
  };

  const createManualQueuedMatch = async () => {
    if (!manualQueueOpen || !sessionData) return;

    const manualTeams = buildManualTeams(
      "Choose all 4 players before queueing a manual match"
    );
    if (!manualTeams) {
      return;
    }

    setCreatingManualMatch(true);
    setError("");
    try {
      const { res, data } = await postSessionAction(
        `/api/sessions/${code}/queue-match`,
        {
          safeJson,
          body: {
            manualTeams,
          },
        }
      );

      if (!res.ok) {
        setError(data.error || "Failed to queue manual match");
        return;
      }

      closeManualMatchModal();
      syncQueuedMatch(data.queuedMatch ?? null);
    } catch (err) {
      console.error(err);
      setError("Network error queueing manual match");
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

      syncQueuedMatch(data.queuedMatch ?? null);
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

      syncQueuedMatch(null);
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

      syncMatchGenerationResult([data], data.queuedMatch ?? null);
    } catch (err) {
      console.error(err);
      setError("Network error assigning queued match");
    } finally {
      setAssigningQueuedMatch(false);
    }
  };

  const reshuffleQueuedMatch = async () => {
    if (!sessionData?.queuedMatch) return;

    setReshufflingQueuedMatch(true);
    setError("");
    try {
      const { res, data } = await postSessionAction(
        `/api/sessions/${code}/queue-match`,
        {
          safeJson,
          body: { reshuffle: true },
        }
      );

      if (!res.ok) {
        setError(data.error || "Failed to reshuffle queued match");
        return;
      }

      syncQueuedMatch(data.queuedMatch ?? null);
    } catch (err) {
      console.error(err);
      setError("Network error reshuffling queued match");
    } finally {
      setReshufflingQueuedMatch(false);
    }
  };

  const reshuffleQueuedMatchWithoutPlayer = async (userId: string) => {
    if (!sessionData?.queuedMatch) return;

    setReshufflingQueuedPlayerId(userId);
    setError("");
    try {
      const { res, data } = await postSessionAction(
        `/api/sessions/${code}/queue-match`,
        {
          safeJson,
          body: {
            reshuffle: true,
            excludeUserId: userId,
          },
        }
      );

      if (!res.ok) {
        setError(data.error || "Failed to reshuffle queued match");
        return;
      }

      syncQueuedMatch(data.queuedMatch ?? null);
    } catch (err) {
      console.error(err);
      setError("Network error reshuffling queued match");
    } finally {
      setReshufflingQueuedPlayerId(null);
    }
  };

  return {
    creatingOpenMatches,
    creatingOpenCourtCount,
    creatingQueuedMatch,
    clearingQueuedMatch,
    assigningQueuedMatch,
    reshufflingQueuedMatch,
    reshufflingQueuedPlayerId,
    manualCourtId,
    manualQueueOpen,
    creatingManualMatch,
    manualMatchForm,
    createMatchesForCourts,
    queueNextMatch,
    clearQueuedMatch,
    assignQueuedMatch,
    reshuffleQueuedMatch,
    reshuffleQueuedMatchWithoutPlayer,
    openManualMatchModal,
    openManualQueuedMatchModal,
    closeManualMatchModal,
    updateManualMatchSlot,
    createManualMatch,
    createManualQueuedMatch,
  };
}
