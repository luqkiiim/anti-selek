"use client";

import { getSessionTypeLabel } from "@/lib/sessionModeLabels";
import { getSessionStatusLabel } from "@/lib/sessionStatusLabels";
import type { ClubPageSession } from "./clubTypes";

interface PastTournamentsPanelProps {
  tournaments: ClubPageSession[];
  canManageClub: boolean;
  latestPastTournamentId: string | null;
  rollingBackTournamentCode: string | null;
  onOpenTournament: (code: string) => void;
  onRollbackTournament: (tournament: ClubPageSession) => void;
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
                className="rounded-xl border border-gray-200 bg-gray-50 p-4"
              >
                <div className="flex items-stretch gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenTournament(tournament.code)}
                    className="min-w-0 flex-1 rounded-lg p-1 text-left transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
                  >
                    <span className="mb-2 flex items-start justify-between gap-3">
                      <span className="font-semibold text-gray-900">
                        {tournament.name}
                      </span>
                      <span className="rounded-lg bg-gray-200 px-2 py-1 text-xs font-semibold text-gray-600">
                        {getSessionStatusLabel(tournament.status)}
                      </span>
                    </span>
                    <span className="block text-xs font-semibold text-gray-500">
                      {tournament.players.length} Players -{" "}
                      {getSessionTypeLabel(tournament.type)} -{" "}
                      {new Date(tournament.createdAt).toLocaleDateString()}
                    </span>
                    <span className="mt-2 block text-xs font-semibold text-blue-700">
                      Open results
                    </span>
                  </button>
                  {canRollbackLatest ? (
                    <button
                      type="button"
                      onClick={() => onRollbackTournament(tournament)}
                      disabled={rollingBackTournamentCode !== null}
                      className="app-button-danger min-h-11 shrink-0 self-center px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {rollingBackTournamentCode === tournament.code
                        ? "Rolling Back..."
                        : "Rollback"}
                    </button>
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
