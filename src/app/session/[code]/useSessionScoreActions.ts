"use client";

import { useCallback, useState } from "react";
import { getErrorMessage } from "@/lib/http";
import {
  applyGeneratedMatches,
  applyQueuedMatch,
  applyScoreApproval,
  applyScoreReopen,
  applyScoreSubmission,
  type MatchPayload,
} from "./sessionDataMutations";
import type {
  MatchScores,
  QueuedMatch,
} from "@/components/session/sessionTypes";
import { MatchStatus } from "@/types/enums";
import type {
  QueuePromotionAnimation,
  UseSessionMatchActionsDependencies,
} from "./sessionMatchActionTypes";

const emptyMatchScores = (): MatchScores => ({});

interface MatchActionResponse extends MatchPayload {
  error?: string;
  queuedMatch?: QueuedMatch | null;
  autoAssignedMatch?: MatchPayload;
}

export function useSessionScoreActions({
  sessionData,
  safeJson,
  patchSessionData,
  scheduleSessionRefresh,
  setError,
}: UseSessionMatchActionsDependencies) {
  const [matchScores, setMatchScores] = useState<MatchScores>(emptyMatchScores);
  const [submittingMatchId, setSubmittingMatchId] = useState<string | null>(
    null
  );
  const [confirmingScoreMatchId, setConfirmingScoreMatchId] = useState<
    string | null
  >(null);
  const [reopeningMatchId, setReopeningMatchId] = useState<string | null>(null);
  const [queuePromotionAnimation, setQueuePromotionAnimation] =
    useState<QueuePromotionAnimation | null>(null);
  const clearQueuePromotionAnimation = useCallback(() => {
    setQueuePromotionAnimation(null);
  }, []);

  const getParsedScores = (matchId: string) => {
    const scores = matchScores[matchId];
    if (!scores || !scores.team1 || !scores.team2) return null;

    const team1Score = Number.parseInt(scores.team1, 10);
    const team2Score = Number.parseInt(scores.team2, 10);
    if (Number.isNaN(team1Score) || Number.isNaN(team2Score)) return null;

    return { team1Score, team2Score };
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
    setConfirmingScoreMatchId((prev) => (prev === matchId ? null : prev));
  };

  const requestScoreSubmitConfirmation = (matchId: string) => {
    if (!getParsedScores(matchId)) return;
    setConfirmingScoreMatchId(matchId);
  };

  const cancelScoreSubmitConfirmation = (matchId: string) => {
    if (submittingMatchId === matchId) {
      return;
    }
    setConfirmingScoreMatchId((prev) => (prev === matchId ? null : prev));
  };

  const submitScore = async (matchId: string) => {
    const parsedScores = getParsedScores(matchId);
    if (!parsedScores) return;
    const sourceQueuedMatch = sessionData?.queuedMatch ?? null;

    setSubmittingMatchId(matchId);
    setError("");

    try {
      const res = await fetch(`/api/matches/${matchId}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team1Score: parsedScores.team1Score,
          team2Score: parsedScores.team2Score,
        }),
      });
      const data = await safeJson<MatchActionResponse>(res);
      if (res.ok) {
        setMatchScores((prev) => {
          const nextScores = { ...prev };
          delete nextScores[matchId];
          return nextScores;
        });
        setConfirmingScoreMatchId((prev) => (prev === matchId ? null : prev));
        patchSessionData((current) => {
          const nextState =
            data.status === MatchStatus.COMPLETED
              ? applyScoreApproval(current, data)
              : applyScoreSubmission(current, data);

          if (data.status !== MatchStatus.COMPLETED) {
            return nextState;
          }

          return applyQueuedMatch(
            data.autoAssignedMatch
              ? applyGeneratedMatches(nextState, [data.autoAssignedMatch])
              : nextState,
            data.queuedMatch ?? null
          );
        });
        if (
          data.status === MatchStatus.COMPLETED &&
          data.autoAssignedMatch &&
          typeof data.autoAssignedMatch.courtId === "string" &&
          sourceQueuedMatch
        ) {
          setQueuePromotionAnimation({
            id: `${data.autoAssignedMatch.id}:${Date.now()}`,
            sourceQueuedMatch,
            targetCourtId: data.autoAssignedMatch.courtId,
            replacementQueuedMatchId: data.queuedMatch?.id ?? null,
          });
        }
        scheduleSessionRefresh();
      } else {
        setError(getErrorMessage(data, "Failed to submit score"));
      }
    } catch (err) {
      console.error(err);
      setError("Network error submitting score");
    } finally {
      setSubmittingMatchId(null);
    }
  };

  const approveScore = async (
    matchId: string,
    overrideTeam1?: number,
    overrideTeam2?: number
  ) => {
    const sourceQueuedMatch = sessionData?.queuedMatch ?? null;

    try {
      const res = await fetch(`/api/matches/${matchId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team1Score: overrideTeam1,
          team2Score: overrideTeam2,
        }),
      });
      const data = await safeJson<MatchActionResponse>(res);
      if (res.ok) {
        patchSessionData((current) => {
          const nextState = applyScoreApproval(current, data);

          return applyQueuedMatch(
            data.autoAssignedMatch
              ? applyGeneratedMatches(nextState, [data.autoAssignedMatch])
              : nextState,
            data.queuedMatch ?? null
          );
        });
        if (
          data.autoAssignedMatch &&
          typeof data.autoAssignedMatch.courtId === "string" &&
          sourceQueuedMatch
        ) {
          setQueuePromotionAnimation({
            id: `${data.autoAssignedMatch.id}:${Date.now()}`,
            sourceQueuedMatch,
            targetCourtId: data.autoAssignedMatch.courtId,
            replacementQueuedMatchId: data.queuedMatch?.id ?? null,
          });
        }
        scheduleSessionRefresh();
      } else {
        setError(getErrorMessage(data, "Failed to approve score"));
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
      const data = await safeJson<MatchActionResponse>(res);
      if (res.ok) {
        setMatchScores((prev) => {
          const nextScores = { ...prev };
          delete nextScores[matchId];
          return nextScores;
        });
        patchSessionData((current) => applyScoreReopen(current, data));
        scheduleSessionRefresh();
      } else {
        setError(getErrorMessage(data, "Failed to reopen score entry"));
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
    confirmingScoreMatchId,
    reopeningMatchId,
    queuePromotionAnimation,
    handleScoreChange,
    requestScoreSubmitConfirmation,
    cancelScoreSubmitConfirmation,
    submitScore,
    approveScore,
    reopenScoreForEdit,
    clearQueuePromotionAnimation,
  };
}
