"use client";

import type { QueuedMatch } from "./sessionTypes";

interface QueuedMatchCardProps {
  queuedMatch: QueuedMatch;
  nextReadyCourtLabel: string | null;
  assigningQueuedMatch: boolean;
  clearingQueuedMatch: boolean;
  reshufflingQueuedMatch: boolean;
  onAssignQueuedMatch: () => void;
  onClearQueuedMatch: () => void;
  onReshuffleQueuedMatch: () => void;
}

function TeamNames({
  playerOneName,
  playerTwoName,
  align = "left",
}: {
  playerOneName: string;
  playerTwoName: string;
  align?: "left" | "right";
}) {
  return (
    <div
      className={`min-w-0 space-y-1 ${align === "right" ? "text-right" : "text-left"}`}
    >
      <p className="truncate text-[14px] font-bold leading-tight text-gray-900 sm:text-base md:text-[1.35rem] xl:text-base">
        {playerOneName}
      </p>
      <p className="truncate text-[14px] font-bold leading-tight text-gray-900 sm:text-base md:text-[1.35rem] xl:text-base">
        {playerTwoName}
      </p>
    </div>
  );
}

export function QueuedMatchCard({
  queuedMatch,
  nextReadyCourtLabel,
  assigningQueuedMatch,
  clearingQueuedMatch,
  reshufflingQueuedMatch,
  onAssignQueuedMatch,
  onClearQueuedMatch,
  onReshuffleQueuedMatch,
}: QueuedMatchCardProps) {
  const queueActionDisabled =
    assigningQueuedMatch || clearingQueuedMatch || reshufflingQueuedMatch;
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
        <div className="pointer-events-none inline-flex min-w-0 items-center rounded-full bg-gray-900 px-4 py-1.5 text-sm font-black uppercase tracking-[0.24em] text-white md:px-5 md:py-2 md:text-lg">
          <span className="truncate">Next Up</span>
        </div>
        <div className="flex min-w-0 justify-end">
          {rightAction}
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center p-3 md:p-4">
        <div className="space-y-3">
          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            {nextReadyCourtLabel
              ? `Ready for ${nextReadyCourtLabel}`
              : "Reserved for the next free court"}
          </p>

          <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-3 transition-all md:p-3.5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2.5 sm:gap-3 md:gap-4 xl:gap-3">
              <TeamNames
                playerOneName={queuedMatch.team1User1.name}
                playerTwoName={queuedMatch.team1User2.name}
              />
              <span className="rounded-full border border-blue-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-blue-700">
                Next
              </span>
              <TeamNames
                playerOneName={queuedMatch.team2User1.name}
                playerTwoName={queuedMatch.team2User2.name}
                align="right"
              />
            </div>
          </div>
        </div>
      </div>

      {nextReadyCourtLabel ? (
        <div className="px-3 pb-3 md:px-4 md:pb-4">
          <button
            type="button"
            onClick={onAssignQueuedMatch}
            disabled={queueActionDisabled}
            className="w-full rounded-xl bg-gray-900 px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.2em] text-white transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {assigningQueuedMatch
              ? "Assigning..."
              : `Assign to ${nextReadyCourtLabel}`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
