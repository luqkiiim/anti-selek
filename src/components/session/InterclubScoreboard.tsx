"use client";

import type { InterclubScoreboard as InterclubScoreboardModel } from "@/app/session/[code]/sessionViewModel";

interface InterclubScoreboardProps {
  scoreboard: InterclubScoreboardModel;
}

function formatDiff(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

export function InterclubScoreboard({ scoreboard }: InterclubScoreboardProps) {
  return (
    <div className="app-panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-5 py-4">
        <div>
          <p className="app-section-eyebrow">Club Scoreboard</p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {scoreboard.resultLabel}
          </p>
        </div>
        <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-500">
          Club vs club
        </span>
      </div>

      <div className="grid divide-y divide-gray-200 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {scoreboard.rows.map((row) => {
          const isLeader = scoreboard.leaderClubId === row.clubId;

          return (
            <div
              key={row.clubId}
              className={`min-w-0 px-5 py-4 ${
                isLeader ? "bg-emerald-50/70" : "bg-white"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-semibold text-gray-900">
                  {row.clubName}
                </p>
                {isLeader ? (
                  <span className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    Ahead
                  </span>
                ) : null}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xl font-bold text-gray-900">
                    {row.rubberWins}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase text-gray-500">
                    Rubbers
                  </p>
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">
                    {row.pointsFor}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase text-gray-500">
                    Points
                  </p>
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">
                    {formatDiff(row.pointDiff)}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase text-gray-500">
                    Diff
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
