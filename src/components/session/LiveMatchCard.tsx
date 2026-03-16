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

interface TeamScorePanelProps {
  label: string;
  labelClassName: string;
  playerOneName: string;
  playerTwoName: string;
  panelClassName: string;
  canEdit: boolean;
  scoreValue: string;
  pendingScore?: number;
  onScoreChange: (value: string) => void;
}

function TeamScorePanel({
  label,
  labelClassName,
  playerOneName,
  playerTwoName,
  panelClassName,
  canEdit,
  scoreValue,
  pendingScore,
  onScoreChange,
}: TeamScorePanelProps) {
  return (
    <div className={`rounded-xl border-2 p-3 transition-all ${panelClassName}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={`mb-0.5 text-[10px] font-black uppercase tracking-widest ${labelClassName}`}
          >
            {label}
          </p>
          <p className="truncate text-sm font-bold leading-tight text-gray-900">
            {playerOneName}
            <br />
            {playerTwoName}
          </p>
        </div>
        {canEdit ? (
          <input
            type="number"
            inputMode="numeric"
            value={scoreValue}
            onChange={(event) => onScoreChange(event.target.value)}
            className="h-12 w-14 rounded-xl border-2 border-blue-200 bg-white text-center text-xl font-black focus:border-blue-500 focus:outline-none"
            placeholder="0"
          />
        ) : typeof pendingScore === "number" ? (
          <div className="pr-2 text-2xl font-black text-gray-900">
            {pendingScore}
          </div>
        ) : null}
      </div>
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
    <div className="space-y-3">
      <TeamScorePanel
        label="Team 1"
        labelClassName="text-blue-600"
        playerOneName={match.team1User1.name}
        playerTwoName={match.team1User2.name}
        panelClassName={
          isPendingApproval ? "border-gray-100 bg-gray-50" : "border-blue-100 bg-blue-50/50"
        }
        canEdit={canEdit}
        scoreValue={scores.team1}
        pendingScore={isPendingApproval ? match.team1Score : undefined}
        onScoreChange={(value) => onHandleScoreChange(match.id, "team1", value)}
      />

      <div className="relative flex items-center justify-center py-1">
        <div className="h-px flex-1 bg-gray-100" />
        <span className="mx-3 text-[10px] font-black uppercase italic text-gray-300">
          VS
        </span>
        <div className="h-px flex-1 bg-gray-100" />
      </div>

      <TeamScorePanel
        label="Team 2"
        labelClassName="text-blue-700"
        playerOneName={match.team2User1.name}
        playerTwoName={match.team2User2.name}
        panelClassName={
          isPendingApproval ? "border-gray-100 bg-gray-50" : "border-blue-200 bg-blue-50"
        }
        canEdit={canEdit}
        scoreValue={scores.team2}
        pendingScore={isPendingApproval ? match.team2Score : undefined}
        onScoreChange={(value) => onHandleScoreChange(match.id, "team2", value)}
      />

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
