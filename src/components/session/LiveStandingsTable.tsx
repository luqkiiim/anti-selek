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

function getStandingValue(
  isLadderSession: boolean,
  player: Player,
  stats: PlayerStats
) {
  if (isLadderSession) {
    const ladderScore = stats.wins - stats.losses;
    return ladderScore > 0 ? `+${ladderScore}` : `${ladderScore}`;
  }

  return `${player.sessionPoints}`;
}

function formatPointDiff(pointDiff: number) {
  return pointDiff > 0 ? `+${pointDiff}` : `${pointDiff}`;
}

function getRankBadgeClass(rank: number) {
  if (rank === 1) {
    return "border-amber-300 bg-amber-100 text-amber-700";
  }

  if (rank === 2) {
    return "border-slate-300 bg-slate-100 text-slate-700";
  }

  if (rank === 3) {
    return "border-orange-300 bg-orange-100 text-orange-700";
  }

  return "border-gray-300 bg-white text-gray-500";
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
        className={`px-5 py-4 transition-colors ${
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
      </div>

      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full table-fixed">
          <thead className="border-b border-gray-100 bg-gray-50/60">
            <tr>
              <th className="w-9 px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 sm:w-11 sm:px-3 sm:text-[11px]">
                #
              </th>
              <th className="w-[44%] px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 sm:w-auto sm:px-3 sm:text-[11px]">
                Player
              </th>
              <th className="w-11 px-1.5 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 sm:w-[5.25rem] sm:px-4 sm:text-[11px]">
                {isLadderSession ? (
                  <>
                    <span className="sm:hidden">Ld</span>
                    <span className="hidden sm:inline">Ladder</span>
                  </>
                ) : (
                  <>
                    <span className="sm:hidden">Pts</span>
                    <span className="hidden sm:inline">Points</span>
                  </>
                )}
              </th>
              <th className="w-11 px-1.5 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 sm:w-[4.75rem] sm:px-4 sm:text-[11px]">
                <span className="sm:hidden">Df</span>
                <span className="hidden sm:inline">Diff</span>
              </th>
              <th className="w-11 px-1.5 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 sm:w-[4.5rem] sm:px-4 sm:text-[11px]">
                MP
              </th>
              <th className="w-12 px-1.5 py-2 text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 sm:w-[5rem] sm:px-4 sm:text-[11px]">
                W / L
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {players.map((player, idx) => {
              const stats = calculatePlayerSessionStats(player.userId);
              const isMe = player.userId === currentUserId;
              const canToggle = !isCompleted && (isAdmin || isMe);
              const pointDiff = pointDiffByUserId.get(player.userId) ?? 0;
              const standingValue = getStandingValue(isLadderSession, player, stats);

              return (
                <tr
                  key={player.userId}
                  className={`transition-colors ${
                    isMe ? "bg-blue-50/45" : "hover:bg-gray-50/75"
                  } ${player.isPaused ? "opacity-60" : ""}`}
                >
                  <td className="whitespace-nowrap px-2 py-2 align-middle sm:px-3">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-lg border text-[10px] font-semibold sm:h-6 sm:w-6 sm:text-[11px] ${getRankBadgeClass(
                        idx + 1
                      )}`}
                    >
                      {idx + 1}
                    </span>
                  </td>
                  <td className="px-2 py-2 align-middle sm:px-3">
                    <div className="space-y-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5 leading-tight sm:gap-2">
                        <Link
                          href={getPlayerProfileHref(player)}
                          title={player.user.name}
                          className="min-w-0 max-w-full truncate text-[13px] font-semibold leading-tight text-gray-900 hover:text-blue-600 sm:text-sm"
                        >
                          {player.user.name}
                        </Link>
                        {isMe ? (
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide text-blue-700 sm:px-2 sm:text-[9px]">
                            Me
                          </span>
                        ) : null}
                        {player.isPaused ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide text-amber-800 sm:px-2 sm:text-[9px]">
                            Paused
                          </span>
                        ) : null}
                        {player.isGuest ? (
                          <span className="rounded-full border border-gray-200 bg-gray-100 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide text-gray-700 sm:px-2 sm:text-[9px]">
                            Guest
                          </span>
                        ) : null}
                      </div>

                      {canToggle || (!isCompleted && isAdmin) || savingPreferencesFor === player.userId ? (
                        <div className="flex flex-wrap items-center gap-1.5 text-[10px] leading-none sm:gap-2">
                          {canToggle ? (
                            <button
                              type="button"
                              onClick={() => onTogglePause(player.userId, player.isPaused)}
                              className={`rounded-full border px-2 py-1 text-[9px] font-medium uppercase tracking-wide transition sm:px-2.5 sm:text-[10px] ${
                                player.isPaused
                                  ? "border-amber-200 bg-amber-50 text-amber-800"
                                  : "border-gray-200 bg-white text-gray-700"
                              }`}
                            >
                              {player.isPaused ? "Resume" : "Pause"}
                            </button>
                          ) : null}

                          {!isCompleted && isAdmin ? (
                            <button
                              type="button"
                              onClick={(event) =>
                                onTogglePreferenceEditor(player.userId, event.currentTarget)
                              }
                              className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[9px] font-medium uppercase tracking-wide text-blue-700 transition sm:px-2.5 sm:text-[10px]"
                            >
                              <span className="sm:hidden">Pf</span>
                              <span className="hidden sm:inline">Prefs</span>
                            </button>
                          ) : null}

                          {savingPreferencesFor === player.userId ? (
                            <span className="text-[9px] font-medium uppercase tracking-wide text-blue-700 sm:text-[10px]">
                              Saving
                            </span>
                          ) : null}
                        </div>
                      ) : null}

                      {savingPreferencesFor === player.userId &&
                      !(canToggle || (!isCompleted && isAdmin)) ? (
                        <div className="text-[9px] font-medium uppercase tracking-wide text-blue-700 sm:text-[10px]">
                          Saving
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-2 text-center align-middle sm:w-[5.25rem] sm:px-4">
                    <span className="text-sm font-semibold tabular-nums text-blue-700 sm:text-base">
                      {standingValue}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-2 text-center align-middle sm:w-[4.75rem] sm:px-4">
                    <span
                      className={`text-[12px] font-medium tabular-nums sm:text-sm ${
                        pointDiff >= 0 ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {formatPointDiff(pointDiff)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-2 text-center align-middle text-[12px] font-medium tabular-nums text-gray-700 sm:w-[4.5rem] sm:px-4 sm:text-sm">
                    {stats.played}
                  </td>
                  <td className="whitespace-nowrap px-1.5 py-2 text-center align-middle text-[12px] font-medium tabular-nums text-gray-700 sm:w-[5rem] sm:px-4 sm:text-sm">
                    <span className="text-green-600">{stats.wins}</span>
                    <span className="mx-0.5 text-gray-300 sm:mx-1">/</span>
                    <span className="text-red-500">{stats.losses}</span>
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
