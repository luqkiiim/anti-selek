"use client";

import { SessionType } from "@/types/enums";

interface PodiumPlayer {
  userId: string;
  sessionPoints: number;
  isGuest: boolean;
  user: {
    name: string;
  };
}

interface SessionPodiumProps {
  sessionType: string;
  players: PodiumPlayer[];
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

const RANK_STYLES: Record<
  number,
  { block: string; rank: string; height: string }
> = {
  1: {
    block: "border-amber-200 bg-[linear-gradient(180deg,rgba(255,247,214,0.98),rgba(255,236,179,0.94))]",
    rank: "bg-amber-100 text-amber-700 border-amber-300",
    height: "h-40 sm:h-44",
  },
  2: {
    block: "border-slate-200 bg-[linear-gradient(180deg,rgba(241,245,249,0.98),rgba(226,232,240,0.96))]",
    rank: "bg-slate-100 text-slate-700 border-slate-300",
    height: "h-32 sm:h-36",
  },
  3: {
    block: "border-orange-200 bg-[linear-gradient(180deg,rgba(255,237,213,0.98),rgba(254,215,170,0.94))]",
    rank: "bg-orange-100 text-orange-700 border-orange-300",
    height: "h-24 sm:h-28",
  },
};

export function SessionPodium({
  sessionType,
  players,
  pointDiffByUserId,
  playerStatsByUserId,
}: SessionPodiumProps) {
  const topThree = players.slice(0, 3);
  const isLadderSession = sessionType === SessionType.LADDER;
  const isRaceSession = sessionType === SessionType.RACE;

  if (topThree.length === 0) {
    return null;
  }

  const orderedPlayers =
    topThree.length === 3
      ? [topThree[1], topThree[0], topThree[2]]
      : topThree.length === 2
        ? [topThree[1], topThree[0]]
        : topThree;

  return (
    <section className="app-panel px-4 pb-4 pt-6 sm:px-6 sm:pb-5">
      <div
        className="grid items-end gap-3"
        style={{ gridTemplateColumns: `repeat(${orderedPlayers.length}, minmax(0, 1fr))` }}
      >
        {orderedPlayers.map((player) => {
          const rank = players.findIndex((entry) => entry.userId === player.userId) + 1;
          const pointDiff = pointDiffByUserId.get(player.userId) ?? 0;
          const stats = playerStatsByUserId.get(player.userId) ?? {
            played: 0,
            wins: 0,
            losses: 0,
          };
          const styles = RANK_STYLES[rank] ?? RANK_STYLES[3];

          return (
            <article key={player.userId} className="flex flex-col items-center justify-end text-center">
              <div className="mb-3 min-h-[3.75rem] space-y-1">
                <p className="text-xl font-semibold leading-tight text-gray-900 sm:text-2xl md:text-3xl">
                  {player.user.name}
                </p>
                {player.isGuest ? (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    Guest
                  </p>
                ) : null}
              </div>

              <div
                className={`flex w-full flex-col items-center justify-center rounded-t-[1.75rem] border border-b-0 px-3 pb-4 pt-3 shadow-sm sm:px-4 ${styles.block} ${styles.height}`}
              >
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-black ${styles.rank}`}
                >
                  {rank}
                </span>

                <div className="mt-3 space-y-1">
                  <p className="text-2xl font-semibold leading-none text-gray-900 sm:text-3xl">
                    {isLadderSession
                      ? `${stats.wins}-${stats.losses}`
                      : isRaceSession
                        ? stats.wins * 3
                      : player.sessionPoints}
                  </p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    {isLadderSession ? "Record" : "Points"}
                  </p>
                </div>

                <p
                  className={`mt-3 text-xs font-semibold ${
                    pointDiff >= 0 ? "text-green-700" : "text-red-600"
                  }`}
                >
                  {pointDiff > 0 ? `+${pointDiff}` : pointDiff} diff
                </p>
              </div>

              <div className="h-2 w-full rounded-b-2xl bg-gray-200/70" />
            </article>
          );
        })}
      </div>
    </section>
  );
}
