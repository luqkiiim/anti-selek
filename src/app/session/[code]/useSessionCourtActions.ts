"use client";

import { useState } from "react";
import { applyGeneratedMatches, applyUndoneCourtMatch } from "./sessionDataMutations";
import type {
  ManualMatchFormState,
  ManualMatchSlot,
} from "@/components/session/sessionTypes";
import type {
  CourtActionDraft,
  UseSessionMatchActionsDependencies,
} from "./sessionMatchActionTypes";

const emptyManualMatchForm = (): ManualMatchFormState => ({
  team1User1Id: "",
  team1User2Id: "",
  team2User1Id: "",
  team2User2Id: "",
});

export function useSessionCourtActions({
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
  const [courtActionDraft, setCourtActionDraft] =
    useState<CourtActionDraft | null>(null);
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
      const res = await fetch(`/api/sessions/${code}/generate-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          courtIds.length === 1 ? { courtId: courtIds[0] } : { courtIds }
        ),
      });
      const data = await safeJson(res);
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
      const res = await fetch(`/api/sessions/${code}/generate-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courtId: manualCourtId,
          manualTeams: {
            team1: [team1User1Id, team1User2Id],
            team2: [team2User1Id, team2User2Id],
          },
        }),
      });
      const data = await safeJson(res);
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

  const confirmCourtAction = async () => {
    if (!courtActionDraft) return;

    if (courtActionDraft.action === "reshuffle") {
      setReshufflingCourtId(courtActionDraft.courtId);
      setError("");
      try {
        const res = await fetch(`/api/sessions/${code}/generate-match`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            courtId: courtActionDraft.courtId,
            forceReshuffle: true,
          }),
        });
        const data = await safeJson(res);
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
      const res = await fetch(`/api/sessions/${code}/generate-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courtId: courtActionDraft.courtId,
          undoCurrentMatch: true,
        }),
      });
      const data = await safeJson(res);
      if (res.ok) {
        patchSessionData((current) =>
          applyUndoneCourtMatch(current, courtActionDraft.courtId)
        );
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
    courtActionDraft,
    creatingOpenMatches,
    manualCourtId,
    creatingManualMatch,
    manualMatchForm,
    createMatchesForCourts,
    openManualMatchModal,
    closeManualMatchModal,
    updateManualMatchSlot,
    createManualMatch,
    reshuffleMatch,
    undoMatchSelection,
    closeCourtActionDraft,
    confirmCourtAction,
  };
}
