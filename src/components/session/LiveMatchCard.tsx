"use client";

import { canApprovePendingSubmission } from "@/lib/matchApprovalRules";
import { MatchStatus } from "@/types/enums";
import type { Match, MatchScores } from "./sessionTypes";
import { PendingApprovalActions } from "./PendingApprovalActions";
import { ScoreEntryControls } from "./ScoreEntryControls";

interface LiveMatchCardProps {
  match: Match;
  currentUserId: string;
  isAdmin: boolean;
  isClaimedUser: boolean;
  confirmingScoreMatchId: string | null;
  reopeningMatchId: string | null;
  submittingMatchId: string | null;
  matchScores: MatchScores;
  onHandleScoreChange: (
    matchId: string,
    team: "team1" | "team2",
    value: string
  ) => void;
  onRequestScoreSubmitConfirmation: (matchId: string) => void;
  onCancelScoreSubmitConfirmation: (matchId: string) => void;
  onSubmitScore: (matchId: string) => void;
  onApproveScore: (matchId: string) => void;
  onReopenScoreForEdit: (matchId: string) => void;
}

interface TeamNamesProps {
  playerOneName: string;
  playerTwoName: string;
  align?: "left" | "right";
}

function TeamNames({
  playerOneName,
  playerTwoName,
  align = "left",
}: TeamNamesProps) {
  return (
    <div
      className={`min-w-0 space-y-1 ${align === "right" ? "text-right" : "text-left"}`}
    >
      <p className="truncate text-[14px] font-bold leading-tight text-gray-900 sm:text-base md:text-[1.35rem] xl:text-base">
        {playerOneName}
      </p>
      <p className="truncate text-[14px] font-bold leading-tight text-gray-900 sm:text-base md:text-[1.35rem] xl:text-base">
        {playerTwoName}
      </p>
    </div>
  );
}

interface ScoreSlotProps {
  canEdit: boolean;
  scoreValue: string;
  readonlyScore?: string | number;
  pendingScore?: number;
  onScoreChange: (value: string) => void;
}

function ScoreSlot({
  canEdit,
  scoreValue,
  readonlyScore,
  pendingScore,
  onScoreChange,
}: ScoreSlotProps) {
  if (canEdit) {
    return (
      <input
        type="number"
        inputMode="numeric"
        value={scoreValue}
        onChange={(event) => onScoreChange(event.target.value)}
        className="h-10 w-10 rounded-lg border border-blue-200 bg-white text-center text-lg font-black tabular-nums text-gray-900 focus:border-blue-500 focus:outline-none sm:h-11 sm:w-11 sm:text-xl md:h-14 md:w-14 md:text-[2rem] xl:h-11 xl:w-11 xl:text-xl"
        placeholder="0"
      />
    );
  }

  const displayScore =
    readonlyScore ??
    (typeof pendingScore === "number" ? pendingScore.toString() : null);

  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-lg border bg-white text-lg font-black tabular-nums sm:h-11 sm:w-11 sm:text-xl md:h-14 md:w-14 md:text-[2rem] xl:h-11 xl:w-11 xl:text-xl ${
        displayScore !== null
          ? "border-gray-200 text-gray-900"
          : "border-gray-100 text-gray-300"
      }`}
    >
      {displayScore ?? "-"}
    </div>
  );
}

export function LiveMatchCard({
  match,
  currentUserId,
  isAdmin,
  isClaimedUser,
  confirmingScoreMatchId,
  reopeningMatchId,
  submittingMatchId,
  matchScores,
  onHandleScoreChange,
  onRequestScoreSubmitConfirmation,
  onCancelScoreSubmitConfirmation,
  onSubmitScore,
  onApproveScore,
  onReopenScoreForEdit,
}: LiveMatchCardProps) {
  const isParticipant = [
    match.team1User1.id,
    match.team1User2.id,
    match.team2User1.id,
    match.team2User2.id,
  ].includes(currentUserId);
  const canEdit =
    match.status === MatchStatus.IN_PROGRESS && (isAdmin || isParticipant);
  const canConfirmPending =
    match.status === MatchStatus.PENDING_APPROVAL &&
    (match.scoreSubmittedByUserId
      ? canApprovePendingSubmission({
          match: {
            team1User1Id: match.team1User1.id,
            team1User2Id: match.team1User2.id,
            team2User1Id: match.team2User1.id,
            team2User2Id: match.team2User2.id,
          },
          approverUserId: currentUserId,
          approverIsAdmin: isAdmin,
          approverIsClaimed: isClaimedUser,
          scoreSubmittedByUserId: match.scoreSubmittedByUserId,
        })
      : isAdmin || isParticipant);
  const scores = matchScores[match.id] || { team1: "", team2: "" };
  const isPendingApproval = match.status === MatchStatus.PENDING_APPROVAL;
  const isConfirmingSubmission = confirmingScoreMatchId === match.id;
  const canEditScores = canEdit && !isConfirmingSubmission;

  return (
    <div className="space-y-3">
      <div
        className={`rounded-2xl border p-3 transition-all md:p-3.5 ${
          isPendingApproval
            ? "border-orange-200 bg-orange-50/60"
            : "border-blue-100 bg-blue-50/40"
        }`}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem_minmax(0,1fr)] items-center gap-2.5 sm:grid-cols-[minmax(0,1fr)_2.75rem_2.75rem_minmax(0,1fr)] sm:gap-3 md:grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_minmax(0,1fr)] md:gap-4 xl:grid-cols-[minmax(0,1fr)_2.75rem_2.75rem_minmax(0,1fr)] xl:gap-3">
          <TeamNames
            playerOneName={match.team1User1.name}
            playerTwoName={match.team1User2.name}
          />
          <ScoreSlot
            canEdit={canEditScores}
            scoreValue={scores.team1}
            readonlyScore={isConfirmingSubmission ? scores.team1 : undefined}
            pendingScore={isPendingApproval ? match.team1Score : undefined}
            onScoreChange={(value) => onHandleScoreChange(match.id, "team1", value)}
          />
          <ScoreSlot
            canEdit={canEditScores}
            scoreValue={scores.team2}
            readonlyScore={isConfirmingSubmission ? scores.team2 : undefined}
            pendingScore={isPendingApproval ? match.team2Score : undefined}
            onScoreChange={(value) => onHandleScoreChange(match.id, "team2", value)}
          />
          <TeamNames
            playerOneName={match.team2User1.name}
            playerTwoName={match.team2User2.name}
            align="right"
          />
        </div>
      </div>

      {canEdit ? (
        <ScoreEntryControls
          canSubmit={!!scores.team1 && !!scores.team2}
          isConfirming={isConfirmingSubmission}
          isSubmitting={submittingMatchId === match.id}
          onSubmit={() => onRequestScoreSubmitConfirmation(match.id)}
          onConfirm={() => onSubmitScore(match.id)}
          onEdit={() => onCancelScoreSubmitConfirmation(match.id)}
        />
      ) : null}

      {isPendingApproval ? (
        <PendingApprovalActions
          canConfirmPending={!!canConfirmPending}
          isAdmin={isAdmin}
          isReopening={reopeningMatchId === match.id}
          onApprove={() => onApproveScore(match.id)}
          onReopen={() => onReopenScoreForEdit(match.id)}
        />
      ) : null}

      {match.status === MatchStatus.IN_PROGRESS && !canEdit ? (
        <div className="py-2 text-center">
          <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-800">
            Match Active
          </span>
        </div>
      ) : null}
    </div>
  );
}
