"use client";

import { useEffect, useState } from "react";
import type { QueuedMatch } from "./sessionTypes";

interface QueuedMatchCardProps {
  queuedMatch: QueuedMatch;
  canPauseQueuedPlayers: boolean;
  clearingQueuedMatch: boolean;
  pausingQueuedPlayerId: string | null;
  reshufflingQueuedMatch: boolean;
  onClearQueuedMatch: () => void;
  onPauseQueuedPlayer: (userId: string) => void;
  onReshuffleQueuedMatch: () => void;
}

function TeamPlayers({
  players,
  align = "left",
  canPauseQueuedPlayers,
  activeActionPlayerId,
  pausingQueuedPlayerId,
  queueActionDisabled,
  onTogglePlayerAction,
  onPauseQueuedPlayer,
}: {
  players: [QueuedMatch["team1User1"], QueuedMatch["team1User2"]];
  align?: "left" | "right";
  canPauseQueuedPlayers: boolean;
  activeActionPlayerId: string | null;
  pausingQueuedPlayerId: string | null;
  queueActionDisabled: boolean;
  onTogglePlayerAction: (userId: string) => void;
  onPauseQueuedPlayer: (userId: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-2">
      {players.map((player) => {
        const actionOpen = activeActionPlayerId === player.id;
        const isPausing = pausingQueuedPlayerId === player.id;
        const textAlignClass = align === "right" ? "text-right" : "text-left";
        const popoverPositionClass = align === "right" ? "right-0" : "left-0";

        return (
          <div
            key={player.id}
            className={`relative min-w-0 ${textAlignClass}`}
            data-queued-player-action-root={player.id}
          >
            {canPauseQueuedPlayers ? (
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

            {canPauseQueuedPlayers && actionOpen ? (
              <div
                className={`absolute top-full z-20 mt-2 w-24 max-w-[calc(100vw-3rem)] ${popoverPositionClass}`}
              >
                <div className="relative rounded-2xl border border-gray-900 bg-gray-950 p-2 shadow-[0_18px_40px_-22px_rgba(15,23,42,0.55)]">
                  <div
                    className={`absolute top-0 h-3 w-3 -translate-y-1/2 rotate-45 border-l border-t border-gray-900 bg-gray-950 ${
                      align === "right"
                        ? "right-4"
                        : "left-4"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => onPauseQueuedPlayer(player.id)}
                    disabled={queueActionDisabled}
                    className="w-full rounded-xl border border-amber-200/80 bg-amber-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isPausing ? "Pausing..." : "Pause"}
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
  canPauseQueuedPlayers,
  clearingQueuedMatch,
  pausingQueuedPlayerId,
  reshufflingQueuedMatch,
  onClearQueuedMatch,
  onPauseQueuedPlayer,
  onReshuffleQueuedMatch,
}: QueuedMatchCardProps) {
  const [activeActionPlayerId, setActiveActionPlayerId] = useState<string | null>(
    null
  );
  const queueActionDisabled =
    clearingQueuedMatch ||
    reshufflingQueuedMatch ||
    pausingQueuedPlayerId !== null;

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

      setActiveActionPlayerId(null);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveActionPlayerId(null);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeActionPlayerId]);

  useEffect(() => {
    if (!pausingQueuedPlayerId && activeActionPlayerId) {
      return;
    }

    if (pausingQueuedPlayerId) {
      setActiveActionPlayerId(pausingQueuedPlayerId);
    }
  }, [activeActionPlayerId, pausingQueuedPlayerId]);

  const togglePlayerAction = (userId: string) => {
    if (queueActionDisabled) return;
    setActiveActionPlayerId((current) => (current === userId ? null : userId));
  };

  const handlePauseQueuedPlayer = (userId: string) => {
    setActiveActionPlayerId(userId);
    onPauseQueuedPlayer(userId);
  };

  const leftAction = (
    <button
      type="button"
      onClick={onReshuffleQueuedMatch}
      disabled={queueActionDisabled}
      className="flex items-center gap-1 rounded-lg bg-gray-100 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-gray-600 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 md:px-3"
    >
      {reshufflingQueuedMatch ? "Reshuffling..." : "Reshuffle"}
    </button>
  );
  const rightAction = (
    <button
      type="button"
      onClick={onClearQueuedMatch}
      disabled={queueActionDisabled}
      className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-rose-700 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 md:px-3"
    >
      {clearingQueuedMatch ? "Undoing..." : "Undo"}
    </button>
  );

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

      <div className="flex flex-1 flex-col justify-center p-3 md:p-4">
        <div className="space-y-3">
          <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3 transition-all md:p-3.5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5 sm:gap-3 md:gap-4 xl:gap-3">
              <TeamPlayers
                players={[queuedMatch.team1User1, queuedMatch.team1User2]}
                canPauseQueuedPlayers={canPauseQueuedPlayers}
                activeActionPlayerId={activeActionPlayerId}
                pausingQueuedPlayerId={pausingQueuedPlayerId}
                queueActionDisabled={queueActionDisabled}
                onTogglePlayerAction={togglePlayerAction}
                onPauseQueuedPlayer={handlePauseQueuedPlayer}
              />
              <span className="rounded-full border border-blue-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-blue-700">
                Next
              </span>
              <TeamPlayers
                players={[queuedMatch.team2User1, queuedMatch.team2User2]}
                align="right"
                canPauseQueuedPlayers={canPauseQueuedPlayers}
                activeActionPlayerId={activeActionPlayerId}
                pausingQueuedPlayerId={pausingQueuedPlayerId}
                queueActionDisabled={queueActionDisabled}
                onTogglePlayerAction={togglePlayerAction}
                onPauseQueuedPlayer={handlePauseQueuedPlayer}
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
      </div>
    </div>
  );
}
