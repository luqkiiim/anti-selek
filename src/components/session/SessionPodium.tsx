"use client";

interface PodiumPlayer {
  userId: string;
  sessionPoints: number;
  isGuest: boolean;
  user: {
    name: string;
  };
}

interface SessionPodiumProps {
  players: PodiumPlayer[];
  pointDiffByUserId: Map<string, number>;
}

const RANK_STYLES: Record<number, { card: string; rank: string; height: string }> = {
  1: {
    card: "border-amber-200 bg-[linear-gradient(180deg,rgba(255,247,214,0.96),rgba(255,255,255,0.98))]",
    rank: "bg-amber-100 text-amber-700 border-amber-300",
    height: "min-h-[12rem]",
  },
  2: {
    card: "border-slate-200 bg-[linear-gradient(180deg,rgba(241,245,249,0.98),rgba(255,255,255,0.98))]",
    rank: "bg-slate-100 text-slate-700 border-slate-300",
    height: "min-h-[10.5rem]",
  },
  3: {
    card: "border-orange-200 bg-[linear-gradient(180deg,rgba(255,237,213,0.96),rgba(255,255,255,0.98))]",
    rank: "bg-orange-100 text-orange-700 border-orange-300",
    height: "min-h-[9.5rem]",
  },
};

export function SessionPodium({ players, pointDiffByUserId }: SessionPodiumProps) {
  const topThree = players.slice(0, 3);

  if (topThree.length === 0) {
    return null;
  }

  const orderedPlayers =
    topThree.length === 3 ? [topThree[1], topThree[0], topThree[2]] : topThree;

  return (
    <section className="app-panel p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <p className="app-eyebrow">Final results</p>
          <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Top 3 podium</h2>
        </div>
        <span className="app-chip app-chip-neutral">{topThree.length} finishers shown</span>
      </div>

      <div
        className="grid items-end gap-3"
        style={{ gridTemplateColumns: `repeat(${orderedPlayers.length}, minmax(0, 1fr))` }}
      >
        {orderedPlayers.map((player) => {
          const rank = players.findIndex((entry) => entry.userId === player.userId) + 1;
          const pointDiff = pointDiffByUserId.get(player.userId) ?? 0;
          const styles = RANK_STYLES[rank] ?? RANK_STYLES[3];

          return (
            <article
              key={player.userId}
              className={`flex h-full flex-col justify-between rounded-3xl border px-3 py-4 text-center shadow-sm sm:px-4 ${styles.card} ${styles.height}`}
            >
              <div className="flex justify-center">
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-sm font-black ${styles.rank}`}
                >
                  {rank}
                </span>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-900 sm:text-base">{player.user.name}</p>
                {player.isGuest ? (
                  <span className="app-chip app-chip-neutral">Guest</span>
                ) : null}
              </div>

              <div className="space-y-1">
                <p className="text-2xl font-semibold text-gray-900 sm:text-3xl">
                  {player.sessionPoints}
                </p>
                <p
                  className={`text-xs font-semibold ${
                    pointDiff >= 0 ? "text-green-700" : "text-red-600"
                  }`}
                >
                  {pointDiff > 0 ? `+${pointDiff}` : pointDiff} point diff
                </p>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
