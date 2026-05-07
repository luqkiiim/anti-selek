"use client";

import Link from "next/link";
import { getSessionTypeLabel } from "@/lib/sessionModeLabels";

interface Tournament {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  players: { user: { id: string } }[];
}

interface CurrentTournamentsPanelProps {
  tournaments: Tournament[];
  currentUserId?: string | null;
  onJoinTournament: (code: string) => void;
}

export function CurrentTournamentsPanel({
  tournaments,
  currentUserId,
  onJoinTournament,
}: CurrentTournamentsPanelProps) {
  return (
    <div className="app-panel space-y-4 p-5 sm:p-6">
      <h3 className="app-section-eyebrow">
        Current Tournaments
      </h3>
      <div className="space-y-3">
        {tournaments.length === 0 ? (
          <div className="app-empty p-4 text-center">
            <p className="text-sm font-semibold text-gray-500">
              No active tournaments
            </p>
          </div>
        ) : (
          tournaments.map((tournament) => {
            const isParticipant = tournament.players.some(
              (player) => player.user.id === currentUserId
            );

            return isParticipant ? (
              <Link
                key={tournament.id}
                href={`/session/${tournament.code}`}
                className="block rounded-xl border border-gray-200 bg-gray-50 p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h4 className="font-semibold text-gray-900">{tournament.name}</h4>
                  <span className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-600">
                    {tournament.status}
                  </span>
                </div>
                <p className="text-xs font-semibold text-gray-500">
                  {tournament.players.length} Players - {getSessionTypeLabel(tournament.type)}
                </p>
              </Link>
            ) : (
              <div
                key={tournament.id}
                className="block rounded-xl border border-gray-200 bg-gray-50 p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50"
              >
                <div className="mb-2 flex items-start justify-between">
                  <h4 className="font-semibold text-gray-900">{tournament.name}</h4>
                  <span className="rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-600">
                    {tournament.status}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500">
                    {tournament.players.length} Players - {getSessionTypeLabel(tournament.type)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onJoinTournament(tournament.code)}
                    className="app-button-dark px-3 py-1.5 text-sm"
                  >
                    Join
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
