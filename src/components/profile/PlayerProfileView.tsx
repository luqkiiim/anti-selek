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
  ArrowLeft,
  Award,
  BarChart3,
  CalendarDays,
  Flame,
  LayoutGrid,
  Medal,
  Shield,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { AvatarPreviewModal } from "@/components/ui/AvatarPreviewModal";
import { AvatarUploader } from "@/components/ui/AvatarUploader";
import type {
  PlayerProfileConnectionSummary,
  PlayerProfileAchievement,
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
    clubId: string;
    viewerCanManageClub: boolean;
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
  achievements: PlayerProfileAchievement[];
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

type AchievementTone = "accent" | "success" | "warning" | "danger" | "neutral";

const RELATIONSHIP_PREVIEW_COUNT = 3;

const ACHIEVEMENT_PRESENTATION: Record<
  PlayerProfileAchievement["id"],
  { icon: LucideIcon; tone: AchievementTone }
> = {
  "strong-start": { icon: Flame, tone: "success" },
  "clutch-finish": { icon: Target, tone: "warning" },
  "perfect-session": { icon: Star, tone: "success" },
  "podium-finish": { icon: Trophy, tone: "warning" },
  "clean-sweep": { icon: Award, tone: "success" },
  "bounce-back": { icon: TrendingUp, tone: "accent" },
  "close-battle-tested": { icon: Shield, tone: "neutral" },
  "narrow-survivor": { icon: Medal, tone: "warning" },
  "dominant-day": { icon: Flame, tone: "danger" },
  "big-differential": { icon: BarChart3, tone: "accent" },
  "podium-regular": { icon: Trophy, tone: "warning" },
  "podium-mainstay": { icon: Trophy, tone: "warning" },
  "podium-legend": { icon: Trophy, tone: "danger" },
};

interface RatingSeriesPoint {
  value: number;
  index: number;
  label: string;
  deltaFromPrev: number | null;
}

interface RelationshipDialogState {
  title: string;
  summaries: PlayerProfileConnectionSummary[];
}

export interface PlayerProfileViewProps {
  userId: string;
  clubId?: string;
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

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No matches yet";
  }

  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatMatchDateParts(value: string | null) {
  if (!value) {
    return { date: "No date", year: "" };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { date: "No date", year: "" };
  }

  return {
    date: date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    }),
    year: date.toLocaleDateString(undefined, {
      year: "numeric",
    }),
  };
}

function formatMatchScore(score: string) {
  return score.replace(/\s*-\s*/g, "-");
}

function formatConnectionRecord(summary: PlayerProfileConnectionSummary) {
  return `${summary.wins}W/${summary.losses}L`;
}

function getPlayerProfileHref(userId: string, clubId: string) {
  return clubId
    ? `/profile/${userId}?clubId=${encodeURIComponent(clubId)}`
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

function getTierLabel(elo: number) {
  if (elo >= 1700) return "Premier";
  if (elo >= 1450) return "Elite";
  if (elo >= 1200) return "Contender";
  if (elo >= 1000) return "Rising";
  return "Developing";
}

function getMatchResultSurfaceClass(result: PlayerProfileMatchHistoryEntry["result"]) {
  return result === "WIN"
    ? "bg-[rgba(15,118,110,0.045)]"
    : "bg-rose-50/70";
}

function formatRatingTooltipDate(value: string | null) {
  if (!value) {
    return "Start";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Start";
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
      className="font-semibold text-gray-950 underline-offset-2 hover:text-[var(--accent-strong)] hover:underline"
    >
      {children}
    </Link>
  );
}

function RatingSparkline({
  series,
  className,
}: {
  series: RatingSeriesPoint[];
  className?: string;
}) {
  const width = 360;
  const height = 124;
  const chartLeft = 48;
  const chartRight = 318;
  const chartTop = 16;
  const chartBottom = 84;
  const values = series.map((point) => point.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const paddedMin = Math.floor((minValue - 35) / 50) * 50;
  const paddedMax = Math.ceil((maxValue + 35) / 50) * 50;
  const range = Math.max(1, paddedMax - paddedMin);
  const points = values.map((value, index) => {
    const x =
      values.length === 1
        ? (chartLeft + chartRight) / 2
        : chartLeft + (index / (values.length - 1)) * (chartRight - chartLeft);
    const y =
      chartBottom - ((value - paddedMin) / range) * (chartBottom - chartTop);
    return { x, y };
  });
  const pointPairs = points
    .map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`)
    .join(" ");
  const areaPoints = [
    `${chartLeft},${chartBottom}`,
    pointPairs,
    `${chartRight},${chartBottom}`,
  ].join(" ");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activePoint = activeIndex !== null ? points[activeIndex] : points.at(-1);
  const activeValue =
    activeIndex !== null ? series[activeIndex] : series.at(-1) ?? series[0];
  const firstPoint = points[0];
  const lastPoint = points.at(-1) ?? points[0];
  const firstLabel = series[0]?.label ?? "Start";
  const lastLabel = series.at(-1)?.label ?? "Now";

  const getClosestIndex = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) {
      return series.length - 1;
    }

    const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
    const chartX = ratio * width;
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
  };

  const clearMouseScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && !isScrubbing) {
      setActiveIndex(null);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cx("relative", className)}
      data-rating-chart-root="true"
      onPointerDown={beginScrub}
      onPointerMove={moveScrub}
      onPointerUp={endScrub}
      onPointerCancel={endScrub}
      onPointerLeave={clearMouseScrub}
      style={{ touchAction: "pan-y" }}
      aria-label="Rating trend"
      role="img"
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <text x="8" y={chartTop + 4} className="fill-gray-500 text-[10px]">
          {paddedMax}
        </text>
        <text
          x="8"
          y={(chartTop + chartBottom) / 2 + 4}
          className="fill-gray-500 text-[10px]"
        >
          {Math.round((paddedMin + paddedMax) / 2)}
        </text>
        <text x="8" y={chartBottom + 4} className="fill-gray-500 text-[10px]">
          {paddedMin}
        </text>
        <line
          x1={chartLeft}
          y1={chartTop}
          x2={chartLeft}
          y2={chartBottom}
          stroke="rgba(23,32,31,0.14)"
          strokeWidth="1.2"
        />
        <line
          x1={chartLeft}
          y1={chartBottom}
          x2={chartRight}
          y2={chartBottom}
          stroke="rgba(23,32,31,0.14)"
          strokeWidth="1.2"
        />
        <polygon points={areaPoints} fill="rgba(15,118,110,0.09)" />
        <polyline
          points={pointPairs}
          fill="none"
          stroke="rgba(15,118,110,0.22)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="11"
        />
        <polyline
          points={pointPairs}
          fill="none"
          stroke="var(--accent)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="3.4"
        />
        {activePoint ? (
          <line
            x1={activePoint.x}
            y1={chartTop}
            x2={activePoint.x}
            y2={chartBottom}
            stroke="rgba(15,118,110,0.26)"
            strokeDasharray="3 3"
            strokeWidth="1.2"
          />
        ) : null}
        {points.map((point, index) => (
          <circle
            key={`${point.x}-${point.y}-${index}`}
            cx={point.x.toFixed(1)}
            cy={point.y.toFixed(1)}
            r={activeIndex === index || index === points.length - 1 ? 4.4 : 3}
            fill={activeIndex === index ? "var(--accent)" : "white"}
            stroke="var(--accent)"
            strokeWidth={activeIndex === index ? "3" : "2"}
          />
        ))}
        {points.length > 1 ? (
          <text
            x={firstPoint.x}
            y="112"
            textAnchor="middle"
            className="fill-gray-500 text-[11px] font-semibold"
          >
            {firstLabel}
          </text>
        ) : null}
        <text
          x={lastPoint.x}
          y="112"
          textAnchor="middle"
          className="fill-gray-500 text-[11px] font-semibold"
        >
          {lastLabel}
        </text>
      </svg>
      {activePoint && activeValue ? (
        <div
          className="pointer-events-none absolute z-20 rounded-lg bg-[var(--accent)] px-2.5 py-1.5 text-center text-xs font-semibold leading-tight text-white shadow-[0_8px_18px_rgba(15,118,110,0.22)]"
          data-rating-tooltip="true"
          style={{
            left: `${(activePoint.x / width) * 100}%`,
            top: `${Math.max(activePoint.y - 9, 8)}px`,
            transform: "translate(-50%, -100%)",
          }}
        >
          <span className="block">{activeValue.value}</span>
          <span className="block text-[11px] text-white/90">{activeValue.label}</span>
        </div>
      ) : null}
    </div>
  );
}

function ProfileHero({
  data,
  rankContext,
  recentStreakSummary,
  onBack,
  canManageAvatar,
  onPreviewAvatar,
  onUploadAvatar,
  onRemoveAvatar,
}: {
  data: UserProfileResponse;
  rankContext: RankContext | null;
  recentStreakSummary: string;
  onBack?: () => void;
  canManageAvatar: boolean;
  onPreviewAvatar: (avatarUrl: string) => void;
  onUploadAvatar: (file: File) => Promise<void>;
  onRemoveAvatar: () => Promise<void>;
}) {
  const ratingDelta = data.trend.ratingChange;
  const tier = getTierLabel(data.user.elo);

  return (
    <section className="relative rounded-none bg-[linear-gradient(180deg,#eef8f5_0%,#f7faf8_68%,transparent_100%)] px-4 pb-4 pt-3 sm:rounded-[1.35rem] sm:px-6 sm:pt-4">
      <div className="mb-4 flex items-center justify-between">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-900 transition hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            aria-label="Go back"
          >
            <ArrowLeft aria-hidden="true" size={25} strokeWidth={2.2} />
          </button>
        ) : (
          <span className="h-11 w-11" />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
        <div className="justify-self-start">
          {canManageAvatar ? (
            <AvatarUploader
              name={data.user.name}
              avatarUrl={data.user.avatarUrl}
              size="hero"
              presentation="menu"
              onPreviewAvatar={onPreviewAvatar}
              previewAvatarLabel={`View profile photo of ${data.user.name}`}
              onUpload={onUploadAvatar}
              onRemove={onRemoveAvatar}
            />
          ) : (
            <div className="relative aspect-square h-28 w-28">
              {data.user.avatarUrl ? (
                <button
                  type="button"
                  onClick={() => onPreviewAvatar(data.user.avatarUrl as string)}
                  className="inline-flex aspect-square h-full w-full rounded-full transition hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  aria-label={`View profile photo of ${data.user.name}`}
                  data-testid="profile-hero-avatar-trigger"
                >
                  <Avatar
                    name={data.user.name}
                    avatarUrl={data.user.avatarUrl}
                    size="hero"
                    className="h-full w-full border-4 border-white shadow-[0_16px_34px_rgba(23,32,31,0.12)]"
                    imageLoading="eager"
                    imageFetchPriority="high"
                  />
                </button>
              ) : (
                <Avatar
                  name={data.user.name}
                  avatarUrl={data.user.avatarUrl}
                  size="hero"
                  className="h-full w-full border-4 border-white shadow-[0_16px_34px_rgba(23,32,31,0.12)]"
                />
              )}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <h1 className="truncate text-4xl font-[760] leading-none text-gray-950 sm:text-5xl">
            {data.user.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-9 items-center rounded-xl bg-[var(--accent)] px-3 text-sm font-bold text-white">
              {rankContext?.currentRank ? `#${rankContext.currentRank}` : "Rank building"}
            </span>
            <span className={getTrendDirectionChipClass(data.trend.direction)}>
              <TrendingUp aria-hidden="true" size={15} strokeWidth={2.3} />
              {tier}
            </span>
          </div>
          <div
            className="mt-4 grid max-w-[28rem] grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] items-center gap-4"
            data-testid="profile-rating-snapshot"
          >
            <div className="min-w-0 text-center">
              <p className="text-3xl font-[760] leading-none text-gray-950">
                {data.user.elo}
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-600">
                {data.context?.clubId ? "Club rating" : "Overall rating"}
              </p>
            </div>
            <span className="h-14 bg-[var(--line-strong)]" />
            <div className="min-w-0 text-center">
              <p className="text-3xl font-[760] leading-none text-[var(--accent-strong)]">
                {recentStreakSummary}
              </p>
              <p className="mt-1 text-sm font-semibold text-gray-600">
                Recent form
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-gray-600">
            <span className={getSignedChipClass(ratingDelta)}>
              {formatSignedNumber(ratingDelta)} rating
            </span>
            {rankContext?.currentRank ? (
              <span className={getRankMovementChipClass(rankContext.rankDelta)}>
                {getRankMovementLabel(rankContext.rankDelta)}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <StatStrip data={data} recentStreakSummary={recentStreakSummary} />
    </section>
  );
}

function StatStrip({
  data,
  recentStreakSummary,
}: {
  data: UserProfileResponse;
  recentStreakSummary: string;
}) {
  const items = [
    { icon: LayoutGrid, label: "Matches", value: data.stats.totalMatches },
    { icon: BarChart3, label: "Win rate", value: `${data.stats.winRate}%` },
    { icon: Flame, label: "Streak", value: recentStreakSummary, accent: true },
    {
      icon: Award,
      label: "Point diff",
      value: formatSignedNumber(data.stats.pointDifferential),
      accent: true,
    },
  ];

  return (
    <section
      className="mt-5 grid grid-cols-4 divide-x divide-[var(--line-strong)] overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_18px_44px_rgba(23,32,31,0.08)]"
      aria-label="Player summary"
    >
      {items.map(({ icon: Icon, label, value, accent }) => (
        <div
          className="grid min-h-[5rem] place-items-center px-2 py-3 text-center"
          key={label}
        >
          <Icon aria-hidden="true" size={22} strokeWidth={1.8} />
          <span className="mt-1 text-xs font-semibold text-gray-600">{label}</span>
          <strong
            className={cx(
              "mt-1 text-2xl font-[760] leading-none",
              accent ? "text-[var(--accent-strong)]" : "text-gray-950"
            )}
          >
            {value}
          </strong>
        </div>
      ))}
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
    <div className="grid grid-cols-4 border-b border-[var(--line)]">
      {PROFILE_TABS.map((tab) => {
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cx(
              "relative min-h-12 px-1 text-sm font-[760] text-gray-600 transition hover:text-[var(--accent-strong)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] sm:text-base",
              isActive ? "text-[var(--accent-strong)]" : null
            )}
          >
            {tab.label}
            {isActive ? (
              <span className="absolute bottom-[-1px] left-0 right-0 h-[3px] bg-[var(--accent)]" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function ProfileSection({
  icon: Icon,
  title,
  action,
  children,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        "overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_14px_34px_rgba(23,32,31,0.06)]",
        className
      )}
    >
      <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          {Icon ? <Icon aria-hidden="true" size={24} strokeWidth={1.9} /> : null}
          <h2 className="truncate text-xl font-[760] leading-tight text-gray-950">
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
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  tone?: "accent" | "success" | "warning" | "danger" | "neutral";
}) {
  const toneClass = {
    accent: "text-[var(--accent-strong)]",
    success: "text-[var(--success)]",
    warning: "text-[var(--warning)]",
    danger: "text-[var(--danger)]",
    neutral: "text-gray-950",
  }[tone];

  return (
    <div className="grid min-h-[4.25rem] grid-cols-[2rem_minmax(0,1fr)] items-center gap-2 border-b border-[var(--line)] px-3 py-2.5 odd:border-r sm:px-4">
      <Icon aria-hidden="true" size={21} strokeWidth={1.7} />
      <div className="min-w-0">
        <span className="block truncate text-sm font-semibold leading-tight text-gray-600">
          {label}
        </span>
        <strong className={cx("mt-1 block text-2xl font-[760] leading-none", toneClass)}>
          {value}
        </strong>
      </div>
    </div>
  );
}

function PerformanceSummary({
  data,
  ratingSeries,
}: {
  data: UserProfileResponse;
  ratingSeries: RatingSeriesPoint[];
}) {
  return (
    <ProfileSection icon={TrendingUp} title="Performance">
      <div className="grid grid-cols-2">
        <SummaryMetric icon={Trophy} label="Win rate" value={`${data.stats.winRate}%`} />
        <SummaryMetric icon={LayoutGrid} label="Matches played" value={data.stats.totalMatches} />
        <SummaryMetric icon={Target} label="Points scored" value={data.stats.pointsScored} />
        <SummaryMetric
          icon={Shield}
          label="Points conceded"
          value={data.stats.pointsConceded}
        />
        <SummaryMetric
          icon={TrendingUp}
          label="Point diff"
          value={formatSignedNumber(data.stats.pointDifferential)}
          tone={data.stats.pointDifferential >= 0 ? "success" : "danger"}
        />
        <SummaryMetric
          icon={Flame}
          label="Recent form"
          value={`${data.recentForm.wins}-${data.recentForm.losses}`}
          tone="neutral"
        />
      </div>
      <div className="px-4 pb-4 pt-3">
        <div className="mb-1 flex items-center justify-between gap-3">
          <h3 className="text-base font-[760] text-gray-700">Rating trend</h3>
          <span className={getTrendDirectionChipClass(data.trend.direction)}>
            {getTrendDirectionLabel(data.trend.direction)}
          </span>
        </div>
        <RatingSparkline series={ratingSeries} className="h-36 w-full" />
      </div>
    </ProfileSection>
  );
}

function ConnectionRow({
  summary,
  rank,
  clubId,
}: {
  summary: PlayerProfileConnectionSummary;
  rank: number;
  clubId: string;
}) {
  return (
    <div className="grid min-h-14 grid-cols-[2rem_2.4rem_minmax(0,1fr)_4.1rem_3rem] items-center gap-2 border-b border-[var(--line)] px-3 py-2.5 last:border-b-0">
      <span className="text-left text-xs font-extrabold text-gray-600">
        #{rank}
      </span>
      <Avatar name={summary.user.name} avatarUrl={summary.user.avatarUrl} size="xs" />
      <div className="min-w-0 truncate text-sm font-bold text-gray-950">
        <ProfileLink href={getPlayerProfileHref(summary.user.id, clubId)}>
          {summary.user.name}
        </ProfileLink>
      </div>
      <span className="text-right text-sm font-bold text-gray-600">
        {formatConnectionRecord(summary)}
      </span>
      <span className="text-right text-sm font-extrabold text-[var(--accent-strong)]">
        {summary.winRate}%
      </span>
    </div>
  );
}

function ConnectionRankList({
  summaries,
  clubId,
  emptyText,
}: {
  summaries: PlayerProfileConnectionSummary[];
  clubId: string;
  emptyText: string;
}) {
  if (summaries.length === 0) {
    return (
      <div className="px-4 py-4 text-sm font-semibold text-gray-500">
        {emptyText}
      </div>
    );
  }

  return (
    <div>
      {summaries.map((summary, index) => (
        <ConnectionRow
          key={summary.user.id}
          summary={summary}
          rank={index + 1}
          clubId={clubId}
        />
      ))}
    </div>
  );
}

function RelationshipGroup({
  title,
  summaries,
  clubId,
  emptyText,
  onViewAll,
}: {
  title: string;
  summaries: PlayerProfileConnectionSummary[];
  clubId: string;
  emptyText: string;
  onViewAll: () => void;
}) {
  const visibleSummaries = summaries.slice(0, RELATIONSHIP_PREVIEW_COUNT);
  const hasMore = summaries.length > RELATIONSHIP_PREVIEW_COUNT;

  return (
    <div className="min-w-0">
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-2">
        <h3 className="text-sm font-[760] text-gray-600">{title}</h3>
        {hasMore ? (
          <button
            type="button"
            className="text-sm font-[760] text-[var(--accent-strong)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            aria-label={`View all ${title}`}
            onClick={onViewAll}
          >
            View all
          </button>
        ) : null}
      </div>
      <ConnectionRankList
        summaries={visibleSummaries}
        clubId={clubId}
        emptyText={emptyText}
      />
    </div>
  );
}

function RelationshipDialog({
  group,
  clubId,
  onClose,
}: {
  group: RelationshipDialogState | null;
  clubId: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!group) {
      return undefined;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => window.removeEventListener("keydown", handleEscape);
  }, [group, onClose]);

  if (!group) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/10 px-4 py-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${group.title} list`}
        className="grid max-h-[72vh] w-full max-w-md overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(23,32,31,0.22)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-2">
          <h3 className="text-lg font-[760] text-gray-950">{group.title}</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            <X aria-hidden="true" size={19} strokeWidth={2.2} />
          </button>
        </header>
        <div className="max-h-[min(60vh,32rem)] overflow-y-auto">
          <ConnectionRankList
            summaries={group.summaries}
            clubId={clubId}
            emptyText="No data yet"
          />
        </div>
      </div>
    </div>
  );
}

function RelationshipCards({
  data,
  clubId,
}: {
  data: UserProfileResponse;
  clubId: string;
}) {
  const [activeGroup, setActiveGroup] = useState<RelationshipDialogState | null>(
    null
  );

  return (
    <ProfileSection icon={Users} title="Partners & opponents">
      <div className="grid">
        <RelationshipGroup
          title="Best partners"
          summaries={data.partners.best}
          clubId={clubId}
          emptyText="No partner data yet"
          onViewAll={() =>
            setActiveGroup({
              title: "Best partners",
              summaries: data.partners.best,
            })
          }
        />
        <RelationshipGroup
          title="Toughest opponents"
          summaries={data.opponents.toughest}
          clubId={clubId}
          emptyText="No opponent data yet"
          onViewAll={() =>
            setActiveGroup({
              title: "Toughest opponents",
              summaries: data.opponents.toughest,
            })
          }
        />
      </div>
      <RelationshipDialog
        group={activeGroup}
        clubId={clubId}
        onClose={() => setActiveGroup(null)}
      />
    </ProfileSection>
  );
}

function AchievementDetail({
  achievement,
  onClose,
}: {
  achievement: PlayerProfileAchievement | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!achievement) {
      return undefined;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleEscape);

    return () => window.removeEventListener("keydown", handleEscape);
  }, [achievement, onClose]);

  if (!achievement) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/10 px-5"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${achievement.title} badge details`}
        className="grid w-full max-w-xs gap-1.5 rounded-2xl border border-[var(--line)] bg-white px-4 py-4 shadow-[0_24px_60px_rgba(23,32,31,0.2)]"
        onClick={(event) => event.stopPropagation()}
      >
        <strong className="text-base font-[760] text-gray-950">
          {achievement.title}
        </strong>
        <p className="text-sm font-semibold leading-snug text-gray-700">
          {achievement.description}
        </p>
        <small className="text-xs font-bold text-gray-500">
          {achievement.progress}/{achievement.target} {achievement.progressLabel}
        </small>
      </div>
    </div>
  );
}

function AchievementBadge({
  achievement,
  compact = false,
  selected = false,
  onSelect,
}: {
  achievement: PlayerProfileAchievement;
  compact?: boolean;
  selected?: boolean;
  onSelect: () => void;
}) {
  const presentation = ACHIEVEMENT_PRESENTATION[achievement.id];
  const Icon = presentation.icon;
  const progressPercent =
    achievement.target > 0
      ? Math.min(100, Math.round((achievement.progress / achievement.target) * 100))
      : 0;
  const toneClass = achievement.unlocked
    ? {
        accent: "border-[rgba(15,118,110,0.2)] bg-[var(--accent-faint)] text-[var(--accent-strong)]",
        success: "border-[rgba(15,118,110,0.22)] bg-[var(--accent-faint)] text-[var(--accent-strong)]",
        warning: "border-[rgba(180,83,9,0.28)] bg-amber-50 text-amber-700",
        danger: "border-[rgba(220,38,38,0.2)] bg-rose-50 text-rose-700",
        neutral: "border-[var(--line)] bg-[var(--surface-muted)] text-gray-600",
      }[presentation.tone]
    : "border-[var(--line)] bg-[var(--surface-muted)] text-gray-400";

  return (
    <button
      type="button"
      aria-expanded={selected}
      onClick={onSelect}
      className={cx(
        "grid min-w-0 justify-items-center gap-2 border-r border-[var(--line)] px-2 py-4 text-center transition last:border-r-0 hover:bg-[rgba(15,118,110,0.045)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]",
        compact ? "min-h-[9.4rem]" : "min-h-[11rem]",
        selected ? "bg-[rgba(15,118,110,0.055)]" : null
      )}
    >
      <span
        className={cx(
          "inline-flex aspect-square items-center justify-center rounded-full border-2",
          compact ? "h-[4.1rem]" : "h-[4.8rem]",
          toneClass
        )}
      >
        <Icon aria-hidden="true" size={compact ? 31 : 35} strokeWidth={1.8} />
      </span>
      <strong className="min-h-[2rem] max-w-[7rem] text-sm font-[760] leading-tight text-gray-950">
        {achievement.title}
      </strong>
      {compact ? (
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-gray-200">
          <span
            className="block h-full rounded-full bg-[var(--accent)]"
            style={{ width: `${progressPercent}%` }}
          />
        </span>
      ) : (
        <p className="max-w-[10rem] text-xs font-semibold leading-snug text-gray-600">
          {achievement.description}
        </p>
      )}
      <span className="text-xs font-extrabold text-gray-600">
        {achievement.progress}/{achievement.target}
      </span>
    </button>
  );
}

function AchievementPreview({
  achievements,
  onViewAll,
}: {
  achievements: PlayerProfileAchievement[];
  onViewAll: () => void;
}) {
  const [selectedAchievementId, setSelectedAchievementId] = useState<
    PlayerProfileAchievement["id"] | null
  >(null);
  const visibleAchievements = achievements.slice(0, 4);
  const selectedAchievement =
    visibleAchievements.find(
      (achievement) => achievement.id === selectedAchievementId
    ) ?? null;

  return (
    <ProfileSection
      icon={Medal}
      title="Achievements"
      action={
        achievements.length > visibleAchievements.length ? (
          <button
            type="button"
            onClick={onViewAll}
            className="text-sm font-[760] text-[var(--accent-strong)] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          >
            View all
          </button>
        ) : null
      }
    >
      <div className="grid grid-cols-4">
        {visibleAchievements.map((achievement) => (
          <AchievementBadge
            key={achievement.id}
            achievement={achievement}
            compact
            selected={selectedAchievementId === achievement.id}
            onSelect={() =>
              setSelectedAchievementId((current) =>
                current === achievement.id ? null : achievement.id
              )
            }
          />
        ))}
      </div>
      <AchievementDetail
        achievement={selectedAchievement}
        onClose={() => setSelectedAchievementId(null)}
      />
    </ProfileSection>
  );
}

function SessionInlineValue({
  summary,
}: {
  summary: PlayerProfileSessionSummary | null;
}) {
  if (!summary) {
    return <span className="text-gray-500">No sessions yet</span>;
  }

  return (
    <div className="space-y-1">
      <ProfileLink href={getSessionHistoryHref(summary.code)}>
        {summary.name}
      </ProfileLink>
      <p className="text-xs text-gray-600">
        {summary.wins}-{summary.losses}, {summary.winRate}%
      </p>
    </div>
  );
}

function RecentSessionTile({
  summary,
}: {
  summary: PlayerProfileSessionSummary;
}) {
  return (
    <article className="rounded-xl border border-[var(--line)] bg-white px-3 py-3">
      <p className="text-xs font-bold text-gray-500">
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
  clubId,
}: {
  match: PlayerProfileMatchHistoryEntry;
  clubId: string;
}) {
  const { date, year } = formatMatchDateParts(match.date);

  return (
    <article
      className={cx(
        "grid grid-cols-[4.9rem_minmax(5.7rem,0.9fr)_minmax(4.9rem,0.78fr)_minmax(5.2rem,0.82fr)_3.25rem] items-center gap-2 border-b border-[var(--line)] px-3 py-3 last:border-b-0",
        getMatchResultSurfaceClass(match.result)
      )}
    >
      <div className="grid grid-cols-[1.1rem_minmax(0,1fr)] gap-x-1.5 gap-y-0.5 border-r border-[var(--line)] pr-2 text-xs font-semibold text-gray-600">
        <CalendarDays
          aria-hidden="true"
          size={17}
          strokeWidth={1.7}
          className="row-span-2 mt-0.5 text-gray-900"
        />
        <span>{date}</span>
        <span>{year}</span>
      </div>
      <div className="min-w-0 border-r border-[var(--line)] pr-2">
        <strong
          className={cx(
            "block truncate text-sm font-[760]",
            match.result === "WIN" ? "text-[var(--accent-strong)]" : "text-rose-600"
          )}
        >
          {formatMatchScore(match.score)}
        </strong>
        <Link
          href={getSessionHistoryHref(match.sessionCode)}
          className="mt-0.5 block truncate text-xs font-semibold text-gray-600 hover:text-[var(--accent-strong)] hover:underline"
        >
          {match.sessionName}
        </Link>
      </div>
      <div className="min-w-0 border-r border-[var(--line)] pr-2">
        <span className="block text-xs font-semibold text-gray-500">with</span>
        <div className="truncate text-sm">
          <ProfileLink href={getPlayerProfileHref(match.partner.id, clubId)}>
            {match.partner.name}
          </ProfileLink>
        </div>
      </div>
      <div className="min-w-0 border-r border-[var(--line)] pr-2">
        <span className="block text-xs font-semibold text-gray-500">vs</span>
        <div className="truncate text-sm font-semibold text-gray-950">
          {match.opponents.map((opponent, index) => (
            <span key={opponent.id}>
              {index > 0 ? " / " : ""}
              <ProfileLink href={getPlayerProfileHref(opponent.id, clubId)}>
                {opponent.name}
              </ProfileLink>
            </span>
          ))}
        </div>
      </div>
      <span
        className={cx(
          "inline-flex h-11 w-11 items-center justify-center justify-self-center rounded-xl text-lg font-extrabold",
          match.result === "WIN"
            ? "bg-[var(--accent-soft)] text-[var(--accent-strong)]"
            : "bg-rose-100 text-rose-700"
        )}
      >
        {match.result === "WIN" ? "W" : "L"}
      </span>
    </article>
  );
}

function MatchesList({
  matches,
  clubId,
}: {
  matches: PlayerProfileMatchHistoryEntry[];
  clubId: string;
}) {
  if (matches.length === 0) {
    return <EmptyState title="No matches yet" />;
  }

  return (
    <div>
      {matches.map((match) => (
        <MatchCard key={match.id} match={match} clubId={clubId} />
      ))}
    </div>
  );
}

function OverviewTab({
  data,
  clubId,
  ratingSeries,
  achievements,
  onViewAchievements,
}: {
  data: UserProfileResponse;
  clubId: string;
  ratingSeries: RatingSeriesPoint[];
  achievements: PlayerProfileAchievement[];
  onViewAchievements: () => void;
}) {
  return (
    <div className="grid gap-4">
      <PerformanceSummary data={data} ratingSeries={ratingSeries} />
      <RelationshipCards data={data} clubId={clubId} />
      <AchievementPreview
        achievements={achievements}
        onViewAll={onViewAchievements}
      />
      <ProfileSection
        icon={CalendarDays}
        title="Recent matches"
        action={
          data.matchHistory.length > 3 ? (
            <span className="text-sm font-[760] text-[var(--accent-strong)]">
              {data.matchHistory.length} total
            </span>
          ) : null
        }
      >
        <MatchesList matches={data.matchHistory.slice(0, 4)} clubId={clubId} />
      </ProfileSection>
    </div>
  );
}

function MatchesTab({
  data,
  clubId,
}: {
  data: UserProfileResponse;
  clubId: string;
}) {
  return (
    <ProfileSection
      icon={CalendarDays}
      title="Matches"
      action={
        <span className="text-sm font-[760] text-gray-600">
          {data.matchHistory.length}
        </span>
      }
    >
      <MatchesList matches={data.matchHistory} clubId={clubId} />
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
      <p className="text-sm font-semibold text-gray-600">{label}</p>
      <div className="mt-1 text-lg font-[760] text-gray-950">{value}</div>
      {detail ? <p className="mt-1 text-xs font-semibold text-gray-500">{detail}</p> : null}
    </div>
  );
}

function RatingFacts({
  data,
  rankContext,
  ratingSeries,
}: {
  data: UserProfileResponse;
  rankContext: RankContext | null;
  ratingSeries: RatingSeriesPoint[];
}) {
  const ratings = ratingSeries.map((point) => point.value);
  const peak = Math.max(...ratings, data.user.elo);
  const low = Math.min(...ratings, data.user.elo);

  return (
    <ProfileSection
      icon={BarChart3}
      title="Rating"
      action={
        <span className={getTrendDirectionChipClass(data.trend.direction)}>
          {getTrendDirectionLabel(data.trend.direction)}
        </span>
      }
    >
      <div className="space-y-4 p-4">
        <RatingSparkline series={ratingSeries} className="h-36 w-full" />
        <DetailGrid>
          <MiniFact label="Current" value={data.user.elo} />
          <MiniFact label="Peak" value={peak} />
          <MiniFact label="Lowest" value={low} />
          {rankContext ? (
            <MiniFact
              label="Rank movement"
              value={
                rankContext.currentRank === null
                  ? "Unranked"
                  : getRankMovementLabel(rankContext.rankDelta)
              }
              detail={
                rankContext.currentRank === null
                  ? "Leaderboard only"
                  : rankContext.previousRank
                    ? `Started at #${rankContext.previousRank}`
                    : "No previous rank"
              }
            />
          ) : null}
        </DetailGrid>
      </div>
    </ProfileSection>
  );
}

function SessionFormSection({ data }: { data: UserProfileResponse }) {
  return (
    <ProfileSection
      icon={Flame}
      title="Session form"
      action={
        data.recentSessions.length > 0 ? (
          <span className="app-chip app-chip-neutral">
            {data.recentSessions.length} recent
          </span>
        ) : null
      }
    >
      <div className="space-y-4 p-4">
        <DetailGrid>
          <MiniFact
            label="Trend window"
            value={
              data.trend.sessions > 0
                ? `${data.trend.wins}-${data.trend.losses}`
                : "No window yet"
            }
            detail={
              data.trend.sessions > 0
                ? `${data.trend.winRate}% win rate`
                : "No matches yet"
            }
          />
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
            detail={`${data.stats.averageMatchesPerSession} matches/session`}
          />
        </DetailGrid>
        {data.recentSessions.length > 0 ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {data.recentSessions.map((recentSession) => (
              <RecentSessionTile key={recentSession.id} summary={recentSession} />
            ))}
          </div>
        ) : null}
      </div>
    </ProfileSection>
  );
}

function StatsTab({
  data,
  rankContext,
  clubId,
  ratingSeries,
}: {
  data: UserProfileResponse;
  rankContext: RankContext | null;
  clubId: string;
  ratingSeries: RatingSeriesPoint[];
}) {
  return (
    <div className="grid gap-4">
      <PerformanceSummary data={data} ratingSeries={ratingSeries} />
      <RatingFacts
        data={data}
        rankContext={rankContext}
        ratingSeries={ratingSeries}
      />
      <SessionFormSection data={data} />
      <RelationshipCards data={data} clubId={clubId} />
    </div>
  );
}

function AchievementsTab({
  achievements,
}: {
  achievements: PlayerProfileAchievement[];
}) {
  const [selectedAchievementId, setSelectedAchievementId] = useState<
    PlayerProfileAchievement["id"] | null
  >(null);
  const selectedAchievement =
    achievements.find((achievement) => achievement.id === selectedAchievementId) ??
    null;

  return (
    <ProfileSection
      icon={Medal}
      title="Achievements"
      action={
        <span className="app-chip app-chip-neutral">
          {achievements.filter((achievement) => achievement.unlocked).length} unlocked
        </span>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
        {achievements.map((achievement) => (
          <AchievementBadge
            key={achievement.id}
            achievement={achievement}
            selected={selectedAchievementId === achievement.id}
            onSelect={() =>
              setSelectedAchievementId((current) =>
                current === achievement.id ? null : achievement.id
              )
            }
          />
        ))}
      </div>
      <AchievementDetail
        achievement={selectedAchievement}
        onClose={() => setSelectedAchievementId(null)}
      />
    </ProfileSection>
  );
}

export function PlayerProfileView({
  userId,
  clubId = "",
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
  const [previewAvatarUrl, setPreviewAvatarUrl] = useState<string | null>(null);
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
        const query = clubId
          ? `?clubId=${encodeURIComponent(clubId)}`
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
  }, [userId, session, clubId]);

  const handleUploadAvatar = async (file: File) => {
    const canUseClubAdminRoute =
      clubId.length > 0 && data?.context?.viewerCanManageClub;
    const response = await uploadUserAvatar(
      userId,
      file,
      canUseClubAdminRoute ? clubId : undefined
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
    setPreviewAvatarUrl((current) =>
      current ? response.avatarUrl ?? current : current
    );
  };

  const handleRemoveAvatar = async () => {
    const canUseClubAdminRoute =
      clubId.length > 0 && data?.context?.viewerCanManageClub;
    await deleteUserAvatar(
      userId,
      canUseClubAdminRoute ? clubId : undefined
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
    setPreviewAvatarUrl(null);
  };

  const fallbackBackHref = clubId ? `/club/${clubId}` : "/";

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
  const achievements = data?.achievements ?? [];

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

  const recentStreakSummary =
    data.recentForm.currentStreak.result === null
      ? "No streak"
      : `${data.recentForm.currentStreak.result === "WIN" ? "W" : "L"}${data.recentForm.currentStreak.count}`;
  const canManageAvatar =
    !!currentUser &&
    (currentUser.isAdmin === true ||
      (currentUser.id === userId &&
        currentUser.isClaimed === true &&
        currentUser.isQuickAccess !== true) ||
      (!!data.context?.viewerCanManageClub && clubId.length > 0));
  const handlePreviewAvatar = (avatarUrl: string) => {
    setPreviewAvatarUrl(avatarUrl);
  };

  const content = (
    <div
      className={cx(
        "space-y-4 sm:space-y-5",
        isEmbedded ? "pb-4" : "mx-auto max-w-[64rem] px-0 pb-10 sm:px-4"
      )}
    >
      <ProfileHero
        data={data}
        rankContext={rankContext}
        recentStreakSummary={recentStreakSummary}
        canManageAvatar={canManageAvatar}
        onPreviewAvatar={handlePreviewAvatar}
        onUploadAvatar={handleUploadAvatar}
        onRemoveAvatar={handleRemoveAvatar}
        onBack={isEmbedded ? undefined : handleBack}
      />

      <AvatarPreviewModal
        name={data.user.name}
        avatarUrl={previewAvatarUrl}
        onClose={() => setPreviewAvatarUrl(null)}
      />

      <div className="px-4 sm:px-0">
        <ProfileTabs activeTab={activeTab} onChange={setActiveTab} />
      </div>

      <div className="px-4 sm:px-0">
        {activeTab === "overview" ? (
          <OverviewTab
            data={data}
            clubId={clubId}
            ratingSeries={ratingSeries}
            achievements={achievements}
            onViewAchievements={() => setActiveTab("achievements")}
          />
        ) : null}

        {activeTab === "matches" ? (
          <MatchesTab data={data} clubId={clubId} />
        ) : null}

        {activeTab === "stats" ? (
          <StatsTab
            data={data}
            rankContext={rankContext}
            clubId={clubId}
            ratingSeries={ratingSeries}
          />
        ) : null}

        {activeTab === "achievements" ? (
          <AchievementsTab achievements={achievements} />
        ) : null}
      </div>
    </div>
  );

  return isEmbedded ? content : <main className="app-page px-0">{content}</main>;
}

export default PlayerProfileView;
