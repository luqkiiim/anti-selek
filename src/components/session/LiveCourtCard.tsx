"use client";

import { MatchStatus, SessionStatus } from "@/types/enums";
import type { Court, Match, MatchScores } from "./sessionTypes";
import { LiveMatchCard } from "./LiveMatchCard";

interface LiveCourtCardProps {
  sessionStatus: string;
  court: Court;
  currentUserId: string;
  isAdmin: boolean;
  isClaimedUser: boolean;
  reshufflingCourtId: string | null;
  undoingCourtId: string | null;
  reopeningMatchId: string | null;
  submittingMatchId: string | null;
  matchScores: MatchScores;
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

export function LiveCourtCard({
  sessionStatus,
  court,
  currentUserId,
  isAdmin,
  isClaimedUser,
  reshufflingCourtId,
  undoingCourtId,
  reopeningMatchId,
  submittingMatchId,
  matchScores,
  onOpenManualMatchModal,
  onReshuffleMatch,
  onUndoMatchSelection,
  onHandleScoreChange,
  onOpenScoreSubmissionDraft,
  onApproveScore,
  onReopenScoreForEdit,
}: LiveCourtCardProps) {
  const currentMatch = court.currentMatch;
  const canManageLiveCourt =
    !!currentMatch && currentMatch.status === MatchStatus.IN_PROGRESS && isAdmin;

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/80 px-3 py-2.5">
        <h2 className="text-sm font-black uppercase tracking-widest text-gray-500">
          Court {court.courtNumber}
        </h2>
        <div className="flex gap-2">
          {sessionStatus === SessionStatus.ACTIVE && !currentMatch && isAdmin ? (
            <button
              type="button"
              onClick={() => onOpenManualMatchModal(court.id)}
              className="rounded-lg bg-gray-900 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-white transition-all active:scale-95"
            >
              Manual
            </button>
          ) : null}
          {canManageLiveCourt ? (
            <button
              type="button"
              onClick={() => onReshuffleMatch(court.id)}
              disabled={reshufflingCourtId === court.id}
              className="flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-600 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              title="Pick different players"
            >
              {reshufflingCourtId === court.id ? "Reshuffling..." : "Reshuffle"}
            </button>
          ) : null}
          {canManageLiveCourt ? (
            <button
              type="button"
              onClick={() => onUndoMatchSelection(court.id)}
              disabled={undoingCourtId === court.id}
              className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-rose-700 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              title="Put selected players back in pool"
            >
              {undoingCourtId === court.id ? "Undoing..." : "Undo"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center p-3">
        {currentMatch ? (
          <LiveMatchCard
            match={currentMatch}
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            isClaimedUser={isClaimedUser}
            reopeningMatchId={reopeningMatchId}
            submittingMatchId={submittingMatchId}
            matchScores={matchScores}
            onHandleScoreChange={onHandleScoreChange}
            onOpenScoreSubmissionDraft={onOpenScoreSubmissionDraft}
            onApproveScore={onApproveScore}
            onReopenScoreForEdit={onReopenScoreForEdit}
          />
        ) : (
          <div className="px-4 py-10 text-center">
            <div className="mb-2 text-xs font-black tracking-[0.35em] opacity-40">
              COURT
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
              {sessionStatus === SessionStatus.ACTIVE
                ? "Next match soon"
                : "Court Inactive"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
