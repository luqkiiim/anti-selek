"use client";

import type { Ref } from "react";
import { getCourtDisplayLabel } from "@/lib/courtLabels";
import { MatchStatus, SessionStatus } from "@/types/enums";
import type { Court, MatchScores } from "./sessionTypes";
import { LiveMatchCard } from "./LiveMatchCard";

type PromotionSurfaceState = "normal" | "suppressed" | "entering";

function PromotionArrivalPlaceholder({
  surfaceRef,
  surfaceId,
}: {
  surfaceRef?: Ref<HTMLDivElement>;
  surfaceId: string;
}) {
  return (
    <div aria-hidden="true" className="space-y-3">
      <div
        ref={surfaceRef}
        data-live-court-promotion-surface={surfaceId}
        className="rounded-2xl border border-blue-100 bg-blue-50/20 p-3 md:p-3.5"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_2.5rem_minmax(0,1fr)] items-center gap-2.5 sm:grid-cols-[minmax(0,1fr)_2.75rem_2.75rem_minmax(0,1fr)] sm:gap-3 md:grid-cols-[minmax(0,1fr)_3.5rem_3.5rem_minmax(0,1fr)] md:gap-4 xl:grid-cols-[minmax(0,1fr)_2.75rem_2.75rem_minmax(0,1fr)] xl:gap-3">
          <div className="space-y-1">
            <div className="h-5 rounded bg-white/70 sm:h-6 md:h-8 xl:h-6" />
            <div className="h-5 rounded bg-white/70 sm:h-6 md:h-8 xl:h-6" />
          </div>
          <div className="h-10 w-10 rounded-lg border border-blue-100 bg-white/60 sm:h-11 sm:w-11 md:h-14 md:w-14 xl:h-11 xl:w-11" />
          <div className="h-10 w-10 rounded-lg border border-blue-100 bg-white/60 sm:h-11 sm:w-11 md:h-14 md:w-14 xl:h-11 xl:w-11" />
          <div className="space-y-1">
            <div className="h-5 rounded bg-white/70 sm:h-6 md:h-8 xl:h-6" />
            <div className="h-5 rounded bg-white/70 sm:h-6 md:h-8 xl:h-6" />
          </div>
        </div>
      </div>

      <div className="h-12 rounded-xl bg-gray-100/70" />
    </div>
  );
}

interface LiveCourtCardProps {
  sessionStatus: string;
  court: Court;
  poolLabel?: string | null;
  currentUserId: string;
  isAdmin: boolean;
  isClaimedUser: boolean;
  confirmingScoreMatchId: string | null;
  reshufflingCourtId: string | null;
  reshufflingCourtPlayerId: string | null;
  replacingCourtPlayerId: string | null;
  undoingCourtId: string | null;
  reopeningMatchId: string | null;
  submittingMatchId: string | null;
  matchScores: MatchScores;
  onOpenManualMatchModal: (courtId: string) => void;
  onReshuffleMatch: (courtId: string) => void;
  onReshuffleMatchWithoutPlayer: (courtId: string, userId: string) => void;
  onReplaceMatchPlayer: (courtId: string, userId: string) => void;
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
  promotionSurfaceRef?: Ref<HTMLDivElement>;
  isPromotionTarget?: boolean;
  promotionState?: PromotionSurfaceState;
}

export function LiveCourtCard({
  sessionStatus,
  court,
  poolLabel,
  currentUserId,
  isAdmin,
  isClaimedUser,
  confirmingScoreMatchId,
  reshufflingCourtId,
  reshufflingCourtPlayerId,
  replacingCourtPlayerId,
  undoingCourtId,
  reopeningMatchId,
  submittingMatchId,
  matchScores,
  onOpenManualMatchModal,
  onReshuffleMatch,
  onReshuffleMatchWithoutPlayer,
  onReplaceMatchPlayer,
  onUndoMatchSelection,
  onHandleScoreChange,
  onRequestScoreSubmitConfirmation,
  onCancelScoreSubmitConfirmation,
  onSubmitScore,
  onApproveScore,
  onReopenScoreForEdit,
  promotionSurfaceRef,
  isPromotionTarget = false,
  promotionState = "normal",
}: LiveCourtCardProps) {
  const currentMatch = court.currentMatch;
  const courtPlayerActionActive =
    !!currentMatch &&
    !!reshufflingCourtPlayerId &&
    [
      currentMatch.team1User1.id,
      currentMatch.team1User2.id,
      currentMatch.team2User1.id,
      currentMatch.team2User2.id,
    ].includes(reshufflingCourtPlayerId);
  const canManageLiveCourt =
    !!currentMatch && currentMatch.status === MatchStatus.IN_PROGRESS && isAdmin;
  const liveCourtActionDisabled =
    reshufflingCourtId === court.id || courtPlayerActionActive;
  const showManualButton =
    sessionStatus === SessionStatus.ACTIVE && !currentMatch && isAdmin;
  const leftAction = canManageLiveCourt ? (
    <button
      type="button"
      onClick={() => onReshuffleMatch(court.id)}
      disabled={liveCourtActionDisabled}
      className="flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-600 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 md:px-3"
      title="Pick different players"
    >
      {liveCourtActionDisabled ? "Reshuffling..." : "Reshuffle"}
    </button>
  ) : showManualButton ? (
    <button
      type="button"
      onClick={() => onOpenManualMatchModal(court.id)}
      className="rounded-lg bg-gray-900 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-white transition-all active:scale-95 md:px-3"
    >
      Manual
    </button>
  ) : null;
  const rightAction = canManageLiveCourt ? (
    <button
      type="button"
      onClick={() => onUndoMatchSelection(court.id)}
      disabled={undoingCourtId === court.id || courtPlayerActionActive}
      className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-rose-700 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 md:px-3"
      title="Put selected players back in pool"
    >
      {undoingCourtId === court.id ? "Undoing..." : "Undo"}
    </button>
  ) : null;
  const matchContentVisibilityClass =
    promotionState === "entering"
      ? "opacity-100 translate-y-0 scale-100"
      : "opacity-100 translate-y-0 scale-100";

  return (
    <div
      data-live-court-card={court.id}
      className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-shadow ${
        isPromotionTarget ? "app-court-promotion-target" : ""
      }`}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-gray-100 bg-white px-3 py-3 md:px-4 md:py-3.5">
        <div className="flex min-w-0 justify-start">
          {leftAction}
        </div>
        <div className="pointer-events-none inline-flex min-w-0 items-center rounded-full bg-[var(--accent-strong)] px-4 py-1.5 text-sm font-black uppercase tracking-[0.24em] text-white md:px-5 md:py-2 md:text-lg">
          <span className="truncate">{getCourtDisplayLabel(court)}</span>
        </div>
        <div className="flex min-w-0 justify-end">
          {rightAction}
        </div>
      </div>

      {poolLabel ? (
        <div className="border-b border-gray-100 bg-indigo-50 px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-700 md:px-4">
          {poolLabel}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col justify-center p-3 md:p-4">
        {currentMatch ? (
          promotionState === "suppressed" ? (
            <PromotionArrivalPlaceholder
              surfaceRef={promotionSurfaceRef}
              surfaceId={court.id}
            />
          ) : (
            <div
              className={`transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${matchContentVisibilityClass}`}
            >
              <LiveMatchCard
                match={currentMatch}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                isClaimedUser={isClaimedUser}
                confirmingScoreMatchId={confirmingScoreMatchId}
                reshufflingCourtPlayerId={reshufflingCourtPlayerId}
                replacingCourtPlayerId={replacingCourtPlayerId}
                reopeningMatchId={reopeningMatchId}
                submittingMatchId={submittingMatchId}
                matchScores={matchScores}
                lineupRef={promotionSurfaceRef}
                onReshuffleWithoutPlayer={(userId) =>
                  onReshuffleMatchWithoutPlayer(court.id, userId)
                }
                onReplacePlayer={(userId) =>
                  onReplaceMatchPlayer(court.id, userId)
                }
                onHandleScoreChange={onHandleScoreChange}
                onRequestScoreSubmitConfirmation={
                  onRequestScoreSubmitConfirmation
                }
                onCancelScoreSubmitConfirmation={
                  onCancelScoreSubmitConfirmation
                }
                onSubmitScore={onSubmitScore}
                onApproveScore={onApproveScore}
                onReopenScoreForEdit={onReopenScoreForEdit}
              />
            </div>
          )
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
