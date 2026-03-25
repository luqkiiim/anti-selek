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
        <table className="min-w-[780px] w-full table-auto">
          <thead className="border-b border-gray-100 bg-gray-50/60">
            <tr>
              <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                #
              </th>
              <th className="px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Player
              </th>
              <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                {isLadderSession ? "Ladder" : "Points"}
              </th>
              <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Diff
              </th>
              <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Matches
              </th>
              <th className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
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
                  } ${player.isPaused ? "opacity-60" : ""
                  }`}
                >
                  <td className="whitespace-nowrap px-3 py-3">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-xl border text-xs font-semibold ${getRankBadgeClass(
                        idx + 1
                      )}`}
                    >
                      {idx + 1}
                    </span>
                  </td>
                  <td className="min-w-[17rem] px-3 py-3 align-top">
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={getPlayerProfileHref(player)}
                          className="text-sm font-semibold text-gray-900 hover:text-blue-600"
                        >
                          {player.user.name}
                        </Link>
                        {isMe ? (
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-medium text-blue-700">
                            Me
                          </span>
                        ) : null}
                        {player.isPaused ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-medium text-amber-800">
                            Paused
                          </span>
                        ) : null}
                        {player.isGuest ? (
                          <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-[10px] font-medium text-gray-700">
                            Guest
                          </span>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                        <span>Rating {player.user.elo}</span>
                        {savingPreferencesFor === player.userId ? (
                          <span className="font-medium text-blue-700">
                            Saving...
                          </span>
                        ) : null}
                      </div>

                      {canToggle || (!isCompleted && isAdmin) ? (
                        <div className="flex flex-wrap gap-2">
                        {canToggle ? (
                          <button
                            type="button"
                            onClick={() => onTogglePause(player.userId, player.isPaused)}
                            className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
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
                            className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-[11px] font-medium text-blue-700 transition"
                          >
                            Edit preferences
                          </button>
                        ) : null}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-center">
                    <span className="text-base font-semibold text-blue-700">
                      {standingValue}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-center">
                    <span
                      className={`text-sm font-medium ${
                        pointDiff >= 0 ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {formatPointDiff(pointDiff)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-center text-sm font-medium text-gray-700">
                    {stats.played}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-center text-sm font-medium text-gray-700">
                    <span className="text-green-600">{stats.wins}</span>
                    <span className="mx-1 text-gray-300">/</span>
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
