"use client";

import type { QueuedMatch } from "./sessionTypes";

interface QueuedMatchCardProps {
  queuedMatch: QueuedMatch;
  nextReadyCourtLabel: string | null;
  assigningQueuedMatch: boolean;
  clearingQueuedMatch: boolean;
  onAssignQueuedMatch: () => void;
  onClearQueuedMatch: () => void;
}

export function QueuedMatchCard({
  queuedMatch,
  nextReadyCourtLabel,
  assigningQueuedMatch,
  clearingQueuedMatch,
  onAssignQueuedMatch,
  onClearQueuedMatch,
}: QueuedMatchCardProps) {
  return (
    <div className="app-subcard space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-blue-600">
            Next Up
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {nextReadyCourtLabel
              ? `Ready for ${nextReadyCourtLabel}`
              : "Reserved for the next free court"}
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {nextReadyCourtLabel ? (
            <button
              type="button"
              onClick={onAssignQueuedMatch}
              disabled={assigningQueuedMatch || clearingQueuedMatch}
              className="app-button-primary px-4 py-2"
            >
              {assigningQueuedMatch
                ? "Assigning..."
                : `Assign to ${nextReadyCourtLabel}`}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClearQueuedMatch}
            disabled={clearingQueuedMatch || assigningQueuedMatch}
            className="app-button-secondary px-4 py-2"
          >
            {clearingQueuedMatch ? "Clearing..." : "Clear"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-700">
            Team 1
          </p>
          <p className="mt-2 text-base font-semibold leading-tight text-gray-900">
            {queuedMatch.team1User1.name}
          </p>
          <p className="mt-1 text-base font-semibold leading-tight text-gray-900">
            {queuedMatch.team1User2.name}
          </p>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-700">
            Team 2
          </p>
          <p className="mt-2 text-base font-semibold leading-tight text-gray-900">
            {queuedMatch.team2User1.name}
          </p>
          <p className="mt-1 text-base font-semibold leading-tight text-gray-900">
            {queuedMatch.team2User2.name}
          </p>
        </div>
      </div>
    </div>
  );
}
