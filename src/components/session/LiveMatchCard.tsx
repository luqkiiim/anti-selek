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
  reopeningMatchId: string | null;
  submittingMatchId: string | null;
  matchScores: MatchScores;
  onHandleScoreChange: (
    matchId: string,
    team: "team1" | "team2",
    value: string
  ) => void;
  onOpenScoreSubmissionDraft: (match: Match) => void;
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
    <div className={`min-w-0 ${align === "right" ? "text-right" : "text-left"}`}>
      <p className="truncate text-[13px] font-semibold leading-tight text-gray-900 sm:text-sm">
        {playerOneName}
      </p>
      <p className="truncate text-[13px] font-semibold leading-tight text-gray-900 sm:text-sm">
        {playerTwoName}
      </p>
    </div>
  );
}

interface ScoreSlotProps {
  canEdit: boolean;
  scoreValue: string;
  pendingScore?: number;
  onScoreChange: (value: string) => void;
}

function ScoreSlot({
  canEdit,
  scoreValue,
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
        className="h-10 w-10 rounded-lg border border-blue-200 bg-white text-center text-lg font-black tabular-nums text-gray-900 focus:border-blue-500 focus:outline-none sm:h-11 sm:w-11 sm:text-xl"
        placeholder="0"
      />
    );
  }

  return (
    <div
      className={`flex h-10 w-10 items-center justify-center rounded-lg border bg-white text-lg font-black tabular-nums sm:h-11 sm:w-11 sm:text-xl ${
        typeof pendingScore === "number"
          ? "border-gray-200 text-gray-900"
          : "border-gray-100 text-gray-300"
      }`}
    >
      {typeof pendingScore === "number" ? pendingScore : "-"}
    </div>
  );
}

export function LiveMatchCard({
  match,
  currentUserId,
  isAdmin,
  isClaimedUser,
  reopeningMatchId,
  submittingMatchId,
  matchScores,
  onHandleScoreChange,
  onOpenScoreSubmissionDraft,
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

  return (
    <div className="space-y-2.5">
      <div
        className={`rounded-xl border p-2.5 transition-all ${
          isPendingApproval
            ? "border-orange-200 bg-orange-50/60"
            : "border-blue-100 bg-blue-50/40"
        }`}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_2.75rem_2.75rem_minmax(0,1fr)] sm:gap-3">
          <TeamNames
            playerOneName={match.team1User1.name}
            playerTwoName={match.team1User2.name}
          />
          <ScoreSlot
            canEdit={canEdit}
            scoreValue={scores.team1}
            pendingScore={isPendingApproval ? match.team1Score : undefined}
            onScoreChange={(value) => onHandleScoreChange(match.id, "team1", value)}
          />
          <ScoreSlot
            canEdit={canEdit}
            scoreValue={scores.team2}
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
          isSubmitting={submittingMatchId === match.id}
          onSubmit={() => onOpenScoreSubmissionDraft(match)}
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
