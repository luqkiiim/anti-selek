"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Avatar } from "@/components/ui/Avatar";
import { getSessionPoolOptions } from "@/lib/sessionPools";
import { getSessionTypeLabel } from "@/lib/sessionModeLabels";
import type { Player } from "./sessionTypes";
import { SessionPool, SessionType } from "@/types/enums";

interface PlayerStats {
  played: number;
  wins: number;
  losses: number;
}

interface LiveStandingsTableProps {
  sessionType: string;
  players: Player[];
  currentUserId: string;
  pointDiffByUserId: Map<string, number>;
  getPlayerProfileHref: (player: Player) => string;
  calculatePlayerSessionStats: (userId: string) => PlayerStats;
  poolsEnabled: boolean;
  poolAName?: string | null;
  poolBName?: string | null;
  interclubClubToneById?: Record<string, "blue" | "red">;
}

function getStandingValue(
  sessionType: string,
  player: Player,
  stats: PlayerStats,
) {
  if (sessionType === SessionType.LADDER) {
    const ladderScore = stats.wins - stats.losses;
    return ladderScore > 0 ? `+${ladderScore}` : `${ladderScore}`;
  }

  return `${player.sessionPoints}`;
}

function formatPointDiff(pointDiff: number) {
  return pointDiff > 0 ? `+${pointDiff}` : `${pointDiff}`;
}

export function LiveStandingsTable({
  sessionType,
  players,
  currentUserId,
  pointDiffByUserId,
  getPlayerProfileHref,
  calculatePlayerSessionStats,
  poolsEnabled,
  interclubClubToneById,
}: LiveStandingsTableProps) {
  const isLadderSession = sessionType === SessionType.LADDER;
  const [poolFilter, setPoolFilter] = useState<"ALL" | SessionPool>("ALL");
  const poolOptions = getSessionPoolOptions({ poolsEnabled });
  const visiblePlayers = useMemo(
    () =>
      poolsEnabled && poolFilter !== "ALL"
        ? players.filter((player) => player.pool === poolFilter)
        : players,
    [players, poolFilter, poolsEnabled],
  );

  return (
    <div className="play-live-standings">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="app-section-eyebrow">Standings</p>
          {poolsEnabled ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPoolFilter("ALL")}
                aria-pressed={poolFilter === "ALL"}
                className={`min-h-11 rounded-full border px-3 py-1 text-xs font-semibold ${
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
                  aria-pressed={poolFilter === option.value}
                  className={`min-h-11 rounded-full border px-3 py-1 text-xs font-semibold ${
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
        <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-500">
          {getSessionTypeLabel(sessionType)}
        </span>
      </div>

      <div className="play-standings" role="list">
        {visiblePlayers.map((player, idx) => {
          const stats = calculatePlayerSessionStats(player.userId);
          const diff = pointDiffByUserId.get(player.userId) ?? 0;
          const tone = player.representingClubId
            ? interclubClubToneById?.[player.representingClubId]
            : undefined;
          return (
            <div role="listitem" key={player.userId}>
              <Link
                href={getPlayerProfileHref(player)}
                className={`standing-person ${player.userId === currentUserId ? "is-me" : ""}`}
                data-interclub-club-tone={tone}
              >
                <span className="standing-rank">{idx + 1}</span>
                <Avatar
                  name={player.user.name}
                  avatarUrl={player.user.avatarUrl}
                  size="sm"
                />
                <div>
                  <strong>
                    {player.user.name}
                    {player.userId === currentUserId ? (
                      <small> · You</small>
                    ) : null}
                  </strong>
                  <small>
                    {stats.wins}W / {stats.losses}L · {stats.played} games ·{" "}
                    {formatPointDiff(diff)} diff
                  </small>
                </div>
                <b>
                  {getStandingValue(sessionType, player, stats)}
                  <small>{isLadderSession ? "score" : "pts"}</small>
                </b>
              </Link>
            </div>
          );
        })}
      </div>

      {visiblePlayers.length === 0 ? (
        <div className="border-t border-gray-100 px-5 py-6 text-sm text-gray-500">
          No players in this group yet.
        </div>
      ) : null}
      <details className="border-t border-gray-100 px-4 py-1 text-sm text-gray-600">
        <summary className="min-h-11 cursor-pointer py-3 font-medium text-gray-500">
          How rankings work
        </summary>
        <div className="space-y-2 pb-2 leading-6">
          <p>
            {isLadderSession
              ? "Ladder score = wins minus losses. A win adds 1; a loss subtracts 1."
              : "Each player earns 3 points for a win and 0 for a loss. These are tournament points, not the rally score."}
          </p>
          <p>
            Players are ranked by{" "}
            {isLadderSession ? "ladder score" : "tournament points"}, then point
            difference (points scored minus points conceded). Exact ties are
            listed alphabetically by name.
          </p>
          <p>
            MP = matches played. W/L = wins/losses. Df = point difference. Only
            completed results count.
          </p>
        </div>
      </details>
    </div>
  );
}
