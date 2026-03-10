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
    <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 space-y-4">
      <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
        Current Tournaments
      </h3>
      <div className="space-y-3">
        {tournaments.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-100 rounded-2xl p-4 text-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
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
                className="block rounded-2xl border border-gray-100 bg-gray-50 p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h4 className="font-black text-gray-900">{tournament.name}</h4>
                  <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg uppercase tracking-widest">
                    {tournament.status}
                  </span>
                </div>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                  {tournament.players.length} Players - {getSessionTypeLabel(tournament.type)}
                </p>
              </Link>
            ) : (
              <div
                key={tournament.id}
                className="block rounded-2xl border border-gray-100 bg-gray-50 p-4 transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50"
              >
                <div className="mb-2 flex items-start justify-between">
                  <h4 className="font-black text-gray-900">{tournament.name}</h4>
                  <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg uppercase tracking-widest">
                    {tournament.status}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                    {tournament.players.length} Players - {getSessionTypeLabel(tournament.type)}
                  </p>
                  <button
                    type="button"
                    onClick={() => onJoinTournament(tournament.code)}
                    className="text-[10px] bg-gray-900 text-white px-3 py-1.5 rounded-lg font-black uppercase tracking-wider"
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
