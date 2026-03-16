"use client";

import { useState } from "react";
import {
  applyGeneratedMatches,
  applyScoreApproval,
  applyScoreReopen,
  applyScoreSubmission,
  applyUndoneCourtMatch,
} from "./sessionDataMutations";
import type {
  ManualMatchFormState,
  ManualMatchSlot,
  Match,
  MatchScores,
  ScoreSubmissionDraft,
  SessionData,
} from "@/components/session/sessionTypes";
import { MatchStatus } from "@/types/enums";

interface UseSessionMatchActionsArgs {
  code: string;
  sessionData: SessionData | null;
  safeJson: (res: Response) => Promise<any>;
  patchSessionData: (updater: (current: SessionData) => SessionData) => void;
  scheduleSessionRefresh: (delay?: number) => void;
  setError: (message: string) => void;
}

interface CourtActionDraft {
  action: "reshuffle" | "undo";
  courtId: string;
  courtNumber: number;
  team1Names: [string, string];
  team2Names: [string, string];
}

const emptyManualMatchForm = (): ManualMatchFormState => ({
  team1User1Id: "",
  team1User2Id: "",
  team2User1Id: "",
  team2User2Id: "",
});

const emptyMatchScores = (): MatchScores => ({});

export function useSessionMatchActions({
  code,
  sessionData,
  safeJson,
  patchSessionData,
  scheduleSessionRefresh,
  setError,
}: UseSessionMatchActionsArgs) {
  const [matchScores, setMatchScores] = useState<MatchScores>(emptyMatchScores);
  const [submittingMatchId, setSubmittingMatchId] = useState<string | null>(null);
  const [scoreSubmissionDraft, setScoreSubmissionDraft] =
    useState<ScoreSubmissionDraft | null>(null);
  const [reopeningMatchId, setReopeningMatchId] = useState<string | null>(null);
  const [reshufflingCourtId, setReshufflingCourtId] = useState<string | null>(null);
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

  const handleScoreChange = (
    matchId: string,
    team: "team1" | "team2",
    value: string
  ) => {
    setMatchScores((prev) => ({
      ...prev,
      [matchId]: {
        ...(prev[matchId] || { team1: "", team2: "" }),
        [team]: value,
      },
    }));
  };

  const openScoreSubmissionDraft = (match: Match) => {
    const scores = matchScores[match.id];
    if (!scores || !scores.team1 || !scores.team2) return;

    const team1Score = parseInt(scores.team1, 10);
    const team2Score = parseInt(scores.team2, 10);
    if (Number.isNaN(team1Score) || Number.isNaN(team2Score)) return;

    setScoreSubmissionDraft({
      matchId: match.id,
      team1Names: [match.team1User1.name, match.team1User2.name],
      team2Names: [match.team2User1.name, match.team2User2.name],
      team1Score,
      team2Score,
    });
  };

  const closeScoreSubmissionDraft = () => {
    if (
      scoreSubmissionDraft &&
      submittingMatchId === scoreSubmissionDraft.matchId
    ) {
      return;
    }
    setScoreSubmissionDraft(null);
  };

  const submitScore = async (draft: ScoreSubmissionDraft) => {
    setSubmittingMatchId(draft.matchId);
    setError("");

    try {
      const res = await fetch(`/api/matches/${draft.matchId}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team1Score: draft.team1Score,
          team2Score: draft.team2Score,
        }),
      });
      const data = await safeJson(res);
      if (res.ok) {
        setMatchScores((prev) => {
          const nextScores = { ...prev };
          delete nextScores[draft.matchId];
          return nextScores;
        });
        setScoreSubmissionDraft(null);
        patchSessionData((current) =>
          data.status === MatchStatus.COMPLETED
            ? applyScoreApproval(current, data)
            : applyScoreSubmission(current, data)
        );
        scheduleSessionRefresh();
      } else {
        setError(data.error || "Failed to submit score");
        setScoreSubmissionDraft(null);
      }
    } catch (err) {
      console.error(err);
      setError("Network error submitting score");
      setScoreSubmissionDraft(null);
    } finally {
      setSubmittingMatchId(null);
    }
  };

  const approveScore = async (
    matchId: string,
    overrideTeam1?: number,
    overrideTeam2?: number
  ) => {
    try {
      const res = await fetch(`/api/matches/${matchId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team1Score: overrideTeam1,
          team2Score: overrideTeam2,
        }),
      });
      const data = await safeJson(res);
      if (res.ok) {
        patchSessionData((current) => applyScoreApproval(current, data));
        scheduleSessionRefresh();
      } else {
        setError(data.error || "Failed to approve score");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const reopenScoreForEdit = async (matchId: string) => {
    setReopeningMatchId(matchId);
    setError("");
    try {
      const res = await fetch(`/api/matches/${matchId}/reopen`, {
        method: "POST",
      });
      const data = await safeJson(res);
      if (res.ok) {
        setMatchScores((prev) => {
          const nextScores = { ...prev };
          delete nextScores[matchId];
          return nextScores;
        });
        patchSessionData((current) => applyScoreReopen(current, data));
        scheduleSessionRefresh();
      } else {
        setError(data.error || "Failed to reopen score entry");
      }
    } catch (err) {
      console.error(err);
      setError("Network error reopening score entry");
    } finally {
      setReopeningMatchId(null);
    }
  };

  return {
    matchScores,
    submittingMatchId,
    scoreSubmissionDraft,
    reopeningMatchId,
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
    handleScoreChange,
    openScoreSubmissionDraft,
    closeScoreSubmissionDraft,
    submitScore,
    approveScore,
    reopenScoreForEdit,
  };
}
