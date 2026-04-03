"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getSessionPoolOptions } from "@/lib/sessionPools";
import type { Player } from "./sessionTypes";
import { SessionPool, SessionType } from "@/types/enums";

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
  pointDiffByUserId: Map<string, number>;
  getPlayerProfileHref: (player: Player) => string;
  calculatePlayerSessionStats: (userId: string) => PlayerStats;
  poolsEnabled: boolean;
  poolAName?: string | null;
  poolBName?: string | null;
}

function getStandingValue(
  sessionType: string,
  player: Player,
  stats: PlayerStats
) {
  if (sessionType === SessionType.LADDER) {
    const ladderScore = stats.wins - stats.losses;
    return ladderScore > 0 ? `+${ladderScore}` : `${ladderScore}`;
  }

  if (sessionType === SessionType.RACE) {
    return `${stats.wins * 3}`;
  }

  return `${player.sessionPoints}`;
}

function formatPointDiff(pointDiff: number) {
  return pointDiff > 0 ? `+${pointDiff}` : `${pointDiff}`;
}

function getStandingBadgeClass(sessionType: string) {
  if (sessionType === SessionType.LADDER) {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (sessionType === SessionType.RACE) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (sessionType === SessionType.ELO) {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }

  return "border-blue-200 bg-blue-50 text-blue-700";
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
  pointDiffByUserId,
  getPlayerProfileHref,
  calculatePlayerSessionStats,
  poolsEnabled,
  poolAName,
  poolBName,
}: LiveStandingsTableProps) {
  const isLadderSession = sessionType === SessionType.LADDER;
  const isRaceSession = sessionType === SessionType.RACE;
  const [poolFilter, setPoolFilter] = useState<"ALL" | SessionPool>("ALL");
  const poolOptions = getSessionPoolOptions({
    poolsEnabled,
    poolAName,
    poolBName,
  });
  const visiblePlayers = useMemo(
    () =>
      poolsEnabled && poolFilter !== "ALL"
        ? players.filter((player) => player.pool === poolFilter)
        : players,
    [players, poolFilter, poolsEnabled]
  );

  return (
    <div className="app-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="app-section-eyebrow">Standings</p>
          {poolsEnabled ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPoolFilter("ALL")}
                className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                  poolFilter === "ALL"
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-500"
                }`}
              >
                All
              </button>
              {poolOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPoolFilter(option.value)}
                  className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                    poolFilter === option.value
                      ? "border-blue-200 bg-blue-50 text-blue-700"
                      : "border-gray-200 bg-white text-gray-500"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500 sm:text-[11px]">
          {isLadderSession
            ? "Ladder"
            : isRaceSession
              ? "Race"
              : sessionType === SessionType.ELO
                ? "Ratings"
                : "Points"}
        </span>
      </div>

      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full table-fixed border-separate border-spacing-y-[3px] px-2">
          <thead>
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
          <tbody>
            {visiblePlayers.map((player, idx) => {
              const stats = calculatePlayerSessionStats(player.userId);
              const isMe = player.userId === currentUserId;
              const pointDiff = pointDiffByUserId.get(player.userId) ?? 0;
              const standingValue = getStandingValue(sessionType, player, stats);
              const poolLabel =
                player.pool === SessionPool.A ? poolAName ?? "Open" : poolBName ?? "Regular";

              return (
                <tr
                  key={player.userId}
                  className={`transition-colors ${
                    isMe ? "text-blue-950" : "text-gray-900"
                  } ${player.isPaused ? "opacity-60" : ""}`}
                >
                  <td className="whitespace-nowrap rounded-l-2xl border-y border-l border-gray-100 bg-white px-2 py-2 align-middle sm:px-3">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-lg border text-[10px] font-semibold sm:h-6 sm:w-6 sm:text-[11px] ${getRankBadgeClass(
                        idx + 1
                      )}`}
                    >
                      {idx + 1}
                    </span>
                  </td>
                  <td className="border-y border-gray-100 bg-white px-2 py-2 align-middle sm:px-3">
                    <div className="space-y-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5 leading-tight sm:gap-2">
                        <Link
                          href={getPlayerProfileHref(player)}
                          title={player.user.name}
                          className="min-w-0 max-w-full truncate text-[13px] font-bold leading-tight text-gray-900 hover:text-blue-600 sm:text-sm"
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
                        {poolsEnabled ? (
                          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide text-indigo-700 sm:px-2 sm:text-[9px]">
                            {poolLabel}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="whitespace-nowrap border-y border-gray-100 bg-white px-1.5 py-2 text-center align-middle sm:w-[5.25rem] sm:px-4">
                    <span
                      className={`inline-flex min-w-[2.85rem] items-center justify-center rounded-full border px-2.5 py-1 text-[12px] font-semibold tabular-nums sm:min-w-[3.2rem] sm:text-sm ${getStandingBadgeClass(
                        sessionType
                      )}`}
                    >
                      {standingValue}
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-y border-gray-100 bg-white px-1.5 py-2 text-center align-middle sm:w-[4.75rem] sm:px-4">
                    <span
                      className={`text-[12px] font-medium tabular-nums sm:text-sm ${
                        pointDiff >= 0 ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {formatPointDiff(pointDiff)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-y border-gray-100 bg-white px-1.5 py-2 text-center align-middle text-[12px] font-medium tabular-nums text-gray-700 sm:w-[4.5rem] sm:px-4 sm:text-sm">
                    {stats.played}
                  </td>
                  <td className="whitespace-nowrap rounded-r-2xl border-y border-r border-gray-100 bg-white px-1.5 py-2 text-center align-middle text-[12px] font-medium tabular-nums text-gray-700 sm:w-[5rem] sm:px-4 sm:text-sm">
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

      {visiblePlayers.length === 0 ? (
        <div className="border-t border-gray-100 px-5 py-6 text-sm text-gray-500">
          No players in this pool yet.
        </div>
      ) : null}
    </div>
  );
}
