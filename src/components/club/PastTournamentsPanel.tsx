"use client";

import { getSessionTypeLabel } from "@/lib/sessionModeLabels";
import type { ClubPageSession } from "./clubTypes";

interface PastTournamentsPanelProps {
  tournaments: ClubPageSession[];
  canManageClub: boolean;
  latestPastTournamentId: string | null;
  rollingBackTournamentCode: string | null;
  onOpenTournament: (code: string) => void;
  onRollbackTournament: (tournament: ClubPageSession) => void;
}

function shouldIgnoreCardNavigation(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    !!target.closest("button, a, select, input, option")
  );
}

export function PastTournamentsPanel({
  tournaments,
  canManageClub,
  latestPastTournamentId,
  rollingBackTournamentCode,
  onOpenTournament,
  onRollbackTournament,
}: PastTournamentsPanelProps) {
  return (
    <div className="app-panel space-y-4 p-5 pb-10 sm:p-6">
      <h3 className="app-section-eyebrow">
        Past Tournaments
      </h3>
      <div className="space-y-3">
        {tournaments.length === 0 ? (
          <div className="app-empty p-4 text-center">
            <p className="text-sm font-semibold text-gray-500">
              No past tournaments
            </p>
          </div>
        ) : (
          tournaments.map((tournament) => {
            const canRollbackLatest =
              canManageClub && tournament.id === latestPastTournamentId;

            return (
              <div
                key={tournament.id}
                role="link"
                tabIndex={0}
                onClick={(event) => {
                  if (shouldIgnoreCardNavigation(event.target)) {
                    return;
                  }
                  onOpenTournament(tournament.code);
                }}
                onKeyDown={(event) => {
                  if (shouldIgnoreCardNavigation(event.target)) {
                    return;
                  }

                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onOpenTournament(tournament.code);
                  }
                }}
                className="cursor-pointer rounded-xl border border-gray-200 bg-gray-50 p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
              >
                <div className="mb-2 flex items-start justify-between">
                  <h4 className="font-semibold text-gray-900">{tournament.name}</h4>
                  <span className="rounded-lg bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-600">
                    {tournament.status}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-gray-500">
                    {tournament.players.length} Players - {getSessionTypeLabel(tournament.type)} -{" "}
                    {new Date(tournament.createdAt).toLocaleDateString()}
                  </p>
                  {canRollbackLatest ? (
                    <div className="shrink-0">
                      <button
                        type="button"
                        onClick={() => onRollbackTournament(tournament)}
                        disabled={rollingBackTournamentCode !== null}
                        className="app-button-danger px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {rollingBackTournamentCode === tournament.code
                          ? "Rolling Back..."
                          : "Rollback"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
