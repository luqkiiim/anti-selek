"use client";

import { useState } from "react";
import { applyGeneratedMatches } from "./sessionDataMutations";
import { postGenerateMatchAction } from "./sessionCourtActionApi";
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
  const [manualCourtId, setManualCourtId] = useState<string | null>(null);
  const [creatingManualMatch, setCreatingManualMatch] = useState(false);
  const [manualMatchForm, setManualMatchForm] =
    useState<ManualMatchFormState>(emptyManualMatchForm);

  const createMatchesForCourts = async (courtIds: string[]) => {
    if (courtIds.length === 0) return;

    setCreatingOpenMatches(true);
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

  return {
    creatingOpenMatches,
    manualCourtId,
    creatingManualMatch,
    manualMatchForm,
    createMatchesForCourts,
    openManualMatchModal,
    closeManualMatchModal,
    updateManualMatchSlot,
    createManualMatch,
  };
}
