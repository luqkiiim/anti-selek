"use client";

import { useEffect, useState, type Ref } from "react";
import { getCourtDisplayLabel } from "@/lib/courtLabels";
import type { SideSpecificCourtCreateType } from "@/lib/courtCreate";
import { MatchStatus, SessionStatus } from "@/types/enums";
import type { CourtCreateOptionState } from "./courtCreateOptions";
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
  createMatchOptions: CourtCreateOptionState[];
  createActionDisabled: boolean;
  onCreateCourtMatch: (
    courtId: string,
    matchType?: SideSpecificCourtCreateType
  ) => void;
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
  createMatchOptions,
  createActionDisabled,
  onCreateCourtMatch,
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
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
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
  const activeCreateMenuId = createMenuOpen ? court.id : null;

  useEffect(() => {
    if (!activeCreateMenuId) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const actionRoot = event.target.closest("[data-empty-court-create-root]");
      if (
        actionRoot?.getAttribute("data-empty-court-create-root") ===
        activeCreateMenuId
      ) {
        return;
      }

      setCreateMenuOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setCreateMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeCreateMenuId]);

  useEffect(() => {
    if (currentMatch || !showManualButton) {
      const frameId = window.requestAnimationFrame(() => {
        setCreateMenuOpen(false);
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }
  }, [currentMatch, showManualButton]);

  const handleCreateMenuToggle = () => {
    if (createActionDisabled) {
      return;
    }

    setCreateMenuOpen((current) => !current);
  };

  const handleCreateOption = (option: CourtCreateOptionState) => {
    if (option.disabled || createActionDisabled) {
      return;
    }

    setCreateMenuOpen(false);

    if (option.key === "MANUAL") {
      onOpenManualMatchModal(court.id);
      return;
    }

    onCreateCourtMatch(
      court.id,
      option.key === "BEST" ? undefined : option.key
    );
  };

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
    <div
      className="relative"
      data-empty-court-create-root={court.id}
    >
      <button
        type="button"
        onClick={handleCreateMenuToggle}
        disabled={createActionDisabled}
        aria-expanded={createMenuOpen}
        className="rounded-lg bg-gray-900 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 md:px-3"
      >
        Create
      </button>

      {createMenuOpen ? (
        <div className="absolute left-0 top-full z-20 mt-2 w-48 max-w-[calc(100vw-3rem)]">
          <div className="relative space-y-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-[0_22px_48px_-24px_rgba(15,23,42,0.35)]">
            <div className="absolute left-4 top-0 h-3 w-3 -translate-y-1/2 rotate-45 border-l border-t border-gray-200 bg-white" />
            {createMatchOptions.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => handleCreateOption(option)}
                disabled={option.disabled || createActionDisabled}
                className={`flex w-full flex-col rounded-xl border px-3 py-2 text-left transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${
                  option.key === "MANUAL"
                    ? "border-slate-200 bg-slate-50 text-slate-800"
                    : option.key === "WOMENS"
                      ? "border-rose-200/80 bg-rose-50 text-rose-800"
                      : option.key === "MENS"
                        ? "border-blue-200/80 bg-blue-50 text-blue-800"
                        : "border-emerald-200/80 bg-emerald-50 text-emerald-800"
                }`}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">
                  {option.label}
                </span>
                {option.detail ? (
                  <span className="mt-1 text-[11px] font-medium normal-case tracking-normal">
                    {option.detail}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
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
