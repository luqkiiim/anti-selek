"use client";

import { useEffect, useState, type Ref } from "react";
import type { QueuedMatch } from "./sessionTypes";

interface QueuedMatchCardProps {
  queuedMatch: QueuedMatch | null;
  poolLabel?: string | null;
  canReshuffleQueuedPlayers: boolean;
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
                className={`min-w-0 max-w-full truncate text-[14px] font-bold leading-tight text-gray-900 transition hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-base md:text-[1.35rem] xl:text-base ${textAlignClass}`}
              >
                {player.name}
              </button>
            ) : (
              <p
                className={`min-w-0 truncate text-[14px] font-bold leading-tight text-gray-900 sm:text-base md:text-[1.35rem] xl:text-base ${textAlignClass}`}
              >
                {player.name}
              </p>
            )}

            {canReshuffleQueuedPlayers && actionOpen ? (
              <div
                className={`absolute top-full z-20 mt-2 w-40 max-w-[calc(100vw-3rem)] ${popoverPositionClass}`}
              >
                <div className="relative space-y-2 rounded-2xl border border-gray-900 bg-gray-950 p-2 shadow-[0_18px_40px_-22px_rgba(15,23,42,0.55)]">
                  <div
                    className={`absolute top-0 h-3 w-3 -translate-y-1/2 rotate-45 border-l border-t border-gray-900 bg-gray-950 ${
                      align === "right"
                        ? "right-4"
                        : "left-4"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => onReshuffleQueuedPlayer(player.id)}
                    disabled={queueActionDisabled}
                    className="w-full rounded-xl border border-blue-200/80 bg-blue-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-800 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isReshuffling ? "Reshuffling..." : "Reshuffle Without"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onReplaceQueuedPlayer(player.id)}
                    disabled={queueActionDisabled}
                    className="w-full rounded-xl border border-emerald-200/80 bg-emerald-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-800 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
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
  const queueActionDisabled =
    clearingQueuedMatch ||
    creatingQueuedMatch ||
    creatingManualQueuedMatch ||
    reshufflingQueuedMatch ||
    reshufflingQueuedPlayerId !== null ||
    replacingQueuedPlayerId !== null;
  const activeActionPlayerId =
    reshufflingQueuedPlayerId ?? replacingQueuedPlayerId ?? openActionPlayerId;

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
      className="flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-600 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 md:px-3"
    >
      {reshufflingQueuedMatch ? "Reshuffling..." : "Reshuffle"}
    </button>
  ) : canOpenManualQueue ? (
    <button
      type="button"
      onClick={onOpenManualQueuedMatchModal}
      disabled={queueActionDisabled}
      className="rounded-lg bg-gray-900 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 md:px-3"
    >
      {creatingManualQueuedMatch ? "Opening..." : "Manual"}
    </button>
  ) : null;
  const rightAction = queuedMatch ? (
    <button
      type="button"
      onClick={onClearQueuedMatch}
      disabled={queueActionDisabled}
      className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-rose-700 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 md:px-3"
    >
      {clearingQueuedMatch ? "Undoing..." : "Undo"}
    </button>
  ) : null;

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-gray-100 bg-white px-3 py-3 md:px-4 md:py-3.5">
        <div className="flex min-w-0 justify-start">
          {leftAction}
        </div>
        <div className="pointer-events-none inline-flex min-w-0 items-center rounded-full bg-[var(--warning)] px-4 py-1.5 text-sm font-black uppercase tracking-[0.24em] text-white md:px-5 md:py-2 md:text-lg">
          <span className="truncate">Next Up</span>
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

      <div
        className={`flex flex-1 flex-col justify-center p-3 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:p-4 ${contentVisibilityClass}`}
      >
        {queuedMatch ? (
          <div className="space-y-3">
            <div
              ref={promotionSurfaceRef}
              data-queued-promotion-surface="true"
              className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3 transition-all md:p-3.5"
            >
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
                <span className="rounded-full border border-blue-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-blue-700">
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
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled
                className="w-full rounded-xl bg-gray-900 py-3 text-sm font-black uppercase text-white shadow-md transition-all active:scale-95 active:bg-gray-800 disabled:opacity-50"
              >
                Waiting for Court
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 py-10 text-center">
            <div className="mb-2 text-xs font-black tracking-[0.35em] opacity-40">
              NEXT UP
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">
              Queue slot ready
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
