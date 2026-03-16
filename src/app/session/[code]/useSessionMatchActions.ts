"use client";

import { useState } from "react";
import type {
  ManualMatchFormState,
  ManualMatchSlot,
  Match,
  MatchScores,
  ScoreSubmissionDraft,
  SessionData,
} from "@/components/session/sessionTypes";

interface UseSessionMatchActionsArgs {
  code: string;
  sessionData: SessionData | null;
  safeJson: (res: Response) => Promise<any>;
  fetchSession: () => Promise<void> | void;
  setError: (message: string) => void;
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
  fetchSession,
  setError,
}: UseSessionMatchActionsArgs) {
  const [matchScores, setMatchScores] = useState<MatchScores>(emptyMatchScores);
  const [submittingMatchId, setSubmittingMatchId] = useState<string | null>(null);
  const [scoreSubmissionDraft, setScoreSubmissionDraft] =
    useState<ScoreSubmissionDraft | null>(null);
  const [reopeningMatchId, setReopeningMatchId] = useState<string | null>(null);
  const [undoingCourtId, setUndoingCourtId] = useState<string | null>(null);
  const [creatingOpenMatches, setCreatingOpenMatches] = useState(false);
  const [manualCourtId, setManualCourtId] = useState<string | null>(null);
  const [creatingManualMatch, setCreatingManualMatch] = useState(false);
  const [manualMatchForm, setManualMatchForm] =
    useState<ManualMatchFormState>(emptyManualMatchForm);

  const refreshSession = async () => {
    await Promise.resolve(fetchSession());
  };

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
      if (res.ok) {
        await refreshSession();
      } else {
        const data = await safeJson(res);
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
      await refreshSession();
    } catch (err) {
      console.error(err);
      setError("Network error creating manual match");
    } finally {
      setCreatingManualMatch(false);
    }
  };

  const reshuffleMatch = async (courtId: string) => {
    if (
      !confirm(
        "Are you sure you want to reshuffle? This will delete the current match and pick new players."
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/sessions/${code}/generate-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courtId, forceReshuffle: true }),
      });
      if (res.ok) {
        await refreshSession();
      } else {
        const data = await safeJson(res);
        setError(data.error || "Failed to reshuffle match");
      }
    } catch (err) {
      console.error(err);
      setError("Network error reshuffling match");
    }
  };

  const undoMatchSelection = async (courtId: string) => {
    if (
      !confirm(
        "Undo this match selection? The 4 selected players will return to the pool."
      )
    ) {
      return;
    }
    setUndoingCourtId(courtId);
    setError("");
    try {
      const res = await fetch(`/api/sessions/${code}/generate-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courtId, undoCurrentMatch: true }),
      });
      if (res.ok) {
        await refreshSession();
      } else {
        const data = await safeJson(res);
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
      if (res.ok) {
        setMatchScores((prev) => {
          const nextScores = { ...prev };
          delete nextScores[draft.matchId];
          return nextScores;
        });
        setScoreSubmissionDraft(null);
        await refreshSession();
      } else {
        const data = await safeJson(res);
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
      if (res.ok) {
        await refreshSession();
      } else {
        const data = await safeJson(res);
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
      if (res.ok) {
        setMatchScores((prev) => {
          const nextScores = { ...prev };
          delete nextScores[matchId];
          return nextScores;
        });
        await refreshSession();
      } else {
        const data = await safeJson(res);
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
    undoingCourtId,
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
    handleScoreChange,
    openScoreSubmissionDraft,
    closeScoreSubmissionDraft,
    submitScore,
    approveScore,
    reopenScoreForEdit,
  };
}
