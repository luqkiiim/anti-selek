"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  PlayerProfileMatchHistoryEntry,
  PlayerProfileRecentFormSummary,
  PlayerProfileSessionSummary,
  PlayerProfileStatsSummary,
  PlayerProfileTrendSummary,
} from "@/lib/profileStats";
import {
  EmptyState,
  FlashMessage,
  SectionCard,
  StatCard,
} from "@/components/ui/chrome";

interface CommunityProfileResponse {
  user: {
    id: string;
    name: string;
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
  matchHistory: PlayerProfileMatchHistoryEntry[];
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

function formatDateTime(value: string | null) {
  if (!value) {
    return "No matches yet";
  }

  return new Date(value).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function getProfileHref(userId: string, communityId: string) {
  return `/profile/${userId}?communityId=${encodeURIComponent(communityId)}`;
}

function getSessionHistoryHref(sessionCode: string) {
  return `/session/${sessionCode}/history`;
}

function getTrendLabel(direction: PlayerProfileTrendSummary["direction"]) {
  switch (direction) {
    case "RISING":
      return "Rising";
    case "SLIPPING":
      return "Slipping";
    default:
      return "Flat";
  }
}

function RecentSessionCard({
  summary,
}: {
  summary: PlayerProfileSessionSummary;
}) {
  return (
    <article className="app-subcard min-w-[15rem] snap-start p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            {formatShortDate(summary.date)}
          </p>
          <Link
            href={getSessionHistoryHref(summary.code)}
            className="text-base font-semibold text-gray-900 hover:text-blue-700 hover:underline"
          >
            {summary.name}
          </Link>
        </div>
        <span className="app-chip app-chip-neutral">
          {summary.matches} matches
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
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

function MatchHistoryCard({
  match,
}: {
  match: PlayerProfileMatchHistoryEntry;
}) {
  return (
    <article className="app-subcard p-4">
      <div className="flex flex-col gap-3">
        <div className="space-y-1">
          <Link
            href={getSessionHistoryHref(match.sessionCode)}
            className="text-base font-semibold text-gray-900 hover:text-blue-700 hover:underline"
          >
            {match.sessionName}
          </Link>
          <p className="text-xs text-gray-600">{formatDateTime(match.date)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`app-chip ${
              match.result === "WIN" ? "app-chip-success" : "app-chip-danger"
            }`}
          >
            {match.result}
          </span>
          <span className="app-chip app-chip-neutral">{match.score}</span>
          <span className={getSignedChipClass(match.pointDifferential)}>
            {formatSignedNumber(match.pointDifferential)} diff
          </span>
          {typeof match.eloChange === "number" ? (
            <span className={getSignedChipClass(match.eloChange)}>
              {formatSignedNumber(match.eloChange)} rating
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export function CommunityProfilePanel({
  userId,
  communityId,
}: {
  userId?: string | null;
  communityId: string;
}) {
  const [data, setData] = useState<CommunityProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userId || !communityId) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch(
          `/api/users/${userId}/stats?communityId=${encodeURIComponent(communityId)}`,
          { signal: controller.signal }
        );

        if (!res.ok) {
          throw new Error("Failed to load profile");
        }

        setData((await res.json()) as CommunityProfileResponse);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }

        console.error(err);
        setError("Failed to load profile");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [communityId, userId]);

  if (!userId) {
    return (
      <SectionCard eyebrow="Profile" title="Player profile">
        <EmptyState
          title="Profile unavailable"
          detail="Sign in again to load your community profile."
        />
      </SectionCard>
    );
  }

  if (loading) {
    return (
      <div className="app-panel flex min-h-[18rem] flex-col items-center justify-center gap-4 p-8">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        <p className="app-eyebrow">Loading profile</p>
      </div>
    );
  }

  if (error || !data) {
    return <FlashMessage tone="error">{error || "Profile not found"}</FlashMessage>;
  }

  const rankContext = data.context?.rankContext ?? null;
  const recentMatches = data.matchHistory.slice(0, 6);

  return (
    <div className="space-y-6">
      <SectionCard
        eyebrow="Player profile"
        title={data.user.name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <span>Joined {formatShortDate(data.user.createdAt)}.</span>
            <span>Last played {formatShortDate(data.stats.lastPlayedAt)}.</span>
          </span>
        }
        action={
          <Link
            href={getProfileHref(data.user.id, communityId)}
            className="app-button-secondary px-4 py-2"
          >
            Full Profile
          </Link>
        }
      >
        <div className="flex flex-wrap gap-2">
          <span className="app-chip app-chip-warning">
            Community Rating {data.user.elo}
          </span>
          {rankContext?.currentRank ? (
            <span className="app-chip app-chip-neutral">
              Rank #{rankContext.currentRank} of {rankContext.leaderboardSize}
            </span>
          ) : null}
          <span className={getSignedChipClass(data.trend.ratingChange)}>
            {getTrendLabel(data.trend.direction)} lately
          </span>
        </div>
      </SectionCard>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Matches"
          value={data.stats.totalMatches}
          detail={`Last played ${formatShortDate(data.stats.lastPlayedAt)}`}
          accent
        />
        <StatCard
          label="Win rate"
          value={`${data.stats.winRate}%`}
          detail={`${data.stats.wins} wins / ${data.stats.losses} losses`}
        />
        <StatCard
          label="Point diff"
          value={formatSignedNumber(data.stats.pointDifferential)}
          detail={`${data.stats.pointsScored} scored / ${data.stats.pointsConceded} conceded`}
        />
        <StatCard
          label="Sessions"
          value={data.stats.sessionsPlayed}
          detail={`${data.stats.averageMatchesPerSession} matches per session`}
        />
      </section>

      <SectionCard
        eyebrow="Momentum"
        title="Recent sessions"
        action={
          <span className="app-chip app-chip-neutral">
            {data.recentSessions.length} session window
          </span>
        }
      >
        {data.recentSessions.length === 0 ? (
          <EmptyState
            title="No recent sessions yet"
            detail="Complete a few matches and the profile view will fill in."
          />
        ) : (
          <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
            {data.recentSessions.map((session) => (
              <RecentSessionCard key={session.id} summary={session} />
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        eyebrow="History"
        title="Recent matches"
        action={
          <span className="app-chip app-chip-neutral">
            {data.matchHistory.length} matches
          </span>
        }
      >
        {recentMatches.length === 0 ? (
          <EmptyState
            title="No matches played yet"
            detail="Once a tournament result is approved, it will appear here."
          />
        ) : (
          <div className="space-y-3">
            {recentMatches.map((match) => (
              <MatchHistoryCard key={match.id} match={match} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
