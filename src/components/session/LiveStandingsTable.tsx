"use client";

import Link from "next/link";
import { PartnerPreference, PlayerGender, SessionStatus, SessionType } from "@/types/enums";

interface Player {
  userId: string;
  sessionPoints: number;
  isPaused: boolean;
  isGuest: boolean;
  gender: PlayerGender;
  partnerPreference: PartnerPreference;
  user: {
    id: string;
    name: string;
    elo: number;
  };
}

interface PlayerStats {
  played: number;
  wins: number;
  losses: number;
}

interface LiveStandingsTableProps {
  sessionType: string;
  sessionStatus: string;
  players: Player[];
  currentUserId: string;
  isAdmin: boolean;
  pointDiffByUserId: Map<string, number>;
  savingPreferencesFor: string | null;
  getPlayerProfileHref: (player: Player) => string;
  calculatePlayerSessionStats: (userId: string) => PlayerStats;
  onTogglePause: (userId: string, isPaused: boolean) => void;
  onTogglePreferenceEditor: (userId: string, triggerEl: HTMLElement) => void;
}

export function LiveStandingsTable({
  sessionType,
  sessionStatus,
  players,
  currentUserId,
  isAdmin,
  pointDiffByUserId,
  savingPreferencesFor,
  getPlayerProfileHref,
  calculatePlayerSessionStats,
  onTogglePause,
  onTogglePreferenceEditor,
}: LiveStandingsTableProps) {
  const isRatingsSession = sessionType === SessionType.ELO;
  const isLadderSession = sessionType === SessionType.LADDER;
  const isCompleted = sessionStatus === SessionStatus.COMPLETED;

  return (
    <div className="app-panel overflow-hidden">
      <div
        className={`px-5 py-4 flex items-center justify-between transition-colors ${
          isRatingsSession ? "bg-blue-700" : "bg-blue-600"
        }`}
      >
        <h2 className="text-sm font-black text-white uppercase tracking-widest">
          {isCompleted
            ? "Final Standings"
            : isLadderSession
              ? "Ladder Standings"
              : "Live Standings"}
        </h2>
        <span className="text-[10px] font-bold text-white/70 uppercase tracking-widest">
          {isCompleted
            ? "Session results"
            : isLadderSession
              ? "Win/Loss + Point Diff"
              : isRatingsSession
              ? "Point Standings + Rating Updates"
              : "Point Totals"}
        </span>
      </div>

      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-max min-w-[448px] table-fixed sm:w-full sm:min-w-[760px] sm:table-auto">
          <thead className="bg-gray-50/50 border-b border-gray-100">
            <tr>
              <th className="w-8 sm:w-10 px-1.5 sm:px-2 py-3 text-left text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest">
                #
              </th>
              <th className="w-[112px] sm:w-auto px-1 sm:px-2 py-3 text-left text-[9px] sm:text-[10px] font-black text-gray-400 uppercase tracking-wide sm:tracking-widest">
                Player
              </th>
              <th className="w-11 sm:w-24 px-1 sm:px-4 py-3 text-center text-[8px] sm:text-[10px] font-black text-gray-400 uppercase tracking-wide sm:tracking-widest">
                {isLadderSession ? "Ldr" : "Pts"}
              </th>
              <th className="w-12 sm:w-24 px-1 sm:px-4 py-3 text-center text-[8px] sm:text-[10px] font-black text-gray-400 uppercase tracking-wide sm:tracking-widest">
                <span className="sm:hidden">+/-</span>
                <span className="hidden sm:inline">Diff</span>
              </th>
              <th className="w-10 sm:w-24 px-1 sm:px-4 py-3 text-center text-[8px] sm:text-[10px] font-black text-gray-400 uppercase tracking-wide sm:tracking-widest">
                MP
              </th>
              <th className="w-11 sm:w-24 px-1 sm:px-4 py-3 text-center text-[8px] sm:text-[10px] font-black text-gray-400 uppercase tracking-wide sm:tracking-widest">
                W/L
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {players.map((player, idx) => {
              const stats = calculatePlayerSessionStats(player.userId);
              const isMe = player.userId === currentUserId;
              const canToggle = !isCompleted && (isAdmin || isMe);
              const pointDiff = pointDiffByUserId.get(player.userId) ?? 0;
              const ladderScore = stats.wins - stats.losses;

              return (
                <tr
                  key={player.userId}
                  className={`active:bg-gray-50 transition-colors ${
                    player.isPaused ? "opacity-40 grayscale" : ""
                  }`}
                >
                  <td className="w-8 sm:w-10 px-1.5 sm:px-2 py-2.5 sm:py-3 whitespace-nowrap">
                    <span
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-lg flex items-center justify-center text-[9px] sm:text-[10px] font-black ${
                        idx === 0
                          ? "bg-amber-100 text-amber-700 border border-amber-300"
                          : idx === 1
                            ? "bg-slate-100 text-slate-700 border border-slate-300"
                            : idx === 2
                              ? "bg-orange-100 text-orange-700 border border-orange-300"
                              : "bg-white text-gray-500 border border-gray-300"
                      }`}
                    >
                      {idx + 1}
                    </span>
                  </td>
                  <td className="w-[112px] sm:w-auto px-1 sm:px-2 py-2.5 sm:py-3 min-w-[112px] sm:min-w-[140px] align-top">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Link
                          href={getPlayerProfileHref(player)}
                          className="block max-w-[92px] truncate font-bold text-gray-900 text-[11px] leading-tight hover:text-blue-600 sm:max-w-none sm:text-sm sm:whitespace-normal"
                        >
                          {player.user.name}
                        </Link>
                        {isMe ? (
                          <span className="h-4.5 sm:h-6 px-1 sm:px-2 rounded-full text-[7px] sm:text-[9px] font-black uppercase tracking-[0.08em] sm:tracking-wide bg-blue-100 text-blue-700 border border-blue-200 inline-flex items-center">
                            Me
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-1 flex-wrap relative">
                        <span className="hidden sm:inline text-[9px] font-bold text-gray-400 uppercase">
                          Rating {player.user.elo}
                        </span>
                        {canToggle ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              onTogglePause(player.userId, player.isPaused);
                            }}
                            className={`h-4.5 sm:h-6 px-1 sm:px-2 rounded-full text-[7px] sm:text-[9px] font-black uppercase tracking-[0.08em] sm:tracking-wide border inline-flex items-center shrink-0 ${
                              player.isPaused
                                ? "bg-rose-100 text-rose-700 border-rose-200"
                                : "bg-gray-100 text-gray-600 border-gray-200"
                            }`}
                          >
                            {player.isPaused ? "Resume" : "Pause"}
                          </button>
                        ) : null}
                        {!isCompleted && isAdmin ? (
                          <button
                            type="button"
                            onClick={(e) => onTogglePreferenceEditor(player.userId, e.currentTarget)}
                            className="h-4.5 sm:h-6 px-1 sm:px-2 rounded-full text-[7px] sm:text-[9px] font-black uppercase tracking-[0.08em] sm:tracking-wide border inline-flex items-center bg-blue-100 text-blue-700 border-blue-200"
                          >
                            Edit
                          </button>
                        ) : null}
                        {player.isGuest ? (
                          <span className="h-4.5 sm:h-6 px-1 sm:px-2 rounded-full text-[7px] sm:text-[9px] font-black uppercase tracking-[0.08em] sm:tracking-wide bg-gray-100 text-gray-600 border border-gray-200 inline-flex items-center">
                            Guest
                          </span>
                        ) : null}
                        {savingPreferencesFor === player.userId ? (
                          <span className="text-[8px] sm:text-[9px] font-black text-gray-400 uppercase tracking-wider">
                            Saving...
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="w-11 sm:w-24 px-1 sm:px-4 py-2.5 sm:py-3 whitespace-nowrap text-center">
                    <span className="text-[13px] sm:text-base font-black text-blue-700">
                      {isLadderSession
                        ? ladderScore > 0
                          ? `+${ladderScore}`
                          : ladderScore
                        : player.sessionPoints}
                    </span>
                  </td>
                  <td className="w-12 sm:w-24 px-1 sm:px-4 py-2.5 sm:py-3 whitespace-nowrap text-center">
                    <span
                      className={`text-[11px] sm:text-sm font-medium ${
                        pointDiff >= 0 ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {pointDiff > 0 ? `+${pointDiff}` : pointDiff}
                    </span>
                  </td>
                  <td className="w-10 sm:w-24 px-1 sm:px-4 py-2.5 sm:py-3 whitespace-nowrap text-center">
                    <span className="text-[10px] sm:text-xs font-bold text-gray-600">
                      {stats.played}
                    </span>
                  </td>
                  <td className="w-11 sm:w-24 px-1 sm:px-4 py-2.5 sm:py-3 whitespace-nowrap text-center">
                    <div className="text-[8px] sm:text-[10px] font-black tracking-tighter">
                      <span className="text-green-600">{stats.wins}</span>
                      <span className="mx-0.5 text-gray-200">/</span>
                      <span className="text-red-500">{stats.losses}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
