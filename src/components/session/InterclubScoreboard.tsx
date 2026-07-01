"use client";

import type {
  InterclubScoreboard as InterclubScoreboardModel,
  InterclubScoreboardRow,
} from "@/app/session/[code]/sessionViewModel";

interface InterclubScoreboardProps {
  scoreboard: InterclubScoreboardModel;
}

type ClubTone = "blue" | "red";

const CLUB_TONE_CLASSES: Record<
  ClubTone,
  {
    panel: string;
    mark: string;
    score: string;
  }
> = {
  blue: {
    panel: "border-sky-200 bg-sky-50/90",
    mark: "border-sky-200 bg-sky-600 text-white",
    score: "text-sky-700",
  },
  red: {
    panel: "border-rose-200 bg-rose-50/90",
    mark: "border-rose-200 bg-rose-600 text-white",
    score: "text-rose-700",
  },
};

function formatDiff(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function getClubInitials(name: string) {
  const words = name.trim().split(/[\s-]+/).filter(Boolean);

  if (words.length === 0) {
    return "CL";
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}

function getPointDiffClass(value: number) {
  if (value > 0) {
    return "text-green-600";
  }

  if (value < 0) {
    return "text-red-500";
  }

  return "text-gray-900";
}

function ClubPanel({
  row,
  tone,
}: {
  row: InterclubScoreboardRow;
  tone: ClubTone;
}) {
  const toneClasses = CLUB_TONE_CLASSES[tone];

  return (
    <section
      className={`flex min-w-0 flex-col items-center rounded-2xl border px-3 py-3 text-center sm:px-4 ${toneClasses.panel}`}
      aria-label={`${row.clubName} club stats`}
    >
      <div
        className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border text-lg font-black tracking-normal ${toneClasses.mark}`}
      >
        {row.avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={row.avatarUrl}
            alt={`${row.clubName} logo`}
            className="h-full w-full object-cover"
          />
        ) : (
          <span>{getClubInitials(row.clubName)}</span>
        )}
      </div>

      <h2 className="mt-3 min-w-0 max-w-full overflow-hidden text-ellipsis text-sm font-bold leading-tight text-gray-900 sm:text-base">
        {row.clubName}
      </h2>

      <dl className="mt-4 grid w-full gap-2">
        <div className="flex min-h-6 items-baseline justify-between gap-3">
          <dt className="text-left text-xs font-semibold text-gray-500">
            Match wins
          </dt>
          <dd className="text-base font-black tabular-nums text-gray-900">
            {row.matchWins}
          </dd>
        </div>
        <div className="flex min-h-6 items-baseline justify-between gap-3">
          <dt className="text-left text-xs font-semibold text-gray-500">
            Points
          </dt>
          <dd className="text-base font-black tabular-nums text-gray-900">
            {row.pointsFor}
          </dd>
        </div>
        <div className="flex min-h-6 items-baseline justify-between gap-3">
          <dt className="text-left text-xs font-semibold text-gray-500">
            Point diff
          </dt>
          <dd
            className={`text-base font-black tabular-nums ${getPointDiffClass(
              row.pointDiff
            )}`}
          >
            {formatDiff(row.pointDiff)}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function getScoreToneClass({
  row,
  tone,
  leaderClubId,
}: {
  row: InterclubScoreboardRow;
  tone: ClubTone;
  leaderClubId: string | null;
}) {
  if (!leaderClubId) {
    return "text-gray-900";
  }

  return leaderClubId === row.clubId
    ? CLUB_TONE_CLASSES[tone].score
    : "text-gray-500";
}

export function InterclubScoreboard({ scoreboard }: InterclubScoreboardProps) {
  const [leftClub, rightClub] = scoreboard.rows;

  return (
    <section className="app-panel overflow-hidden px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-black leading-tight tracking-normal text-gray-900 sm:text-3xl">
          Club vs Club standings
        </h2>
        <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1.5 text-sm font-bold text-teal-900">
          <span
            className="h-2 w-2 rounded-full bg-teal-500 shadow-[0_0_0_4px_rgba(20,184,166,0.16)]"
            aria-hidden="true"
          />
          {scoreboard.statusLabel}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_3.5rem_minmax(0,1fr)] items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_minmax(0,1fr)] sm:gap-3">
        <ClubPanel row={leftClub} tone="blue" />

        <div
          className="flex items-center justify-center gap-1.5 text-2xl font-black tracking-normal sm:text-4xl"
          aria-label={scoreboard.resultLabel}
        >
          <span
            className={getScoreToneClass({
              row: leftClub,
              tone: "blue",
              leaderClubId: scoreboard.leaderClubId,
            })}
          >
            {leftClub.matchWins}
          </span>
          <span className="text-gray-400">-</span>
          <span
            className={getScoreToneClass({
              row: rightClub,
              tone: "red",
              leaderClubId: scoreboard.leaderClubId,
            })}
          >
            {rightClub.matchWins}
          </span>
        </div>

        <ClubPanel row={rightClub} tone="red" />
      </div>
    </section>
  );
}
