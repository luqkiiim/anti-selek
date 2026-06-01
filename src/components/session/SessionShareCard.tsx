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
  preparedAvatarUrlsByUserId: Map<string, string>;
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

const PODIUM_STYLES: Record<
  number,
  { shell: string; rank: string; height: string }
> = {
  1: {
    shell:
      "border-amber-200 bg-[linear-gradient(180deg,rgba(255,247,214,0.98),rgba(255,236,179,0.94))]",
    rank: "border-amber-300 bg-amber-100 text-amber-700",
    height: "h-[182px]",
  },
  2: {
    shell:
      "border-slate-200 bg-[linear-gradient(180deg,rgba(241,245,249,0.98),rgba(226,232,240,0.96))]",
    rank: "border-slate-300 bg-slate-100 text-slate-700",
    height: "h-[170px]",
  },
  3: {
    shell:
      "border-orange-200 bg-[linear-gradient(180deg,rgba(255,237,213,0.98),rgba(254,215,170,0.94))]",
    rank: "border-orange-300 bg-orange-100 text-orange-700",
    height: "h-[164px]",
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
  preparedAvatarUrlsByUserId,
  pointDiffByUserId,
  playerStatsByUserId,
}: SessionShareCardProps) {
  const topThree = players.slice(0, 3);
  const standingsRows = players.slice(3, 11);
  const orderedPodium =
    topThree.length === 3
      ? [topThree[1], topThree[0], topThree[2]]
      : topThree.length === 2
        ? [topThree[1], topThree[0]]
        : topThree;
  const isLadderSession = sessionType === SessionType.LADDER;

  return (
    <section className="flex h-[960px] w-[540px] flex-col overflow-hidden rounded-[40px] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#edf4ff_42%,#ffffff_100%)] p-7 text-slate-950">
      <div className="rounded-[26px] border border-slate-100 bg-white px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-sky-700">
              Final standings
            </p>
            <h2 className="mt-3 line-clamp-2 text-[34px] font-black leading-[0.98] tracking-tight text-slate-950">
              {sessionName}
            </h2>
            <p className="mt-2 truncate text-[18px] font-semibold text-slate-500">
              {communityName}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-sky-700">
            {sessionTypeLabel}
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 items-end gap-4">
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
              <p className="mb-2 w-full truncate px-1 text-[22px] font-black leading-tight text-slate-950">
                {player.user.name}
              </p>
              <Avatar
                name={player.user.name}
                avatarUrl={preparedAvatarUrlsByUserId.get(player.userId)}
                size="md"
                appearance="court"
                className="border-2 border-white shadow-none"
                imageLoading="eager"
                imageFetchPriority="high"
              />
              <div
                className={`mt-3 flex w-full flex-col items-center rounded-t-[28px] border border-b-0 px-4 pb-4 pt-3 ${styles.shell} ${styles.height}`}
              >
                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full border text-lg font-black ${styles.rank}`}
                >
                  {rank}
                </span>
                <p className="mt-3 text-[32px] font-black leading-none tabular-nums text-slate-950">
                  {getStandingValue(sessionType, player, stats)}
                </p>
                <p className="mt-1.5 text-[9px] font-black uppercase tracking-[0.2em] text-slate-500">
                  {isLadderSession ? "Record" : "Points"}
                </p>
                <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">
                  {stats.wins}W / {stats.losses}L
                </p>
                <p
                  className={`mt-2 text-[18px] font-black leading-none ${
                    pointDiff >= 0 ? "text-emerald-700" : "text-rose-600"
                  }`}
                >
                  {formatPointDiff(pointDiff)}
                  <span className="ml-1 text-[12px] font-bold">diff</span>
                </p>
              </div>
              <div className="h-3 w-full rounded-b-[24px] bg-slate-200/75" />
            </article>
          );
        })}
      </div>

      <div className="mt-5 flex min-h-0 flex-1 flex-col rounded-[26px] border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">
            Positions 4-11
          </p>
          <p className="text-sm font-semibold text-slate-500">Top 11 snapshot</p>
        </div>

        <div className="mt-4 grid min-h-0 flex-1 grid-cols-2 gap-3">
          {standingsRows.map((player, index) => {
            const rank = index + 4;
            const stats = playerStatsByUserId.get(player.userId) ?? EMPTY_PLAYER_STATS;
            const pointDiff = pointDiffByUserId.get(player.userId) ?? 0;

            return (
              <div
                key={player.userId}
                className="grid grid-cols-[34px_1fr_auto] items-center gap-3 rounded-[20px] border border-slate-100 bg-slate-50/90 px-3 py-3"
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-[13px] font-black text-slate-500">
                  {rank}
                </span>

                <div className="flex min-w-0 items-center gap-2">
                  <Avatar
                    name={player.user.name}
                    avatarUrl={preparedAvatarUrlsByUserId.get(player.userId)}
                    size="xs"
                    appearance="court"
                    className="shadow-none"
                    imageLoading="eager"
                  />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate text-[14px] font-black leading-tight text-slate-950">
                        {player.user.name}
                      </p>
                      {player.isGuest ? (
                        <span className="shrink-0 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-slate-500">
                          Guest
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-[10px] font-semibold leading-tight text-slate-500">
                      {stats.wins}W / {stats.losses}L
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-[18px] font-black leading-none tabular-nums text-slate-950">
                    {getStandingValue(sessionType, player, stats)}
                  </p>
                  <p
                    className={`mt-1 text-[12px] font-black leading-none tabular-nums ${
                      pointDiff >= 0 ? "text-emerald-700" : "text-rose-600"
                    }`}
                  >
                    {formatPointDiff(pointDiff)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
