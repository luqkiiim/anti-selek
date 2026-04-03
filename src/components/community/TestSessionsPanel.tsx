"use client";

import Link from "next/link";
import { getSessionTypeLabel } from "@/lib/sessionModeLabels";
import type { CommunityPageSession } from "./communityTypes";

interface TestSessionsPanelProps {
  sessions: CommunityPageSession[];
  currentUserId?: string | null;
  onOpenSession: (code: string) => void;
}

export function TestSessionsPanel({
  sessions,
  currentUserId,
  onOpenSession,
}: TestSessionsPanelProps) {
  return (
    <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
            Test Sessions
          </h3>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Rehearsals kept separate from real tournament history
          </p>
        </div>
        <span className="app-chip app-chip-neutral">{sessions.length} total</span>
      </div>

      <div className="space-y-3">
        {sessions.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-100 rounded-2xl p-4 text-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
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
                className="block rounded-2xl border border-amber-100 bg-amber-50/50 p-4 transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate font-black text-gray-900">
                      {session.name}
                    </h4>
                    <p className="mt-2 text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                      {session.players.length} Players -{" "}
                      {getSessionTypeLabel(session.type)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-2 py-1 rounded-lg uppercase tracking-widest">
                      Test
                    </span>
                    <span className="text-[10px] font-black text-gray-600 bg-gray-200 px-2 py-1 rounded-lg uppercase tracking-widest">
                      {session.status}
                    </span>
                  </div>
                </div>
              </Link>
            ) : (
              <div
                key={session.id}
                className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate font-black text-gray-900">
                      {session.name}
                    </h4>
                    <p className="mt-2 text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                      {session.players.length} Players -{" "}
                      {getSessionTypeLabel(session.type)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-2 py-1 rounded-lg uppercase tracking-widest">
                      Test
                    </span>
                    <span className="text-[10px] font-black text-gray-600 bg-gray-200 px-2 py-1 rounded-lg uppercase tracking-widest">
                      {session.status}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => onOpenSession(session.code)}
                    className="text-[10px] bg-gray-900 text-white px-3 py-1.5 rounded-lg font-black uppercase tracking-wider"
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
