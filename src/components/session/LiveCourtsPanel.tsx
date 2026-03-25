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
  activeMatchesCount: number;
  readyCourtsCount: number;
  creatableOpenCourtCount: number;
  creatableOpenCourtIds: string[];
  creatingOpenMatches: boolean;
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
  onOpenScoreSubmissionDraft: (match: Match) => void;
  onApproveScore: (matchId: string) => void;
  onReopenScoreForEdit: (matchId: string) => void;
}

export function LiveCourtsPanel({
  sessionStatus,
  courts,
  currentUserId,
  isAdmin,
  isClaimedUser,
  activeMatchesCount,
  readyCourtsCount,
  creatableOpenCourtCount,
  creatableOpenCourtIds,
  creatingOpenMatches,
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
  onOpenScoreSubmissionDraft,
  onApproveScore,
  onReopenScoreForEdit,
}: LiveCourtsPanelProps) {
  return (
    <SectionCard
      eyebrow={sessionStatus === SessionStatus.ACTIVE ? "Court board" : "Court layout"}
      title={sessionStatus === SessionStatus.ACTIVE ? "Live Courts" : "Courts"}
      description={
        sessionStatus === SessionStatus.ACTIVE
          ? "Score entry, reshuffles, and approvals stay next to each active court."
          : "Courts will populate with live lineups once the session starts."
      }
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="app-chip app-chip-accent">{activeMatchesCount} in use</span>
          <span className="app-chip app-chip-neutral">{readyCourtsCount} ready</span>
          {sessionStatus === SessionStatus.ACTIVE &&
          isAdmin &&
          creatableOpenCourtCount > 0 ? (
            <button
              type="button"
              onClick={() => onCreateMatchesForCourts(creatableOpenCourtIds)}
              disabled={creatingOpenMatches}
              className="app-button-primary"
            >
              {creatingOpenMatches
                ? creatableOpenCourtCount === 1
                  ? "Creating..."
                  : `Creating ${creatableOpenCourtCount}...`
                : creatableOpenCourtCount === 1
                  ? "Create Match"
                  : `Create ${creatableOpenCourtCount} Matches`}
            </button>
          ) : null}
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
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
              reshufflingCourtId={reshufflingCourtId}
              undoingCourtId={undoingCourtId}
              reopeningMatchId={reopeningMatchId}
              submittingMatchId={submittingMatchId}
              matchScores={matchScores}
              onOpenManualMatchModal={onOpenManualMatchModal}
              onReshuffleMatch={onReshuffleMatch}
              onUndoMatchSelection={onUndoMatchSelection}
              onHandleScoreChange={onHandleScoreChange}
              onOpenScoreSubmissionDraft={onOpenScoreSubmissionDraft}
              onApproveScore={onApproveScore}
              onReopenScoreForEdit={onReopenScoreForEdit}
            />
          ))}
      </div>
    </SectionCard>
  );
}
