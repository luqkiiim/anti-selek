"use client";

import Link from "next/link";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Award,
  BarChart3,
  CalendarDays,
  ChevronRight,
  Flame,
  Medal,
  Shield,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarUploader } from "@/components/ui/AvatarUploader";
import type {
  PlayerProfileConnectionSummary,
  PlayerProfileMatchHistoryEntry,
  PlayerProfileRecentFormSummary,
  PlayerProfileSessionSummary,
  PlayerProfileStatsSummary,
  PlayerProfileTrendSummary,
} from "@/lib/profileStats";
import { deleteUserAvatar, uploadUserAvatar } from "@/lib/avatarClient";
import { EmptyState, FlashMessage } from "@/components/ui/chrome";

interface UserProfileResponse {
  user: {
    id: string;
    name: string;
    avatarUrl: string | null;
    elo: number;
    createdAt: string;
  };
  context?: {
    communityId: string;
    viewerCanManageCommunity: boolean;
    rankContext: {
      leaderboardSize: number;
      currentRank: number | null;
      previousRank: number | null;
      rankDelta: number | null;
    };
  } | null;
  stats: PlayerProfileStatsSummary;
  recentForm: PlayerProfileRecentFormSummary;
  recentSessions: PlayerProfileSessionSummary[];
  trend: PlayerProfileTrendSummary;
  partners: {
    best: PlayerProfileConnectionSummary[];
  };
  opponents: {
    toughest: PlayerProfileConnectionSummary[];
  };
  sessions: {
    latest: PlayerProfileSessionSummary | null;
    best: PlayerProfileSessionSummary | null;
  };
  matchHistory: PlayerProfileMatchHistoryEntry[];
}

interface CurrentProfileViewer {
  id: string;
  isAdmin?: boolean;
  isClaimed?: boolean;
  isQuickAccess?: boolean;
  avatarUrl?: string | null;
}

type RankContext = NonNullable<
  NonNullable<UserProfileResponse["context"]>["rankContext"]
>;

type ProfileTab = "overview" | "matches" | "stats" | "achievements";

interface DerivedAchievement {
  icon: LucideIcon;
  title: string;
  detail: string;
  unlocked: boolean;
  tone: "accent" | "success" | "warning" | "danger" | "neutral";
}

interface StyleTrait {
  label: string;
  value: number;
  detail: string;
}

interface RatingSeriesPoint {
  value: number;
  index: number;
  label: string;
  deltaFromPrev: number | null;
}

export interface PlayerProfileViewProps {
  userId: string;
  communityId?: string;
  mode?: "standalone" | "embedded";
  onBack?: () => void;
}

const PROFILE_TABS: Array<{ id: ProfileTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "matches", label: "Matches" },
  { id: "stats", label: "Stats" },
  { id: "achievements", label: "Achievements" },
];

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatSignedNumber(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function formatShortDate(value: string | null) {
  if (!value) {
    return "No matches yet";
  }

  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatMatchHistoryDate(value: string | null) {
  if (!value) {
    return "No date";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No date";
  }

  const diffMs = Date.now() - date.getTime();
  if (diffMs >= 0) {
    const days = Math.floor(diffMs / 86_400_000);
    if (days === 0) {
      return "Today";
    }

    if (days < 7) {
      return `${days}d ago`;
    }

    const weeks = Math.floor(days / 7);
    if (weeks < 8) {
      return `${weeks}w ago`;
    }
  }

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function formatMatchScore(score: string) {
  return score.replace(/\s*-\s*/g, "-");
}

function getPlayerProfileHref(userId: string, communityId: string) {
  return communityId
    ? `/profile/${userId}?communityId=${encodeURIComponent(communityId)}`
    : `/profile/${userId}`;
}

function getSessionHistoryHref(sessionCode: string) {
  return `/session/${sessionCode}/history`;
}

function getSignedChipClass(value: number) {
  if (value > 0) {
    return "app-chip app-chip-success";
  }

  if (value < 0) {
    return "app-chip app-chip-danger";
  }

  return "app-chip app-chip-neutral";
}

function getTrendDirectionLabel(direction: PlayerProfileTrendSummary["direction"]) {
  switch (direction) {
    case "RISING":
      return "Rising";
    case "SLIPPING":
      return "Slipping";
    default:
      return "Flat";
  }
}

function getTrendDirectionChipClass(
  direction: PlayerProfileTrendSummary["direction"]
) {
  switch (direction) {
    case "RISING":
      return "app-chip app-chip-success";
    case "SLIPPING":
      return "app-chip app-chip-danger";
    default:
      return "app-chip app-chip-neutral";
  }
}

function getTrendDirectionDetail(
  direction: PlayerProfileTrendSummary["direction"]
) {
  switch (direction) {
    case "RISING":
      return "Recent sessions are moving upward on results, rating, or point swing.";
    case "SLIPPING":
      return "Recent sessions are giving back rating or point swing.";
    default:
      return "Recent sessions are balancing out without a clear swing.";
  }
}

function getRankMovementLabel(rankDelta: number | null) {
  if (rankDelta === null || rankDelta === 0) {
    return "No change";
  }

  return rankDelta > 0 ? `Up ${rankDelta}` : `Down ${Math.abs(rankDelta)}`;
}

function getRankMovementChipClass(rankDelta: number | null) {
  if (rankDelta === null || rankDelta === 0) {
    return "app-chip app-chip-neutral";
  }

  return rankDelta > 0 ? "app-chip app-chip-success" : "app-chip app-chip-danger";
}

function getMatchResultSurfaceClass(result: PlayerProfileMatchHistoryEntry["result"]) {
  return cx(
    "border-l-4",
    result === "WIN"
      ? "border-l-emerald-400 bg-emerald-50/70"
      : "border-l-rose-400 bg-rose-50/70"
  );
}

function getEloChangeClass(value: number | null) {
  if (value === null || value === 0) {
    return "text-gray-500";
  }

  return value > 0 ? "text-emerald-600" : "text-rose-600";
}

function getTierLabel(elo: number) {
  if (elo >= 1700) return "Premier";
  if (elo >= 1450) return "Elite";
  if (elo >= 1200) return "Contender";
  if (elo >= 1000) return "Rising";
  return "Developing";
}

function getRankContextLabel(rankContext: RankContext | null) {
  if (!rankContext?.currentRank || rankContext.leaderboardSize <= 0) {
    return "Rank building";
  }

  const topPercent = Math.max(
    1,
    Math.round((rankContext.currentRank / rankContext.leaderboardSize) * 100)
  );

  return `Top ${topPercent}% of players`;
}

function formatRatingTooltipDate(value: string | null) {
  if (!value) {
    return "Date unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Date unknown";
  }

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function buildRatingSeries(data: UserProfileResponse) {
  const sessionPoints = data.recentSessions
    .slice()
    .reverse()
    .map((session) => ({
      change: session.ratingChange,
      date: session.date,
    }));
  const matchPoints = data.matchHistory
    .slice(0, 8)
    .reverse()
    .map((match) => ({
      change: match.eloChange ?? 0,
      date: match.date,
    }));
  const changes = sessionPoints.length > 0 ? sessionPoints : matchPoints;

  if (changes.length === 0) {
    return [
      {
        value: data.user.elo,
        index: 0,
        label: "Start",
        deltaFromPrev: null,
      },
    ] satisfies RatingSeriesPoint[];
  }

  let rating =
    data.user.elo -
    changes.reduce((sum, point) => sum + point.change, 0);
  const values: RatingSeriesPoint[] = [
    {
      value: rating,
      index: 0,
      label: "Start",
      deltaFromPrev: null,
    },
  ];

  for (const point of changes) {
    rating += point.change;
    values.push({
      value: rating,
      index: values.length,
      label: formatRatingTooltipDate(point.date),
      deltaFromPrev: point.change,
    });
  }

  return values.map((point, index) => ({
    ...point,
    index,
  }));
}

function buildAchievements(
  data: UserProfileResponse,
  rankContext: RankContext | null
): DerivedAchievement[] {
  const winStreak =
    data.recentForm.currentStreak.result === "WIN"
      ? data.recentForm.currentStreak.count
      : 0;
  const bestPartner = data.partners.best[0] ?? null;
  const toughestOpponent = data.opponents.toughest[0] ?? null;
  const hasPartnerChemistry =
    (bestPartner?.matches ?? 0) >= 2 && (bestPartner?.winRate ?? 0) >= 60;

  return [
    {
      icon: Flame,
      title: "Hot streak",
      detail:
        winStreak >= 3
          ? `${winStreak} wins in a row`
          : "Win 3 straight matches to unlock",
      unlocked: winStreak >= 3,
      tone: "success",
    },
    {
      icon: TrendingUp,
      title: "Rising form",
      detail:
        data.trend.ratingChange > 0
          ? `${formatSignedNumber(data.trend.ratingChange)} rating recently`
          : "Gain rating in recent sessions",
      unlocked: data.trend.direction === "RISING" && data.trend.ratingChange > 0,
      tone: "accent",
    },
    {
      icon: Users,
      title: "Partner chemistry",
      detail: bestPartner
        ? `${bestPartner.winRate}% with ${bestPartner.user.name}`
        : "Build a winning partner record",
      unlocked: hasPartnerChemistry,
      tone: "accent",
    },
    {
      icon: Shield,
      title: "Rival tested",
      detail: toughestOpponent
        ? `${toughestOpponent.matches} matches vs ${toughestOpponent.user.name}`
        : "Face opponents multiple times",
      unlocked: !!toughestOpponent,
      tone: "warning",
    },
    {
      icon: Medal,
      title: "Consistent",
      detail:
        data.stats.totalMatches >= 10
          ? `${data.stats.winRate}% win rate over ${data.stats.totalMatches} matches`
          : "Play 10 completed matches",
      unlocked: data.stats.totalMatches >= 10 && data.stats.winRate >= 60,
      tone: "success",
    },
    {
      icon: Trophy,
      title: "Leaderboard threat",
      detail: rankContext?.currentRank
        ? `Rank #${rankContext.currentRank} of ${rankContext.leaderboardSize}`
        : "Enter the ranked community board",
      unlocked: !!rankContext?.currentRank && rankContext.currentRank <= 5,
      tone: "warning",
    },
    {
      icon: CalendarDays,
      title: "Frequent competitor",
      detail:
        data.stats.sessionsPlayed >= 10
          ? `${data.stats.sessionsPlayed} sessions played`
          : "Play 10 completed sessions",
      unlocked: data.stats.sessionsPlayed >= 10,
      tone: "neutral",
    },
    {
      icon: Target,
      title: "Point pressure",
      detail:
        data.stats.pointDifferential > 0
          ? `${formatSignedNumber(data.stats.pointDifferential)} total point diff`
          : "Finish positive on point differential",
      unlocked: data.stats.pointDifferential > 0,
      tone: "danger",
    },
  ];
}

function buildStyleTraits(data: UserProfileResponse): StyleTrait[] {
  return [
    {
      label: "Consistency",
      value: clamp(data.stats.winRate, 0, 100),
      detail: `${data.stats.winRate}% overall win rate`,
    },
    {
      label: "Momentum",
      value: clamp(50 + data.trend.ratingChange, 5, 100),
      detail: `${formatSignedNumber(data.trend.ratingChange)} recent rating`,
    },
    {
      label: "Pressure",
      value: clamp(50 + data.stats.pointDifferential / 6, 5, 100),
      detail: `${formatSignedNumber(data.stats.pointDifferential)} point diff`,
    },
    {
      label: "Endurance",
      value: clamp(data.stats.sessionsPlayed * 6, 5, 100),
      detail: `${data.stats.sessionsPlayed} sessions played`,
    },
    {
      label: "Chemistry",
      value: clamp(data.partners.best[0]?.winRate ?? 0, 0, 100),
      detail: data.partners.best[0]
        ? `${data.partners.best[0].winRate}% best partner win rate`
        : "No partner trend yet",
    },
  ];
}

function ProfileLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-semibold text-[var(--accent-strong)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
    >
      {children}
    </Link>
  );
}

function RatingSparkline({
  series,
  className,
  stroke = "#5eead4",
}: {
  series: RatingSeriesPoint[];
  className?: string;
  stroke?: string;
}) {
  const width = 180;
  const height = 66;
  const padding = 8;
  const values = series.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values.map((value, index) => {
    const x =
      values.length === 1
        ? width / 2
        : (index / (values.length - 1)) * (width - padding * 2) + padding;
    const y =
      height - padding - ((value - min) / range) * (height - padding * 2);
    return {
      x,
      y,
    };
  });
  const pointPairs = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`);
  const areaPoints = [
    `${padding},${height - padding}`,
    ...pointPairs,
    `${width - padding},${height - padding}`,
  ].join(" ");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const getClosestIndex = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) {
      return series.length - 1;
    }

    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const chartX = padding + ratio * (width - padding * 2);
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < points.length; index += 1) {
      const distance = Math.abs(points[index].x - chartX);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    return bestIndex;
  };

  const beginScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    setIsScrubbing(true);
    setActiveIndex(getClosestIndex(event.clientX));
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) {
      return;
    }

    setActiveIndex(getClosestIndex(event.clientX));
  };

  const endScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setIsScrubbing(false);
    setActiveIndex(null);
  };

  const scrubPoint =
    activeIndex !== null ? points[activeIndex] : null;
  const scrubValue =
    activeIndex !== null ? series[activeIndex] : null;
  const scrubDeltaLabel = scrubValue
    ? scrubValue.deltaFromPrev === null
      ? "Starting point"
      : `${formatSignedNumber(scrubValue.deltaFromPrev)} from previous`
    : "";
  const tooltipLeftPercent =
    scrubPoint === null ? 0 : clamp((scrubPoint.x / width) * 100, 11, 89);

  return (
    <div
      ref={containerRef}
      className={cx("relative overflow-visible", className)}
      data-rating-chart-root="true"
      onPointerDown={beginScrub}
      onPointerMove={moveScrub}
      onPointerUp={endScrub}
      onPointerCancel={endScrub}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse" && !isScrubbing) {
          setActiveIndex(null);
        }
      }}
      style={{ touchAction: "pan-y" }}
      aria-label="Rating progression chart"
      role="img"
    >
      {scrubPoint && scrubValue ? (
        <div
          className="pointer-events-none absolute z-20 rounded-lg border border-[rgba(15,118,110,0.26)] bg-white/96 px-2.5 py-1.5 text-[11px] text-gray-700 shadow-[0_8px_16px_rgba(17,25,23,0.16)]"
          data-rating-tooltip="true"
          style={{
            left: `${tooltipLeftPercent}%`,
            top: `${Math.max(scrubPoint.y - 10, 8)}px`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <p className="font-semibold text-[var(--accent-strong)]">
            {scrubValue.value}
          </p>
          <p className="text-gray-600">{scrubValue.label}</p>
          <p className="text-gray-500">{scrubDeltaLabel}</p>
        </div>
      ) : null}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polygon points={areaPoints} fill="rgba(94, 234, 212, 0.12)" />
        <polyline
          points={pointPairs.join(" ")}
          fill="none"
          stroke={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        {scrubPoint ? (
          <line
            x1={scrubPoint.x}
            y1={padding}
            x2={scrubPoint.x}
            y2={height - padding}
            stroke="rgba(255,255,255,0.58)"
            strokeDasharray="3 3"
            strokeWidth="1.5"
          />
        ) : null}
        {points.map((point, index) => (
          <circle
            key={`${point.x}-${point.y}-${index}`}
            cx={point.x.toFixed(1)}
            cy={point.y.toFixed(1)}
            r={
              activeIndex === index
                ? 4.8
                : index === points.length - 1
                  ? 4
                  : 2.3
            }
            fill={
              activeIndex === index
                ? "white"
                : index === points.length - 1
                  ? stroke
                  : "rgba(255,255,255,0.7)"
            }
            stroke={activeIndex === index ? stroke : "none"}
            strokeWidth={activeIndex === index ? "2.2" : "0"}
          />
        ))}
      </svg>
    </div>
  );
}

function ProfileHero({
  data,
  rankContext,
  recentFormSummary,
  recentStreakSummary,
  ratingSeries,
  onBack,
  canManageAvatar,
  onUploadAvatar,
  onRemoveAvatar,
}: {
  data: UserProfileResponse;
  rankContext: RankContext | null;
  recentFormSummary: string;
  recentStreakSummary: string;
  ratingSeries: RatingSeriesPoint[];
  onBack?: () => void;
  canManageAvatar: boolean;
  onUploadAvatar: (file: File) => Promise<void>;
  onRemoveAvatar: () => Promise<void>;
}) {
  const ratingDelta = data.trend.ratingChange;
  const tier = getTierLabel(data.user.elo);

  return (
    <section className="overflow-hidden rounded-[1.35rem] border border-[rgba(255,255,255,0.08)] bg-[#111917] text-white shadow-[0_20px_54px_rgba(17,25,23,0.24)]">
      <div className="relative px-4 pb-5 pt-4 sm:px-6 sm:pb-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(15,118,110,0.34),transparent_38%),radial-gradient(circle_at_90%_8%,rgba(255,255,255,0.12),transparent_34%)]" />
        <div
          className={cx(
            "relative flex items-center gap-3",
            onBack ? "justify-between" : "justify-end"
          )}
        >
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/16"
            >
              <ArrowLeft aria-hidden="true" size={18} strokeWidth={2.2} />
              Back
            </button>
          ) : null}
          <span className="rounded-full border border-amber-300/30 bg-amber-300/14 px-3 py-1.5 text-xs font-semibold text-amber-100">
            {data.context?.communityId ? "Community rating" : "Overall rating"}{" "}
            {data.user.elo}
          </span>
        </div>

        <div className="relative mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-end">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="shrink-0">
              {canManageAvatar ? (
                <AvatarUploader
                  name={data.user.name}
                  avatarUrl={data.user.avatarUrl}
                  size="hero"
                  helperText="JPG, PNG, or WebP up to 5MB."
                  onUpload={onUploadAvatar}
                  onRemove={onRemoveAvatar}
                />
              ) : (
                <div className="relative h-28 w-28">
                  <Avatar
                    name={data.user.name}
                    avatarUrl={data.user.avatarUrl}
                    size="hero"
                    className="h-full w-full border-4 border-emerald-400 bg-[#17201f] shadow-[0_10px_32px_rgba(0,0,0,0.22)]"
                    fallbackClassName="text-emerald-100"
                  />
                  <span className="absolute -bottom-1 -right-2 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-3 py-1.5 text-sm font-semibold text-white shadow-lg">
                    <TrendingUp aria-hidden="true" size={15} strokeWidth={2.4} />
                    {data.user.elo}
                  </span>
                </div>
              )}
            </div>

            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-100/78">
                Player profile
              </p>
              <h1 className="mt-1 truncate text-4xl font-semibold leading-tight !text-white sm:text-5xl">
                {data.user.name}
              </h1>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/18 px-3 py-1.5 text-sm font-semibold text-emerald-100">
                  <Award aria-hidden="true" size={16} strokeWidth={2.3} />
                  {tier}
                </span>
                {rankContext?.currentRank ? (
                  <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-white">
                    Rank #{rankContext.currentRank}
                  </span>
                ) : null}
                <span className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-semibold text-white">
                  {recentFormSummary}
                </span>
              </div>
              <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-white/64">
                <span>Joined {formatShortDate(data.user.createdAt)}</span>
                <span>Last played {formatShortDate(data.stats.lastPlayedAt)}</span>
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center sm:max-w-md">
                <div>
                  <p className="text-2xl font-semibold text-white">
                    {data.stats.totalMatches}
                  </p>
                  <p className="text-xs text-white/56">Matches</p>
                </div>
                <div className="border-x border-white/10">
                  <p className="text-2xl font-semibold text-white">
                    {data.stats.winRate}%
                  </p>
                  <p className="text-xs text-white/56">Win rate</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-white">
                    {recentStreakSummary}
                  </p>
                  <p className="text-xs text-white/56">Streak</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/10 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white/70">
                  Rating story
                </p>
                <p className="mt-2 text-4xl font-semibold text-white">
                  {data.user.elo}
                </p>
              </div>
              <span
                className={cx(
                  "rounded-full px-3 py-1 text-sm font-semibold",
                  ratingDelta >= 0
                    ? "bg-emerald-400/18 text-emerald-100"
                    : "bg-red-400/16 text-red-100"
                )}
              >
                {formatSignedNumber(ratingDelta)}
              </span>
            </div>
            <p className="mt-2 text-sm text-white/62">
              {getRankContextLabel(rankContext)}
            </p>
            <RatingSparkline
              series={ratingSeries}
              className="mt-4 h-20 w-full"
              stroke="#5eead4"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProfileTabs({
  activeTab,
  onChange,
}: {
  activeTab: ProfileTab;
  onChange: (tab: ProfileTab) => void;
}) {
  return (
    <div className="app-panel sticky top-0 z-20 grid grid-cols-4 gap-1 p-1">
      {PROFILE_TABS.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            aria-current={isActive ? "page" : undefined}
            style={{
              backgroundColor: isActive ? "var(--accent)" : "transparent",
              color: isActive ? "#ffffff" : "var(--foreground)",
            }}
            className={cx(
              "min-h-11 rounded-xl px-1 text-xs font-semibold sm:px-2 sm:text-sm",
              isActive ? "shadow-sm" : null
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function ProfileSection({
  eyebrow,
  title,
  action,
  children,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx("app-panel p-4 sm:p-5", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow ? <p className="app-eyebrow">{eyebrow}</p> : null}
          <h2 className="mt-1 text-xl font-semibold text-gray-900 sm:text-2xl">
            {title}
          </h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function SummaryMetric({
  icon: Icon,
  label,
  value,
  detail,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "accent" | "success" | "warning" | "danger" | "neutral";
}) {
  const toneClass = {
    accent: "bg-[var(--accent-soft)] text-[var(--accent-strong)]",
    success: "bg-[var(--success-soft)] text-[var(--success)]",
    warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
    danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
    neutral: "bg-[var(--surface-muted)] text-gray-600",
  }[tone];

  return (
    <div className="min-h-[7.25rem] rounded-xl border border-[var(--line)] bg-white p-3 shadow-[0_8px_18px_rgba(23,32,31,0.04)] sm:min-h-0 sm:p-4">
      <div className="flex h-full flex-col justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={cx("rounded-lg p-1.5", toneClass)}>
            <Icon aria-hidden="true" size={17} strokeWidth={2.4} />
          </span>
          <p className="min-w-0 text-xs font-semibold leading-tight text-gray-700 sm:text-sm">
            {label}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-semibold leading-none text-gray-900">
            {value}
          </p>
          {detail ? (
            <p className="mt-1.5 text-[11px] leading-snug text-gray-600 sm:text-xs">
              {detail}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PerformanceSummary({ data }: { data: UserProfileResponse }) {
  return (
    <ProfileSection
      eyebrow="Performance"
      title="Performance summary"
      action={<span className="app-chip app-chip-neutral">Current view</span>}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryMetric
          icon={Trophy}
          label="Win rate"
          value={`${data.stats.winRate}%`}
          detail={`${data.stats.wins} wins / ${data.stats.losses} losses`}
          tone="success"
        />
        <SummaryMetric
          icon={BarChart3}
          label="Matches played"
          value={data.stats.totalMatches}
          detail={`${data.stats.sessionsPlayed} completed sessions`}
          tone="accent"
        />
        <SummaryMetric
          icon={Star}
          label="Points scored"
          value={data.stats.pointsScored}
          detail={`${data.stats.averageMatchesPerSession} matches per session`}
          tone="warning"
        />
        <SummaryMetric
          icon={Shield}
          label="Points conceded"
          value={data.stats.pointsConceded}
          detail="Across completed matches"
          tone="danger"
        />
        <SummaryMetric
          icon={Target}
          label="Point differential"
          value={formatSignedNumber(data.stats.pointDifferential)}
          detail="Total scoring margin"
          tone={data.stats.pointDifferential >= 0 ? "success" : "danger"}
        />
        <SummaryMetric
          icon={Activity}
          label="Recent form"
          value={`${data.recentForm.wins}-${data.recentForm.losses}`}
          detail={`${data.recentForm.matches} match window`}
          tone="neutral"
        />
      </div>
    </ProfileSection>
  );
}

function ConnectionRow({
  summary,
  rank,
  communityId,
}: {
  summary: PlayerProfileConnectionSummary;
  rank: number;
  communityId: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-3 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[rgba(15,118,110,0.18)] bg-[var(--accent-faint)] text-xs font-semibold text-[var(--accent-strong)]">
        #{rank}
      </span>
      <Avatar name={summary.user.name} avatarUrl={summary.user.avatarUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">
          <ProfileLink href={getPlayerProfileHref(summary.user.id, communityId)}>
            {summary.user.name}
          </ProfileLink>
        </div>
        <p className="mt-1 text-xs text-gray-600">
          {summary.wins}-{summary.losses}, {summary.winRate}% win,{" "}
          {summary.matches} {summary.matches === 1 ? "match" : "matches"}
        </p>
      </div>
    </div>
  );
}

function ConnectionRankList({
  summaries,
  communityId,
  emptyText,
}: {
  summaries: PlayerProfileConnectionSummary[];
  communityId: string;
  emptyText: string;
}) {
  if (summaries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--surface-muted)] px-3 py-4 text-sm text-gray-600">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {summaries.map((summary, index) => (
        <ConnectionRow
          key={summary.user.id}
          summary={summary}
          rank={index + 1}
          communityId={communityId}
        />
      ))}
    </div>
  );
}

function RelationshipCards({
  data,
  communityId,
}: {
  data: UserProfileResponse;
  communityId: string;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ProfileSection
        eyebrow="Connections"
        title="Best partners"
        action={<span className="app-chip app-chip-accent">Doubles</span>}
      >
        <ConnectionRankList
          summaries={data.partners.best}
          communityId={communityId}
          emptyText="Complete a few partner matches to reveal chemistry."
        />
      </ProfileSection>

      <ProfileSection
        eyebrow="Opponents"
        title="Toughest opponents"
        action={<span className="app-chip app-chip-warning">Head-to-head</span>}
      >
        <ConnectionRankList
          summaries={data.opponents.toughest}
          communityId={communityId}
          emptyText="Toughest opponents appear once enough history exists."
        />
      </ProfileSection>
    </div>
  );
}

function RatingProgressCard({
  data,
  ratingSeries,
}: {
  data: UserProfileResponse;
  ratingSeries: RatingSeriesPoint[];
}) {
  const ratings = ratingSeries.map((point) => point.value);
  const peak = Math.max(...ratings, data.user.elo);
  const low = Math.min(...ratings, data.user.elo);

  return (
    <ProfileSection
      eyebrow="Rating"
      title="Rating progression"
      action={<span className={getTrendDirectionChipClass(data.trend.direction)}>{getTrendDirectionLabel(data.trend.direction)}</span>}
    >
      <div className="rounded-2xl border border-[rgba(15,118,110,0.16)] bg-[var(--accent-faint)] p-4">
        <RatingSparkline
          series={ratingSeries}
          className="h-36 w-full"
          stroke="#0f766e"
        />
        <div className="mt-4 grid grid-cols-3 divide-x divide-[var(--line)] text-center">
          <div>
            <p className="text-xs text-gray-500">Peak</p>
            <p className="text-lg font-semibold text-gray-900">{peak}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Current</p>
            <p className="text-lg font-semibold text-gray-900">{data.user.elo}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Lowest</p>
            <p className="text-lg font-semibold text-gray-900">{low}</p>
          </div>
        </div>
      </div>
    </ProfileSection>
  );
}

function AchievementBadge({ achievement }: { achievement: DerivedAchievement }) {
  const Icon = achievement.icon;
  const toneClass = achievement.unlocked
    ? {
        accent: "border-[rgba(15,118,110,0.2)] bg-[var(--accent-faint)] text-[var(--accent-strong)]",
        success: "border-[rgba(21,128,61,0.18)] bg-[var(--success-soft)] text-[var(--success)]",
        warning: "border-[rgba(180,83,9,0.18)] bg-[var(--warning-soft)] text-[var(--warning)]",
        danger: "border-[rgba(220,38,38,0.18)] bg-[var(--danger-soft)] text-[var(--danger)]",
        neutral: "border-[var(--line)] bg-[var(--surface-muted)] text-gray-600",
      }[achievement.tone]
    : "border-[var(--line)] bg-[var(--surface-muted)] text-gray-400";

  return (
    <div
      className={cx(
        "rounded-2xl border p-4 transition",
        achievement.unlocked ? "shadow-[0_8px_18px_rgba(23,32,31,0.04)]" : "",
        toneClass
      )}
    >
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-white/70 p-2">
          <Icon aria-hidden="true" size={22} strokeWidth={2.4} />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{achievement.title}</p>
          <p className="mt-1 text-xs leading-snug text-gray-600">
            {achievement.detail}
          </p>
          {!achievement.unlocked ? (
            <span className="mt-3 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-gray-500">
              Locked
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AchievementPreview({
  achievements,
}: {
  achievements: DerivedAchievement[];
}) {
  return (
    <ProfileSection
      eyebrow="Achievements"
      title="Badges"
      action={
        <span className="app-chip app-chip-neutral">
          {achievements.filter((achievement) => achievement.unlocked).length}/
          {achievements.length} unlocked
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {achievements.slice(0, 4).map((achievement) => (
          <AchievementBadge key={achievement.title} achievement={achievement} />
        ))}
      </div>
    </ProfileSection>
  );
}

function SessionInlineValue({
  summary,
}: {
  summary: PlayerProfileSessionSummary | null;
}) {
  if (!summary) {
    return <span className="text-gray-500">No completed sessions yet</span>;
  }

  return (
    <div className="space-y-1">
      <ProfileLink href={getSessionHistoryHref(summary.code)}>
        {summary.name}
      </ProfileLink>
      <p className="text-xs text-gray-600">
        {summary.wins}-{summary.losses} record,{" "}
        {formatSignedNumber(summary.pointDifferential)} diff
      </p>
      <p className="text-xs text-gray-500">{formatShortDate(summary.date)}</p>
    </div>
  );
}

function RecentSessionTile({
  summary,
}: {
  summary: PlayerProfileSessionSummary;
}) {
  return (
    <article className="snap-start rounded-xl border border-[var(--line)] bg-white px-3 py-3 sm:min-w-[15rem]">
      <p className="text-xs font-semibold text-gray-500">
        {formatShortDate(summary.date)}
      </p>
      <div className="mt-1 truncate text-sm">
        <ProfileLink href={getSessionHistoryHref(summary.code)}>
          {summary.name}
        </ProfileLink>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="app-chip app-chip-neutral">{summary.matches} matches</span>
        <span className="app-chip app-chip-accent">
          {summary.wins}-{summary.losses}
        </span>
        <span className={getSignedChipClass(summary.pointDifferential)}>
          {formatSignedNumber(summary.pointDifferential)} diff
        </span>
        <span className={getSignedChipClass(summary.ratingChange)}>
          {formatSignedNumber(summary.ratingChange)} rating
        </span>
      </div>
    </article>
  );
}

function MatchCard({
  match,
  userName,
  communityId,
  compact = false,
}: {
  match: PlayerProfileMatchHistoryEntry;
  userName: string;
  communityId: string;
  compact?: boolean;
}) {
  const sessionHref = getSessionHistoryHref(match.sessionCode);

  return (
    <article
      className={cx(
        "rounded-xl border border-[var(--line)] shadow-[0_6px_16px_rgba(23,32,31,0.035)]",
        getMatchResultSurfaceClass(match.result),
        compact ? "px-3 py-3" : "px-3.5 py-3.5 sm:px-4"
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5">
        <div className="min-w-0">
          <div className="flex min-w-0 items-baseline justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Avatar name={match.partner.name} avatarUrl={match.partner.avatarUrl} size="sm" />
              <p className="min-w-0 truncate text-sm font-semibold text-gray-900 sm:text-base">
                <span>{userName}</span>
                <span className="px-1 text-gray-400">/</span>
                <ProfileLink href={getPlayerProfileHref(match.partner.id, communityId)}>
                  {match.partner.name}
                </ProfileLink>
              </p>
            </div>
            <p className="shrink-0 text-sm font-semibold text-gray-950 sm:text-base">
              {formatMatchScore(match.score)}
            </p>
          </div>

          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-gray-600 sm:text-sm">
            <span className="text-gray-500">vs</span>
            {match.opponents.map((opponent) => (
              <span key={opponent.id} className="inline-flex items-center gap-1.5">
                <Avatar name={opponent.name} avatarUrl={opponent.avatarUrl} size="xs" />
                <ProfileLink href={getPlayerProfileHref(opponent.id, communityId)}>
                  {opponent.name}
                </ProfileLink>
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <div className="w-[3.2rem] text-right">
            <p
              className={cx(
                "whitespace-nowrap text-[11px] font-semibold leading-tight sm:text-sm",
                getEloChangeClass(match.eloChange)
              )}
            >
              {typeof match.eloChange === "number"
                ? `${formatSignedNumber(match.eloChange)} ELO`
                : "No ELO"}
            </p>
            <p className="mt-0.5 whitespace-nowrap text-xs text-gray-500">
              {formatMatchHistoryDate(match.date)}
            </p>
          </div>

          <Link
            href={sessionHref}
            aria-label={`Open ${match.sessionName} history`}
            title={match.sessionName}
            className="-mr-2 inline-flex h-11 w-10 items-center justify-center rounded-lg text-gray-500 transition hover:bg-[var(--surface-muted)] hover:text-[var(--accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </article>
  );
}

function MatchesList({
  matches,
  userName,
  communityId,
  compact = false,
}: {
  matches: PlayerProfileMatchHistoryEntry[];
  userName: string;
  communityId: string;
  compact?: boolean;
}) {
  if (matches.length === 0) {
    return (
      <EmptyState
        title="No matches played yet"
        detail="Once a tournament result is approved, it will appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {matches.map((match) => (
        <MatchCard
          key={match.id}
          match={match}
          userName={userName}
          communityId={communityId}
          compact={compact}
        />
      ))}
    </div>
  );
}

function OverviewTab({
  data,
  rankContext,
  communityId,
  ratingSeries,
  achievements,
}: {
  data: UserProfileResponse;
  rankContext: RankContext | null;
  communityId: string;
  ratingSeries: RatingSeriesPoint[];
  achievements: DerivedAchievement[];
}) {
  return (
    <div className="space-y-5">
      <PerformanceSummary data={data} />
      <RelationshipCards data={data} communityId={communityId} />
      <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
        <AchievementPreview achievements={achievements} />
        <RatingProgressCard data={data} ratingSeries={ratingSeries} />
      </div>
      <ProfileSection
        eyebrow="Recent"
        title="Recent matches"
        action={
          <span className="app-chip app-chip-neutral">
            {data.matchHistory.length} total
          </span>
        }
      >
        <MatchesList
          matches={data.matchHistory.slice(0, 3)}
          userName={data.user.name}
          communityId={communityId}
          compact
        />
      </ProfileSection>
      {rankContext ? (
        <p className="px-1 text-xs text-gray-500">
          Rank movement is calculated from the same recent-session window as the
          profile stats.
        </p>
      ) : null}
    </div>
  );
}

function MatchesTab({
  data,
  communityId,
}: {
  data: UserProfileResponse;
  communityId: string;
}) {
  return (
    <ProfileSection
      eyebrow="History"
      title="Match history"
      action={<span className="app-chip app-chip-neutral">{data.matchHistory.length} matches</span>}
    >
      <MatchesList
        matches={data.matchHistory}
        userName={data.user.name}
        communityId={communityId}
      />
    </ProfileSection>
  );
}

function DetailGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>;
}

function MiniFact({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-3">
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
      {detail ? <p className="mt-1 text-xs text-gray-600">{detail}</p> : null}
    </div>
  );
}

function StyleTraitBars({ traits }: { traits: StyleTrait[] }) {
  return (
    <ProfileSection eyebrow="Derived" title="Playstyle snapshot">
      <div className="space-y-3">
        {traits.map((trait) => (
          <div key={trait.label}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-800">{trait.label}</p>
              <p className="text-sm font-semibold text-[var(--accent-strong)]">
                {Math.round(trait.value)}
              </p>
            </div>
            <div className="mt-2 h-2 rounded-full bg-[var(--surface-muted)]">
              <div
                className="h-2 rounded-full bg-[var(--accent)]"
                style={{ width: `${trait.value}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">{trait.detail}</p>
          </div>
        ))}
      </div>
    </ProfileSection>
  );
}

function StatsTab({
  data,
  rankContext,
  communityId,
  styleTraits,
}: {
  data: UserProfileResponse;
  rankContext: RankContext | null;
  communityId: string;
  styleTraits: StyleTrait[];
}) {
  return (
    <div className="space-y-5">
      <PerformanceSummary data={data} />
      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <StyleTraitBars traits={styleTraits} />
        <ProfileSection
          eyebrow="Form"
          title="Momentum and sessions"
          action={<span className={getTrendDirectionChipClass(data.trend.direction)}>{getTrendDirectionLabel(data.trend.direction)}</span>}
        >
          <DetailGrid>
            <MiniFact
              label="Trend window"
              value={
                data.trend.sessions > 0
                  ? `${data.trend.wins}-${data.trend.losses}, ${data.trend.winRate}%`
                  : "No window yet"
              }
              detail={
                data.trend.sessions > 0
                  ? `${formatSignedNumber(data.trend.ratingChange)} rating, ${formatSignedNumber(data.trend.pointDifferential)} diff`
                  : getTrendDirectionDetail(data.trend.direction)
              }
            />
            {rankContext ? (
              <MiniFact
                label="Rank movement"
                value={
                  <span className={getRankMovementChipClass(rankContext.rankDelta)}>
                    {rankContext.currentRank === null
                      ? "Unranked"
                      : getRankMovementLabel(rankContext.rankDelta)}
                  </span>
                }
                detail={
                  rankContext.currentRank === null
                    ? "Only ranked community members appear on the leaderboard."
                    : rankContext.previousRank
                      ? `Started this window at #${rankContext.previousRank}.`
                      : "Previous rank is unavailable for this window."
                }
              />
            ) : null}
            <MiniFact
              label="Latest session"
              value={<SessionInlineValue summary={data.sessions.latest} />}
            />
            <MiniFact
              label="Best session"
              value={<SessionInlineValue summary={data.sessions.best} />}
            />
            <MiniFact
              label="Session volume"
              value={`${data.stats.sessionsPlayed} sessions`}
              detail={`${data.stats.averageMatchesPerSession} matches per session`}
            />
            <MiniFact
              label="Current streak"
              value={
                data.recentForm.currentStreak.result === null
                  ? "No streak yet"
                  : `${data.recentForm.currentStreak.result === "WIN" ? "W" : "L"}${data.recentForm.currentStreak.count}`
              }
              detail={`${data.recentForm.matches} recent matches`}
            />
          </DetailGrid>

          {data.recentSessions.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:flex sm:snap-x sm:overflow-x-auto sm:pb-1">
              {data.recentSessions.map((recentSession) => (
                <RecentSessionTile key={recentSession.id} summary={recentSession} />
              ))}
            </div>
          ) : null}
        </ProfileSection>
      </div>
      <RelationshipCards data={data} communityId={communityId} />
    </div>
  );
}

function AchievementsTab({
  achievements,
}: {
  achievements: DerivedAchievement[];
}) {
  return (
    <ProfileSection
      eyebrow="Achievements"
      title="Derived badges"
      action={
        <span className="app-chip app-chip-neutral">
          {achievements.filter((achievement) => achievement.unlocked).length} unlocked
        </span>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {achievements.map((achievement) => (
          <AchievementBadge key={achievement.title} achievement={achievement} />
        ))}
      </div>
    </ProfileSection>
  );
}

export function PlayerProfileView({
  userId,
  communityId = "",
  mode = "standalone",
  onBack,
}: PlayerProfileViewProps) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isEmbedded = mode === "embedded";

  const [data, setData] = useState<UserProfileResponse | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentProfileViewer | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
    }
  }, [status, router]);

  useEffect(() => {
    const fetchData = async () => {
      if (!userId) return;

      try {
        setLoading(true);
        setError("");
        const query = communityId
          ? `?communityId=${encodeURIComponent(communityId)}`
          : "";
        const [res, meRes] = await Promise.all([
          fetch(`/api/users/${userId}/stats${query}`),
          fetch("/api/user/me"),
        ]);
        if (!res.ok) {
          throw new Error("Failed to load profile");
        }

        const [json, meJson] = (await Promise.all([
          res.json(),
          meRes.ok ? meRes.json() : Promise.resolve({}),
        ])) as [
          UserProfileResponse,
          { user?: CurrentProfileViewer }
        ];
        setData(json);
        setCurrentUser(meJson.user ?? null);
      } catch (err) {
        console.error(err);
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    };

    if (session?.user) {
      void fetchData();
    }
  }, [userId, session, communityId]);

  const handleUploadAvatar = async (file: File) => {
    const canUseCommunityAdminRoute =
      communityId.length > 0 && data?.context?.viewerCanManageCommunity;
    const response = await uploadUserAvatar(
      userId,
      file,
      canUseCommunityAdminRoute ? communityId : undefined
    );

    setData((current) =>
      current
        ? {
            ...current,
            user: {
              ...current.user,
              avatarUrl: response.avatarUrl,
            },
          }
        : current
    );
    setCurrentUser((current) =>
      current && current.id === userId
        ? {
            ...current,
            avatarUrl: response.avatarUrl,
          }
        : current
    );
  };

  const handleRemoveAvatar = async () => {
    const canUseCommunityAdminRoute =
      communityId.length > 0 && data?.context?.viewerCanManageCommunity;
    await deleteUserAvatar(
      userId,
      canUseCommunityAdminRoute ? communityId : undefined
    );

    setData((current) =>
      current
        ? {
            ...current,
            user: {
              ...current.user,
              avatarUrl: null,
            },
          }
        : current
    );
    setCurrentUser((current) =>
      current && current.id === userId
        ? {
            ...current,
            avatarUrl: null,
          }
        : current
    );
  };

  const fallbackBackHref = communityId ? `/community/${communityId}` : "/";

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }

    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackBackHref);
  };

  const rankContext = data?.context?.rankContext ?? null;
  const ratingSeries = useMemo(
    () =>
      data
        ? buildRatingSeries(data)
        : [
            {
              value: 0,
              index: 0,
              label: "Start",
              deltaFromPrev: null,
            },
          ],
    [data]
  );
  const achievements = useMemo(
    () => (data ? buildAchievements(data, rankContext) : []),
    [data, rankContext]
  );
  const styleTraits = useMemo(
    () => (data ? buildStyleTraits(data) : []),
    [data]
  );

  if (status === "loading" || loading) {
    if (isEmbedded) {
      return (
        <div className="app-panel flex min-h-[18rem] items-center justify-center px-6 py-8">
          <p className="app-eyebrow">Loading profile</p>
        </div>
      );
    }

    return (
      <div className="app-page flex items-center justify-center px-6">
        <div className="app-panel px-8 py-8">
          <p className="app-eyebrow">Loading profile</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    if (isEmbedded) {
      return (
        <div className="space-y-4">
          <FlashMessage tone="error">
            {error || "Profile not found"}
          </FlashMessage>
        </div>
      );
    }

    return (
      <main className="app-page">
        <div className="app-shell-narrow">
          <FlashMessage tone="error">
            {error || "Profile not found"}
          </FlashMessage>
          <div className="mt-6">
            <button
              type="button"
              onClick={handleBack}
              className="app-button-secondary"
            >
              Go back
            </button>
          </div>
        </div>
      </main>
    );
  }

  const recentFormSummary =
    data.recentForm.matches > 0
      ? `${data.recentForm.wins}-${data.recentForm.losses} in last ${data.recentForm.matches}`
      : "No recent matches yet";
  const recentStreakSummary =
    data.recentForm.currentStreak.result === null
      ? "No streak yet"
      : `${data.recentForm.currentStreak.result === "WIN" ? "W" : "L"}${data.recentForm.currentStreak.count}`;
  const canManageAvatar =
    !!currentUser &&
    (currentUser.isAdmin === true ||
      (currentUser.id === userId &&
        currentUser.isClaimed === true &&
        currentUser.isQuickAccess !== true) ||
      (!!data.context?.viewerCanManageCommunity && communityId.length > 0));

  const content = (
    <div
      className={cx(
        "space-y-4 sm:space-y-5",
        isEmbedded ? "pb-4" : "app-shell max-w-[78rem]"
      )}
    >
      <ProfileHero
        data={data}
        rankContext={rankContext}
        recentFormSummary={recentFormSummary}
        recentStreakSummary={recentStreakSummary}
        ratingSeries={ratingSeries}
        canManageAvatar={canManageAvatar}
        onUploadAvatar={handleUploadAvatar}
        onRemoveAvatar={handleRemoveAvatar}
        onBack={isEmbedded ? undefined : handleBack}
      />

      <ProfileTabs activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "overview" ? (
        <OverviewTab
          data={data}
          rankContext={rankContext}
          communityId={communityId}
          ratingSeries={ratingSeries}
          achievements={achievements}
        />
      ) : null}

      {activeTab === "matches" ? (
        <MatchesTab data={data} communityId={communityId} />
      ) : null}

      {activeTab === "stats" ? (
        <StatsTab
          data={data}
          rankContext={rankContext}
          communityId={communityId}
          styleTraits={styleTraits}
        />
      ) : null}

      {activeTab === "achievements" ? (
        <AchievementsTab achievements={achievements} />
      ) : null}
    </div>
  );

  return isEmbedded ? content : <main className="app-page">{content}</main>;
}

export default PlayerProfileView;
