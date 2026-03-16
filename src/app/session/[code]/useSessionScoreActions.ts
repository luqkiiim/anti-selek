"use client";

import { useState } from "react";
import {
  applyScoreApproval,
  applyScoreReopen,
  applyScoreSubmission,
} from "./sessionDataMutations";
import type {
  Match,
  MatchScores,
  ScoreSubmissionDraft,
} from "@/components/session/sessionTypes";
import { MatchStatus } from "@/types/enums";
import type { UseSessionMatchActionsDependencies } from "./sessionMatchActionTypes";

const emptyMatchScores = (): MatchScores => ({});

export function useSessionScoreActions({
  code,
  safeJson,
  patchSessionData,
  scheduleSessionRefresh,
  setError,
}: UseSessionMatchActionsDependencies) {
  const [matchScores, setMatchScores] = useState<MatchScores>(emptyMatchScores);
  const [submittingMatchId, setSubmittingMatchId] = useState<string | null>(
    null
  );
  const [scoreSubmissionDraft, setScoreSubmissionDraft] =
    useState<ScoreSubmissionDraft | null>(null);
  const [reopeningMatchId, setReopeningMatchId] = useState<string | null>(null);

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
    handleScoreChange,
    openScoreSubmissionDraft,
    closeScoreSubmissionDraft,
    submitScore,
    approveScore,
    reopenScoreForEdit,
  };
}
