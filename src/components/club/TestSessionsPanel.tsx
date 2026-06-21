"use client";

import Link from "next/link";
import { getSessionTypeLabel } from "@/lib/sessionModeLabels";
import type { ClubPageSession } from "./clubTypes";

interface TestSessionsPanelProps {
  sessions: ClubPageSession[];
  currentUserId?: string | null;
  onOpenSession: (code: string) => void;
}

export function TestSessionsPanel({
  sessions,
  currentUserId,
  onOpenSession,
}: TestSessionsPanelProps) {
  return (
    <div className="app-panel space-y-4 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="app-section-eyebrow">
            Test Sessions
          </h3>
          <p className="mt-1 text-xs font-semibold text-gray-500">
            Rehearsals kept separate from real tournament history
          </p>
        </div>
        <span className="app-chip app-chip-neutral">{sessions.length} total</span>
      </div>

      <div className="space-y-3">
        {sessions.length === 0 ? (
          <div className="app-empty p-4 text-center">
            <p className="text-sm font-semibold text-gray-500">
              No test sessions
            </p>
          </div>
        ) : (
          sessions.map((session) => {
            const isParticipant = session.players.some(
              (player) => player.user.id === currentUserId
            );

            return isParticipant ? (
              <Link
                key={session.id}
                href={`/session/${session.code}`}
                className="block rounded-xl border border-amber-100 bg-amber-50/50 p-4 transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate font-semibold text-gray-900">
                      {session.name}
                    </h4>
                    <p className="mt-2 text-xs font-semibold text-gray-500">
                      {session.players.length} Players -{" "}
                      {getSessionTypeLabel(session.type)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                      Test
                    </span>
                    <span className="rounded-lg bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-600">
                      {session.status}
                    </span>
                  </div>
                </div>
              </Link>
            ) : (
              <div
                key={session.id}
                className="rounded-xl border border-amber-100 bg-amber-50/50 p-4"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate font-semibold text-gray-900">
                      {session.name}
                    </h4>
                    <p className="mt-2 text-xs font-semibold text-gray-500">
                      {session.players.length} Players -{" "}
                      {getSessionTypeLabel(session.type)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-lg bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                      Test
                    </span>
                    <span className="rounded-lg bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-600">
                      {session.status}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => onOpenSession(session.code)}
                    className="app-button-dark px-3 py-1.5 text-sm"
                  >
                    Open
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
