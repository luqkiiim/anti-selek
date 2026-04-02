"use client";

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
  pausingQueuedPlayerId,
  queueActionDisabled,
  onPauseQueuedPlayer,
}: {
  players: [QueuedMatch["team1User1"], QueuedMatch["team1User2"]];
  align?: "left" | "right";
  canPauseQueuedPlayers: boolean;
  pausingQueuedPlayerId: string | null;
  queueActionDisabled: boolean;
  onPauseQueuedPlayer: (userId: string) => void;
}) {
  return (
    <div className="min-w-0 space-y-2">
      {players.map((player) => {
        const isPausing = pausingQueuedPlayerId === player.id;

        return (
          <div key={player.id} className="flex min-w-0 items-center gap-2">
            <p
              className={`min-w-0 flex-1 truncate text-[14px] font-bold leading-tight text-gray-900 sm:text-base md:text-[1.35rem] xl:text-base ${
                align === "right" ? "text-right" : "text-left"
              }`}
            >
              {player.name}
            </p>
            {canPauseQueuedPlayers ? (
              <button
                type="button"
                onClick={() => onPauseQueuedPlayer(player.id)}
                disabled={queueActionDisabled}
                className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-700 transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPausing ? "Pausing..." : "Pause"}
              </button>
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
  const queueActionDisabled =
    clearingQueuedMatch ||
    reshufflingQueuedMatch ||
    pausingQueuedPlayerId !== null;
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
                pausingQueuedPlayerId={pausingQueuedPlayerId}
                queueActionDisabled={queueActionDisabled}
                onPauseQueuedPlayer={onPauseQueuedPlayer}
              />
              <span className="rounded-full border border-blue-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-blue-700">
                Next
              </span>
              <TeamPlayers
                players={[queuedMatch.team2User1, queuedMatch.team2User2]}
                align="right"
                canPauseQueuedPlayers={canPauseQueuedPlayers}
                pausingQueuedPlayerId={pausingQueuedPlayerId}
                queueActionDisabled={queueActionDisabled}
                onPauseQueuedPlayer={onPauseQueuedPlayer}
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
