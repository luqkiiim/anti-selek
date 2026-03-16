"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { getSessionTypeLabel } from "@/lib/sessionModeLabels";
import type { CommunityPageSession } from "./communityTypes";

interface CommunityRecentTournamentPanelProps {
  latestPastTournament: CommunityPageSession | null;
  onOpenTournaments: () => void;
  onOpenTournament: (code: string) => void;
}

function shouldIgnoreCardNavigation(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    !!target.closest("button, a, select, input, option")
  );
}

export function CommunityRecentTournamentPanel({
  latestPastTournament,
  onOpenTournaments,
  onOpenTournament,
}: CommunityRecentTournamentPanelProps) {
  return (
    <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
            Recent Tournament
          </h3>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Latest completed result
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenTournaments}
          className="app-button-secondary px-4 py-2"
        >
          Tournament History
        </button>
      </div>
      {latestPastTournament ? (
        <div
          role="link"
          tabIndex={0}
          onClick={(event: MouseEvent<HTMLDivElement>) => {
            if (shouldIgnoreCardNavigation(event.target)) {
              return;
            }
            onOpenTournament(latestPastTournament.code);
          }}
          onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
            if (shouldIgnoreCardNavigation(event.target)) {
              return;
            }

            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpenTournament(latestPastTournament.code);
            }
          }}
          className="cursor-pointer rounded-2xl border border-gray-100 bg-gray-50 p-5 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-lg font-semibold text-gray-900">
                {latestPastTournament.name}
              </h4>
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                {latestPastTournament.players.length} Players -{" "}
                {getSessionTypeLabel(latestPastTournament.type)}
              </p>
            </div>
            <span className="rounded-lg bg-gray-200 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-gray-600">
              {latestPastTournament.status}
            </span>
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-200 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
              {new Date(
                latestPastTournament.endedAt ?? latestPastTournament.createdAt
              ).toLocaleDateString()}
            </p>
            <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">
              Open Results
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 border-2 border-dashed border-gray-100 rounded-2xl p-6 text-center">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
            No completed tournaments yet
          </p>
        </div>
      )}
    </div>
  );
}
