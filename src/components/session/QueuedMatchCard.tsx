"use client";

import { useEffect, useState, type Ref } from "react";
import { Clock3, Info, Plus, RefreshCw, Undo2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type { QueuedMatch } from "./sessionTypes";
import { MatchReasonModal } from "./MatchReasonModal";

interface QueuedMatchCardProps {
  queuedMatch: QueuedMatch | null;
  poolLabel?: string | null;
  canReshuffleQueuedPlayers: boolean;
  canViewMatchReason: boolean;
  canOpenManualQueue: boolean;
  clearingQueuedMatch: boolean;
  creatingQueuedMatch: boolean;
  creatingManualQueuedMatch: boolean;
  reshufflingQueuedPlayerId: string | null;
  replacingQueuedPlayerId: string | null;
  reshufflingQueuedMatch: boolean;
  onClearQueuedMatch: () => void;
  onOpenManualQueuedMatchModal: () => void;
  onReshuffleQueuedMatch: () => void;
  onReshuffleQueuedPlayer: (userId: string) => void;
  onReplaceQueuedPlayer: (userId: string) => void;
  promotionSurfaceRef?: Ref<HTMLDivElement>;
  promotionState?: "normal" | "suppressed" | "entering";
}

function TeamPlayers({
  players,
  align = "left",
  canReshuffleQueuedPlayers,
  activeActionPlayerId,
  reshufflingQueuedPlayerId,
  replacingQueuedPlayerId,
  queueActionDisabled,
  onTogglePlayerAction,
  onReshuffleQueuedPlayer,
  onReplaceQueuedPlayer,
}: {
  players: [QueuedMatch["team1User1"], QueuedMatch["team1User2"]];
  align?: "left" | "right";
  canReshuffleQueuedPlayers: boolean;
  activeActionPlayerId: string | null;
  reshufflingQueuedPlayerId: string | null;
  replacingQueuedPlayerId: string | null;
  queueActionDisabled: boolean;
  onTogglePlayerAction: (userId: string) => void;
  onReshuffleQueuedPlayer: (userId: string) => void;
  onReplaceQueuedPlayer: (userId: string) => void;
}) {
  const rowDirectionClass = align === "right" ? "flex-row-reverse" : "flex-row";

  return (
    <div className="min-w-0 space-y-2">
      {players.map((player) => {
        const actionOpen = activeActionPlayerId === player.id;
        const isReshuffling = reshufflingQueuedPlayerId === player.id;
        const isReplacing = replacingQueuedPlayerId === player.id;
        const textAlignClass = align === "right" ? "text-right" : "text-left";
        const popoverPositionClass = align === "right" ? "right-0" : "left-0";

        return (
          <div
            key={player.id}
            className={`relative min-w-0 ${textAlignClass}`}
            data-queued-player-action-root={player.id}
          >
            {canReshuffleQueuedPlayers ? (
              <button
                type="button"
                onClick={() => onTogglePlayerAction(player.id)}
                disabled={queueActionDisabled}
                aria-expanded={actionOpen}
                aria-label={`Open actions for ${player.name}`}
                title={player.name}
                className={`flex min-w-0 w-full items-center gap-1.5 text-[0.95rem] font-semibold leading-tight text-gray-900 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:gap-2 sm:text-base md:text-lg xl:text-base ${textAlignClass} ${rowDirectionClass}`}
              >
                <Avatar
                  name={player.name}
                  avatarUrl={player.avatarUrl}
                  size="court"
                  appearance="court"
                />
                <span className="min-w-0 flex-1 truncate">{player.name}</span>
              </button>
            ) : (
              <div className={`flex min-w-0 items-center gap-1.5 sm:gap-2 ${rowDirectionClass}`}>
                <Avatar
                  name={player.name}
                  avatarUrl={player.avatarUrl}
                  size="court"
                  appearance="court"
                />
                <p
                  className={`min-w-0 flex-1 truncate text-[0.95rem] font-semibold leading-tight text-gray-900 sm:text-base md:text-lg xl:text-base ${textAlignClass}`}
                  title={player.name}
                >
                  {player.name}
                </p>
              </div>
            )}

            {canReshuffleQueuedPlayers && actionOpen ? (
              <div
                className={`absolute top-full z-20 mt-2 w-40 max-w-[calc(100vw-3rem)] ${popoverPositionClass}`}
              >
                <div className="relative space-y-2 rounded-xl border border-gray-200 bg-white p-2 shadow-[0_14px_32px_-22px_rgba(15,23,42,0.35)]">
                  <div
                    className={`absolute top-0 h-3 w-3 -translate-y-1/2 rotate-45 border-l border-t border-gray-200 bg-white ${
                      align === "right"
                        ? "right-4"
                        : "left-4"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => onReshuffleQueuedPlayer(player.id)}
                    disabled={queueActionDisabled}
                    className="w-full rounded-lg border border-blue-200/80 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isReshuffling ? "Reshuffling..." : "Reshuffle Without"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onReplaceQueuedPlayer(player.id)}
                    disabled={queueActionDisabled}
                    className="w-full rounded-lg border border-emerald-200/80 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isReplacing ? "Replacing..." : "Replace"}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function QueuedMatchCard({
  queuedMatch,
  poolLabel,
  canReshuffleQueuedPlayers,
  canViewMatchReason,
  canOpenManualQueue,
  clearingQueuedMatch,
  creatingQueuedMatch,
  creatingManualQueuedMatch,
  reshufflingQueuedPlayerId,
  replacingQueuedPlayerId,
  reshufflingQueuedMatch,
  onClearQueuedMatch,
  onOpenManualQueuedMatchModal,
  onReshuffleQueuedMatch,
  onReshuffleQueuedPlayer,
  onReplaceQueuedPlayer,
  promotionSurfaceRef,
  promotionState = "normal",
}: QueuedMatchCardProps) {
  const [openActionPlayerId, setOpenActionPlayerId] = useState<string | null>(
    null
  );
  const [matchReasonOpen, setMatchReasonOpen] = useState(false);
  const queueActionDisabled =
    clearingQueuedMatch ||
    creatingQueuedMatch ||
    creatingManualQueuedMatch ||
    reshufflingQueuedMatch ||
    reshufflingQueuedPlayerId !== null ||
    replacingQueuedPlayerId !== null;
  const activeActionPlayerId =
    reshufflingQueuedPlayerId ?? replacingQueuedPlayerId ?? openActionPlayerId;
  const canShowMatchReason =
    canViewMatchReason && !!queuedMatch?.matchmakingReason;

  useEffect(() => {
    if (!activeActionPlayerId) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const actionRoot = event.target.closest("[data-queued-player-action-root]");
      if (
        actionRoot?.getAttribute("data-queued-player-action-root") ===
        activeActionPlayerId
      ) {
        return;
      }

      setOpenActionPlayerId(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenActionPlayerId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeActionPlayerId]);

  const togglePlayerAction = (userId: string) => {
    if (queueActionDisabled) return;
    setOpenActionPlayerId((current) => (current === userId ? null : userId));
  };

  const handleReshuffleQueuedPlayer = (userId: string) => {
    setOpenActionPlayerId(userId);
    onReshuffleQueuedPlayer(userId);
  };

  const handleReplaceQueuedPlayer = (userId: string) => {
    setOpenActionPlayerId(userId);
    onReplaceQueuedPlayer(userId);
  };
  const contentVisibilityClass =
    promotionState === "suppressed"
      ? "opacity-0 translate-y-1 scale-[0.985]"
      : promotionState === "entering"
        ? "opacity-100 translate-y-0 scale-100"
        : "opacity-100 translate-y-0 scale-100";

  const leftAction = queuedMatch ? (
    <button
      type="button"
      onClick={onReshuffleQueuedMatch}
      disabled={queueActionDisabled}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 md:px-3"
    >
      <RefreshCw aria-hidden="true" size={14} />
      {reshufflingQueuedMatch ? "Reshuffling..." : "Reshuffle"}
    </button>
  ) : canOpenManualQueue ? (
    <button
      type="button"
      onClick={onOpenManualQueuedMatchModal}
      disabled={queueActionDisabled}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 md:px-3"
    >
      <Plus aria-hidden="true" size={14} />
      {creatingManualQueuedMatch ? "Opening..." : "Manual"}
    </button>
  ) : null;
  const rightAction = queuedMatch ? (
    <button
      type="button"
      onClick={onClearQueuedMatch}
      disabled={queueActionDisabled}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 md:px-3"
    >
      <Undo2 aria-hidden="true" size={14} />
      {clearingQueuedMatch ? "Undoing..." : "Undo"}
    </button>
  ) : null;
  const queuedLineup = queuedMatch ? (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5 sm:gap-3 md:gap-4 xl:gap-3">
      <TeamPlayers
        players={[queuedMatch.team1User1, queuedMatch.team1User2]}
        canReshuffleQueuedPlayers={canReshuffleQueuedPlayers}
        activeActionPlayerId={activeActionPlayerId}
        reshufflingQueuedPlayerId={reshufflingQueuedPlayerId}
        replacingQueuedPlayerId={replacingQueuedPlayerId}
        queueActionDisabled={queueActionDisabled}
        onTogglePlayerAction={togglePlayerAction}
        onReshuffleQueuedPlayer={handleReshuffleQueuedPlayer}
        onReplaceQueuedPlayer={handleReplaceQueuedPlayer}
      />
      <span className="rounded-full border border-amber-200 bg-white px-2 py-1 text-xs font-semibold text-amber-700">
        Next
      </span>
      <TeamPlayers
        players={[queuedMatch.team2User1, queuedMatch.team2User2]}
        align="right"
        canReshuffleQueuedPlayers={canReshuffleQueuedPlayers}
        activeActionPlayerId={activeActionPlayerId}
        reshufflingQueuedPlayerId={reshufflingQueuedPlayerId}
        replacingQueuedPlayerId={replacingQueuedPlayerId}
        queueActionDisabled={queueActionDisabled}
        onTogglePlayerAction={togglePlayerAction}
        onReshuffleQueuedPlayer={handleReshuffleQueuedPlayer}
        onReplaceQueuedPlayer={handleReplaceQueuedPlayer}
      />
    </div>
  ) : null;
  const queuedMatchReasonButton = canShowMatchReason ? (
    <button
      type="button"
      onClick={() => setMatchReasonOpen(true)}
      className="flex min-h-12 min-w-12 items-center justify-center rounded-xl border border-amber-200 bg-white/95 text-amber-700 shadow-sm transition hover:border-amber-300 hover:bg-white hover:text-amber-800 active:scale-95"
      aria-label="Show match reasoning"
      title="Match reasoning"
      data-queued-match-reason-button="footer-leading"
    >
      <Info aria-hidden="true" size={16} strokeWidth={2.3} />
    </button>
  ) : null;

  return (
    <div className="flex min-w-0 flex-col overflow-visible rounded-xl border border-amber-200 bg-white shadow-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-t-xl border-b border-amber-200 bg-amber-50 px-2.5 py-3 md:px-4 md:py-3.5">
        <div className="flex min-w-0 justify-start">
          {leftAction}
        </div>
        <div className="pointer-events-none inline-flex min-w-0 items-center gap-1.5 rounded-lg bg-[var(--warning)] px-4 py-1.5 text-sm font-semibold text-white md:px-5 md:py-2 md:text-lg">
          <Clock3 aria-hidden="true" size={16} />
          <span className="truncate">Next Up</span>
        </div>
        <div className="flex min-w-0 justify-end">
          {rightAction}
        </div>
      </div>

      {poolLabel ? (
        <div className="border-b border-gray-100 bg-indigo-50 px-2.5 py-2 text-center text-xs font-semibold text-indigo-700 md:px-4">
          {poolLabel}
        </div>
      ) : null}

      <div
        className={`flex flex-1 flex-col justify-center p-2.5 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:p-4 ${contentVisibilityClass}`}
      >
        {queuedMatch ? (
          <div className="space-y-3">
            <div
              ref={promotionSurfaceRef}
              data-queued-promotion-surface="true"
              className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 transition-all md:p-3.5"
            >
              {queuedLineup}
            </div>

            {canShowMatchReason && matchReasonOpen ? (
              <MatchReasonModal
                reason={queuedMatch.matchmakingReason!}
                onClose={() => setMatchReasonOpen(false)}
              />
            ) : null}

            {canShowMatchReason ? (
              <div
                data-queued-match-reason-layout="footer-leading"
                className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 pt-2"
              >
                {queuedMatchReasonButton}
                <button
                  type="button"
                  disabled
                  className="app-button-secondary min-h-12 w-full py-3"
                >
                  Waiting for Court
                </button>
              </div>
            ) : (
              <div className="pt-2">
                <button
                  type="button"
                  disabled
                  className="app-button-secondary min-h-12 w-full py-3"
                >
                  Waiting for Court
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/70 px-3 py-10 text-center">
            <p className="text-sm font-semibold text-amber-700">
              Queue slot ready
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
