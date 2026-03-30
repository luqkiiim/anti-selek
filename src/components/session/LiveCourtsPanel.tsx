"use client";

import { SectionCard } from "@/components/ui/chrome";
import { SessionStatus } from "@/types/enums";
import type { Court, Match, MatchScores } from "./sessionTypes";
import { LiveCourtCard } from "./LiveCourtCard";

interface LiveCourtsPanelProps {
  sessionStatus: string;
  courts: Court[];
  currentUserId: string;
  isAdmin: boolean;
  isClaimedUser: boolean;
  confirmingScoreMatchId: string | null;
  activeMatchesCount: number;
  readyCourtsCount: number;
  creatableOpenCourtCount: number;
  creatableOpenCourtIds: string[];
  creatingOpenMatches: boolean;
  creatingOpenCourtCount: number;
  reshufflingCourtId: string | null;
  undoingCourtId: string | null;
  reopeningMatchId: string | null;
  submittingMatchId: string | null;
  matchScores: MatchScores;
  onCreateMatchesForCourts: (courtIds: string[]) => void;
  onOpenManualMatchModal: (courtId: string) => void;
  onReshuffleMatch: (courtId: string) => void;
  onUndoMatchSelection: (courtId: string) => void;
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

export function LiveCourtsPanel({
  sessionStatus,
  courts,
  currentUserId,
  isAdmin,
  isClaimedUser,
  confirmingScoreMatchId,
  activeMatchesCount,
  readyCourtsCount,
  creatableOpenCourtCount,
  creatableOpenCourtIds,
  creatingOpenMatches,
  creatingOpenCourtCount,
  reshufflingCourtId,
  undoingCourtId,
  reopeningMatchId,
  submittingMatchId,
  matchScores,
  onCreateMatchesForCourts,
  onOpenManualMatchModal,
  onReshuffleMatch,
  onUndoMatchSelection,
  onHandleScoreChange,
  onRequestScoreSubmitConfirmation,
  onCancelScoreSubmitConfirmation,
  onSubmitScore,
  onApproveScore,
  onReopenScoreForEdit,
}: LiveCourtsPanelProps) {
  const showCreateMatchesAction =
    sessionStatus === SessionStatus.ACTIVE && isAdmin;
  const showCourtCountPills = courts.length >= 5;
  const canCreateMatches = creatableOpenCourtCount > 0 && !creatingOpenMatches;
  const optimisticCreatingCount = creatingOpenMatches ? creatingOpenCourtCount : 0;
  const displayedActiveMatchesCount = activeMatchesCount + optimisticCreatingCount;
  const displayedReadyCourtsCount = Math.max(
    0,
    readyCourtsCount - optimisticCreatingCount
  );

  return (
    <SectionCard
      eyebrow={sessionStatus === SessionStatus.ACTIVE ? "Court board" : "Court layout"}
      action={
        <div className="flex w-full min-w-0 items-start justify-between gap-3 sm:w-auto sm:justify-end">
          {showCourtCountPills ? (
            <div className="flex min-w-0 flex-col items-start gap-2">
              <span className="app-chip app-chip-accent">
                {displayedActiveMatchesCount} in use
              </span>
              <span className="app-chip app-chip-neutral">
                {displayedReadyCourtsCount} ready
              </span>
            </div>
          ) : null}
          {showCreateMatchesAction ? (
            <button
              type="button"
              onClick={() => onCreateMatchesForCourts(creatableOpenCourtIds)}
              disabled={!canCreateMatches}
              className="app-button-primary shrink-0 whitespace-nowrap px-4 py-2.5"
            >
              {creatingOpenMatches ? "Creating..." : "Create Matches"}
            </button>
          ) : null}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 xl:grid-cols-3">
        {courts
          .slice()
          .sort((a, b) => a.courtNumber - b.courtNumber)
          .map((court) => (
            <LiveCourtCard
              key={court.id}
              sessionStatus={sessionStatus}
              court={court}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              isClaimedUser={isClaimedUser}
              confirmingScoreMatchId={confirmingScoreMatchId}
              reshufflingCourtId={reshufflingCourtId}
              undoingCourtId={undoingCourtId}
              reopeningMatchId={reopeningMatchId}
              submittingMatchId={submittingMatchId}
              matchScores={matchScores}
              onOpenManualMatchModal={onOpenManualMatchModal}
              onReshuffleMatch={onReshuffleMatch}
              onUndoMatchSelection={onUndoMatchSelection}
              onHandleScoreChange={onHandleScoreChange}
              onRequestScoreSubmitConfirmation={onRequestScoreSubmitConfirmation}
              onCancelScoreSubmitConfirmation={onCancelScoreSubmitConfirmation}
              onSubmitScore={onSubmitScore}
              onApproveScore={onApproveScore}
              onReopenScoreForEdit={onReopenScoreForEdit}
            />
          ))}
      </div>
    </SectionCard>
  );
}
