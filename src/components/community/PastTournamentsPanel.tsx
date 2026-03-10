"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { getSessionTypeLabel } from "@/lib/sessionModeLabels";

interface Tournament {
  id: string;
  code: string;
  name: string;
  type: string;
  status: string;
  createdAt: string;
  endedAt?: string | null;
  players: { user: { id: string; name: string } }[];
}

interface PastTournamentsPanelProps {
  tournaments: Tournament[];
  canManageCommunity: boolean;
  latestPastTournamentId: string | null;
  rollingBackTournamentCode: string | null;
  onCardClick: (event: MouseEvent<HTMLDivElement>, code: string) => void;
  onCardKeyDown: (event: KeyboardEvent<HTMLDivElement>, code: string) => void;
  onRollbackTournament: (tournament: Tournament) => void;
}

export function PastTournamentsPanel({
  tournaments,
  canManageCommunity,
  latestPastTournamentId,
  rollingBackTournamentCode,
  onCardClick,
  onCardKeyDown,
  onRollbackTournament,
}: PastTournamentsPanelProps) {
  return (
    <div className="bg-white p-6 rounded-3xl shadow-md border border-gray-100 space-y-4 pb-10">
      <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">
        Past Tournaments
      </h3>
      <div className="space-y-3">
        {tournaments.length === 0 ? (
          <div className="bg-gray-50 border-2 border-dashed border-gray-100 rounded-2xl p-4 text-center">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">
              No past tournaments
            </p>
          </div>
        ) : (
          tournaments.map((tournament) => {
            const canRollbackLatest =
              canManageCommunity && tournament.id === latestPastTournamentId;

            return (
              <div
                key={tournament.id}
                role="link"
                tabIndex={0}
                onClick={(event) => onCardClick(event, tournament.code)}
                onKeyDown={(event) => onCardKeyDown(event, tournament.code)}
                className="cursor-pointer rounded-2xl border border-gray-100 bg-gray-50 p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2"
              >
                <div className="mb-2 flex items-start justify-between">
                  <h4 className="font-black text-gray-900">{tournament.name}</h4>
                  <span className="text-[10px] font-black text-gray-600 bg-gray-200 px-2 py-1 rounded-lg uppercase tracking-widest">
                    {tournament.status}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                    {tournament.players.length} Players - {getSessionTypeLabel(tournament.type)} -{" "}
                    {new Date(tournament.createdAt).toLocaleDateString()}
                  </p>
                  {canRollbackLatest ? (
                    <div className="shrink-0">
                      <button
                        type="button"
                        onClick={() => onRollbackTournament(tournament)}
                        disabled={rollingBackTournamentCode !== null}
                        className="text-[10px] bg-red-600 text-white px-3 py-1.5 rounded-lg font-black uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
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
