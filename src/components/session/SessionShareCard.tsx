"use client";

import { Avatar } from "@/components/ui/Avatar";
import { SessionType } from "@/types/enums";
import type { Player } from "./sessionTypes";

interface SessionShareCardProps {
  sessionName: string;
  communityName: string;
  sessionType: string;
  sessionTypeLabel: string;
  players: Player[];
  pointDiffByUserId: Map<string, number>;
  playerStatsByUserId: Map<
    string,
    {
      played: number;
      wins: number;
      losses: number;
    }
  >;
}

const EMPTY_PLAYER_STATS = {
  played: 0,
  wins: 0,
  losses: 0,
};

const PODIUM_STYLES: Record<number, { shell: string; rank: string }> = {
  1: {
    shell:
      "border-amber-200 bg-[linear-gradient(180deg,rgba(255,247,214,0.98),rgba(255,236,179,0.94))]",
    rank: "border-amber-300 bg-amber-100 text-amber-700",
  },
  2: {
    shell:
      "border-slate-200 bg-[linear-gradient(180deg,rgba(241,245,249,0.98),rgba(226,232,240,0.96))]",
    rank: "border-slate-300 bg-slate-100 text-slate-700",
  },
  3: {
    shell:
      "border-orange-200 bg-[linear-gradient(180deg,rgba(255,237,213,0.98),rgba(254,215,170,0.94))]",
    rank: "border-orange-300 bg-orange-100 text-orange-700",
  },
};

function formatPointDiff(pointDiff: number) {
  return pointDiff > 0 ? `+${pointDiff}` : `${pointDiff}`;
}

function getStandingValue(
  sessionType: string,
  player: Player,
  stats: { wins: number; losses: number }
) {
  if (sessionType === SessionType.LADDER) {
    return `${stats.wins}-${stats.losses}`;
  }

  if (sessionType === SessionType.RACE) {
    return `${stats.wins * 3}`;
  }

  return `${player.sessionPoints}`;
}

export function SessionShareCard({
  sessionName,
  communityName,
  sessionType,
  sessionTypeLabel,
  players,
  pointDiffByUserId,
  playerStatsByUserId,
}: SessionShareCardProps) {
  const topThree = players.slice(0, 3);
  const standingsRows = players.slice(3, 10);
  const orderedPodium =
    topThree.length === 3
      ? [topThree[1], topThree[0], topThree[2]]
      : topThree.length === 2
        ? [topThree[1], topThree[0]]
        : topThree;
  const isLadderSession = sessionType === SessionType.LADDER;

  return (
    <section className="flex h-[960px] w-[540px] flex-col overflow-hidden rounded-[40px] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#eef5ff_40%,#ffffff_100%)] p-8 text-slate-950 shadow-[0_30px_90px_rgba(15,23,42,0.16)]">
      <div className="rounded-[28px] border border-white/80 bg-white/70 px-6 py-5 shadow-sm backdrop-blur">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-700">
          Final standings
        </p>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="line-clamp-2 text-[38px] font-black leading-[1.02] tracking-tight text-slate-950">
              {sessionName}
            </h2>
            <p className="mt-2 truncate text-lg font-semibold text-slate-600">
              {communityName}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-sky-700">
            {sessionTypeLabel}
          </span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 items-end gap-4">
        {orderedPodium.map((player) => {
          const rank = players.findIndex((entry) => entry.userId === player.userId) + 1;
          const styles = PODIUM_STYLES[rank] ?? PODIUM_STYLES[3];
          const stats = playerStatsByUserId.get(player.userId) ?? EMPTY_PLAYER_STATS;
          const pointDiff = pointDiffByUserId.get(player.userId) ?? 0;

          return (
            <article
              key={player.userId}
              className="flex min-w-0 flex-col items-center text-center"
            >
              <p className="mb-3 w-full truncate px-1 text-[24px] font-black leading-tight text-slate-950">
                {player.user.name}
              </p>
              <Avatar
                name={player.user.name}
                avatarUrl={player.user.avatarUrl}
                size="lg"
                className="ring-4 ring-white shadow-[0_16px_35px_rgba(15,23,42,0.14)]"
                imageLoading="eager"
                imageFetchPriority="high"
              />
              <div
                className={`mt-4 flex h-[212px] w-full flex-col items-center rounded-t-[32px] border border-b-0 px-4 pb-5 pt-4 ${styles.shell}`}
              >
                <span
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-full border text-xl font-black ${styles.rank}`}
                >
                  {rank}
                </span>
                <p className="mt-5 text-[50px] font-black leading-none tabular-nums text-slate-950">
                  {getStandingValue(sessionType, player, stats)}
                </p>
                <p className="mt-2 text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                  {isLadderSession ? "Record" : "Points"}
                </p>
                <p
                  className={`mt-5 text-[24px] font-black leading-none ${
                    pointDiff >= 0 ? "text-emerald-700" : "text-rose-600"
                  }`}
                >
                  {formatPointDiff(pointDiff)}
                  <span className="ml-1 text-[15px] font-bold tracking-normal">
                    diff
                  </span>
                </p>
              </div>
              <div className="h-3 w-full rounded-b-[28px] bg-slate-200/80" />
            </article>
          );
        })}
      </div>

      <div className="mt-6 flex min-h-0 flex-1 flex-col rounded-[28px] border border-slate-200 bg-white/88 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">
            Positions 4-10
          </p>
          <p className="text-sm font-semibold text-slate-500">
            Top 10 snapshot
          </p>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-2">
          {standingsRows.map((player, index) => {
            const rank = index + 4;
            const stats = playerStatsByUserId.get(player.userId) ?? EMPTY_PLAYER_STATS;
            const pointDiff = pointDiffByUserId.get(player.userId) ?? 0;

            return (
              <div
                key={player.userId}
                className="grid grid-cols-[46px_minmax(0,1fr)_86px_74px] items-center gap-3 rounded-[22px] border border-slate-100 bg-slate-50/85 px-4 py-3"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-black text-slate-500">
                  {rank}
                </span>

                <div className="flex min-w-0 items-center gap-3">
                  <Avatar
                    name={player.user.name}
                    avatarUrl={player.user.avatarUrl}
                    size="sm"
                    imageLoading="eager"
                  />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <p className="truncate text-base font-black text-slate-950">
                        {player.user.name}
                      </p>
                      {player.isGuest ? (
                        <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          Guest
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">
                      {stats.wins}W / {stats.losses}L - {stats.played} played
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-[22px] font-black leading-none tabular-nums text-slate-950">
                    {getStandingValue(sessionType, player, stats)}
                  </p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    {isLadderSession ? "Record" : "Points"}
                  </p>
                </div>

                <p
                  className={`text-right text-[20px] font-black leading-none tabular-nums ${
                    pointDiff >= 0 ? "text-emerald-700" : "text-rose-600"
                  }`}
                >
                  {formatPointDiff(pointDiff)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
