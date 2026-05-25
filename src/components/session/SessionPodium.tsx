"use client";

import { Sparkles } from "lucide-react";
import type { CSSProperties } from "react";

import type { Player } from "@/components/session/sessionTypes";
import { Avatar } from "@/components/ui/Avatar";
import { SessionType } from "@/types/enums";

interface SessionPodiumProps {
  sessionType: string;
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
  celebrationRunId?: number;
  onReplayCelebration?: () => void;
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

const EMPTY_PLAYER_STATS = {
  played: 0,
  wins: 0,
  losses: 0,
};

function getRevealDelayMs(rank: number, podiumSize: number) {
  if (rank === 3 || podiumSize === 1) return 0;
  if (rank === 2) return podiumSize === 2 ? 0 : 500;
  return podiumSize === 2 ? 500 : 1000;
}

export function SessionPodium({
  sessionType,
  players,
  pointDiffByUserId,
  playerStatsByUserId,
  celebrationRunId = 0,
  onReplayCelebration,
}: SessionPodiumProps) {
  const topThree = players.slice(0, 3);
  const isLadderSession = sessionType === SessionType.LADDER;
  const isRaceSession = sessionType === SessionType.RACE;
  const isCelebrating = celebrationRunId > 0;

  if (topThree.length === 0) {
    return null;
  }

  const orderedPlayers =
    topThree.length === 3
      ? [topThree[1], topThree[0], topThree[2]]
      : topThree.length === 2
        ? [topThree[1], topThree[0]]
        : topThree;
  const championRevealDelayMs = getRevealDelayMs(1, topThree.length);

  return (
    <section className="app-panel app-podium-burst-panel relative overflow-hidden px-4 pb-4 pt-6 sm:px-6 sm:pb-5">
      {isCelebrating ? (
        <div
          key={`podium-burst-${celebrationRunId}`}
          className="app-podium-burst-particles"
          aria-hidden="true"
          data-testid="podium-burst-particles"
          style={
            {
              "--podium-finale-delay": `${championRevealDelayMs + 260}ms`,
            } as CSSProperties
          }
        >
          <span className="app-podium-burst-shuttle app-podium-burst-particle" />
          <span className="app-podium-burst-shuttle app-podium-burst-shuttle-two" />
          <span className="app-podium-burst-ribbon app-podium-burst-ribbon-one" />
          <span className="app-podium-burst-ribbon app-podium-burst-ribbon-two" />
          <span className="app-podium-burst-ribbon app-podium-burst-ribbon-three" />
          <span className="app-podium-burst-ribbon app-podium-burst-ribbon-four" />
          <span className="app-podium-burst-spark app-podium-burst-spark-one" />
          <span className="app-podium-burst-spark app-podium-burst-spark-two" />
          <span className="app-podium-burst-spark app-podium-burst-spark-three" />
          <span className="app-podium-burst-spark app-podium-burst-spark-four" />
        </div>
      ) : null}

      <div className="relative z-[1] mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="app-eyebrow">Final podium</p>
          <h2 className="mt-1 text-2xl font-semibold leading-tight text-gray-900 sm:text-3xl">
            Winners circle
          </h2>
        </div>
        {onReplayCelebration ? (
          <button
            type="button"
            onClick={onReplayCelebration}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-200/80 bg-white/80 text-amber-700 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2"
            aria-label="Replay winner celebration"
            title="Replay winner celebration"
          >
            <Sparkles aria-hidden="true" size={17} strokeWidth={2.4} />
          </button>
        ) : null}
      </div>

      <div
        className="relative z-[1] grid items-end gap-3"
        style={{ gridTemplateColumns: `repeat(${orderedPlayers.length}, minmax(0, 1fr))` }}
      >
        {orderedPlayers.map((player) => {
          const rank = players.findIndex((entry) => entry.userId === player.userId) + 1;
          const pointDiff = pointDiffByUserId.get(player.userId) ?? 0;
          const stats = playerStatsByUserId.get(player.userId) ?? EMPTY_PLAYER_STATS;
          const styles = RANK_STYLES[rank] ?? RANK_STYLES[3];
          const revealDelayMs = getRevealDelayMs(rank, topThree.length);

          return (
            <article
              key={`${player.userId}-${celebrationRunId}`}
              className={`flex flex-col items-center justify-end text-center ${
                isCelebrating ? "app-podium-burst-entrant" : ""
              } ${isCelebrating && rank === 1 ? "app-podium-burst-champion" : ""}`}
              style={
                isCelebrating
                  ? ({
                      "--podium-reveal-delay": `${revealDelayMs}ms`,
                    } as CSSProperties)
                  : undefined
              }
            >
              <div className="mb-3 flex min-h-[4.5rem] flex-col justify-end space-y-1 sm:min-h-[5rem]">
                <p className="text-xl font-semibold leading-tight text-gray-900 sm:text-2xl md:text-3xl">
                  {player.user.name}
                </p>
                {player.isGuest ? (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
                    Guest
                  </p>
                ) : null}
              </div>

              <div className="mb-3 flex min-h-[5.5rem] items-end justify-center sm:min-h-[6rem]">
                <Avatar
                  name={player.user.name}
                  avatarUrl={player.user.avatarUrl}
                  size="xl"
                  className="ring-4 ring-white shadow-[0_14px_30px_rgba(15,23,42,0.18)]"
                  imageLoading="eager"
                  imageFetchPriority="high"
                />
              </div>

              <div
                className={`flex w-full flex-col items-center justify-center rounded-t-[1.75rem] border border-b-0 px-3 pb-4 pt-3 shadow-sm sm:px-4 ${styles.block} ${styles.height}`}
              >
                {rank === 1 ? (
                  <span
                    className="app-podium-burst-crown mb-2"
                    aria-hidden="true"
                  />
                ) : null}
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
