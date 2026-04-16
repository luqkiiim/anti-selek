"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type {
  PlayerProfileConnectionSummary,
  PlayerProfileMatchHistoryEntry,
  PlayerProfileRecentFormSummary,
  PlayerProfileSessionSummary,
  PlayerProfileStatsSummary,
} from "@/lib/profileStats";
import {
  EmptyState,
  FlashMessage,
  HeroCard,
  SectionCard,
  StatCard,
} from "@/components/ui/chrome";

interface UserProfileResponse {
  user: {
    id: string;
    name: string;
    elo: number;
    createdAt: string;
  };
  context?: {
    communityId: string;
    communityRank: number | null;
    leaderboardSize: number;
  } | null;
  stats: PlayerProfileStatsSummary;
  recentForm: PlayerProfileRecentFormSummary;
  partners: {
    mostPlayed: PlayerProfileConnectionSummary | null;
    bestWinRate: PlayerProfileConnectionSummary | null;
  };
  opponents: {
    mostFaced: PlayerProfileConnectionSummary | null;
    toughest: PlayerProfileConnectionSummary | null;
  };
  sessions: {
    latest: PlayerProfileSessionSummary | null;
    best: PlayerProfileSessionSummary | null;
  };
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

function getPlayerProfileHref(userId: string, communityId: string) {
  return communityId
    ? `/profile/${userId}?communityId=${encodeURIComponent(communityId)}`
    : `/profile/${userId}`;
}

function getSessionHistoryHref(sessionCode: string) {
  return `/session/${sessionCode}/history`;
}

function InsightCard({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <article className="app-subcard p-4 sm:p-5">
      <div className="space-y-1">
        {eyebrow ? (
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            {eyebrow}
          </p>
        ) : null}
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </article>
  );
}

function InsightRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-gray-50 px-3 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
        {label}
      </p>
      <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
      {detail ? <p className="mt-1 text-xs text-gray-600">{detail}</p> : null}
    </div>
  );
}

function ConnectionValue({
  summary,
  communityId,
}: {
  summary: PlayerProfileConnectionSummary | null;
  communityId: string;
}) {
  if (!summary) {
    return <span className="text-gray-500">Not enough match history yet</span>;
  }

  return (
    <div className="space-y-1">
      <Link
        href={getPlayerProfileHref(summary.user.id, communityId)}
        className="font-semibold text-blue-700 hover:text-blue-800 hover:underline"
      >
        {summary.user.name}
      </Link>
      <p className="text-xs text-gray-600">
        {summary.wins}-{summary.losses} record, {summary.matches} matches,{" "}
        {formatSignedNumber(summary.pointDifferential)} diff
      </p>
    </div>
  );
}

function SessionValue({
  summary,
}: {
  summary: PlayerProfileSessionSummary | null;
}) {
  if (!summary) {
    return <span className="text-gray-500">No completed sessions yet</span>;
  }

  return (
    <div className="space-y-1">
      <Link
        href={getSessionHistoryHref(summary.code)}
        className="font-semibold text-blue-700 hover:text-blue-800 hover:underline"
      >
        {summary.name}
      </Link>
      <p className="text-xs text-gray-600">
        {summary.wins}-{summary.losses} record,{" "}
        {formatSignedNumber(summary.pointDifferential)} diff
      </p>
      <p className="text-xs text-gray-500">{formatShortDate(summary.date)}</p>
    </div>
  );
}

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params?.id as string;
  const communityId = searchParams.get("communityId") || "";

  const [data, setData] = useState<UserProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/signin");
    }
  }, [status, router]);

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;

      try {
        const query = communityId
          ? `?communityId=${encodeURIComponent(communityId)}`
          : "";
        const res = await fetch(`/api/users/${id}/stats${query}`);
        if (!res.ok) {
          throw new Error("Failed to load profile");
        }

        const json = (await res.json()) as UserProfileResponse;
        setData(json);
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
  }, [id, session, communityId]);

  const fallbackBackHref = communityId ? `/community/${communityId}` : "/";

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackBackHref);
  };

  if (status === "loading" || loading) {
    return (
      <div className="app-page flex items-center justify-center px-6">
        <div className="app-panel px-8 py-8">
          <p className="app-eyebrow">Loading profile</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
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

  return (
    <main className="app-page">
      <div className="app-shell space-y-6">
        <HeroCard
          eyebrow="Player profile"
          title={data.user.name}
          description={
            <span className="inline-flex flex-wrap items-center gap-2">
              <span>Joined {formatShortDate(data.user.createdAt)}.</span>
              <span>Last played {formatShortDate(data.stats.lastPlayedAt)}.</span>
            </span>
          }
          meta={
            <>
              <span className="app-chip app-chip-warning">
                {data.context?.communityId ? "Community Rating" : "Overall Rating"}{" "}
                {data.user.elo}
              </span>
              {data.context?.communityRank ? (
                <span className="app-chip app-chip-neutral">
                  Rank #{data.context.communityRank} of{" "}
                  {data.context.leaderboardSize}
                </span>
              ) : null}
            </>
          }
          onBack={handleBack}
          backLabel="Back"
        />

        <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
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
          eyebrow="Insights"
          title="Current picture"
          description="Recent form, chemistry, rivalries, and session footprint at a glance."
        >
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <InsightCard
              title={recentFormSummary}
              eyebrow="Recent form"
            >
              <InsightRow
                label="Point swing"
                value={formatSignedNumber(data.recentForm.pointDifferential)}
                detail={`Rating change ${formatSignedNumber(data.recentForm.ratingChange)}`}
              />
              <InsightRow
                label="Current streak"
                value={recentStreakSummary}
                detail={
                  data.recentForm.currentStreak.result
                    ? `${data.recentForm.currentStreak.count} straight ${
                        data.recentForm.currentStreak.result.toLowerCase()
                      }s`
                    : "Streak starts once results come in"
                }
              />
            </InsightCard>

            <InsightCard title="Partner chemistry" eyebrow="Connections">
              <InsightRow
                label="Most played"
                value={
                  <ConnectionValue
                    summary={data.partners.mostPlayed}
                    communityId={communityId}
                  />
                }
              />
              <InsightRow
                label="Best win rate"
                value={
                  <ConnectionValue
                    summary={data.partners.bestWinRate}
                    communityId={communityId}
                  />
                }
              />
            </InsightCard>

            <InsightCard title="Rivalries" eyebrow="Opponents">
              <InsightRow
                label="Most faced"
                value={
                  <ConnectionValue
                    summary={data.opponents.mostFaced}
                    communityId={communityId}
                  />
                }
              />
              <InsightRow
                label="Toughest opponent"
                value={
                  <ConnectionValue
                    summary={data.opponents.toughest}
                    communityId={communityId}
                  />
                }
              />
            </InsightCard>

            <InsightCard title="Session footprint" eyebrow="Sessions">
              <InsightRow
                label="Volume"
                value={`${data.stats.sessionsPlayed} sessions played`}
                detail={`${data.stats.averageMatchesPerSession} matches per session`}
              />
              <InsightRow
                label="Latest session"
                value={<SessionValue summary={data.sessions.latest} />}
              />
            </InsightCard>

            <InsightCard title="Best session" eyebrow="Highlights">
              <InsightRow
                label="Standout run"
                value={<SessionValue summary={data.sessions.best} />}
              />
            </InsightCard>
          </div>
        </SectionCard>

        <SectionCard
          eyebrow="History"
          title="Match timeline"
          action={
            <span className="app-chip app-chip-neutral">
              {data.matchHistory.length} matches
            </span>
          }
        >
          {data.matchHistory.length === 0 ? (
            <EmptyState
              title="No matches played yet"
              detail="Once a tournament result is approved, it will appear here."
            />
          ) : (
            <div className="space-y-3">
              {data.matchHistory.map((match) => (
                <article key={match.id} className="app-subcard p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-1">
                      <Link
                        href={getSessionHistoryHref(match.sessionCode)}
                        className="text-lg font-semibold text-gray-900 hover:text-blue-700 hover:underline"
                      >
                        {match.sessionName}
                      </Link>
                      <p className="text-sm text-gray-600">
                        {formatDateTime(match.date)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`app-chip ${
                          match.result === "WIN"
                            ? "app-chip-success"
                            : "app-chip-danger"
                        }`}
                      >
                        {match.result}
                      </span>
                      <span className="app-chip app-chip-neutral">
                        Diff {formatSignedNumber(match.pointDifferential)}
                      </span>
                      {typeof match.eloChange === "number" ? (
                        <span
                          className={`app-chip ${
                            match.eloChange >= 0
                              ? "app-chip-success"
                              : "app-chip-danger"
                          }`}
                        >
                          {formatSignedNumber(match.eloChange)} Rating
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
                    <div className="app-panel-muted p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                        Team
                      </p>
                      <p className="mt-2 text-sm font-semibold text-gray-900">
                        {data.user.name} &amp;{" "}
                        <Link
                          href={getPlayerProfileHref(
                            match.partner.id,
                            communityId
                          )}
                          className="text-blue-700 hover:text-blue-800 hover:underline"
                        >
                          {match.partner.name}
                        </Link>
                      </p>
                    </div>

                    <div className="mx-auto rounded-full bg-gray-100 px-3 py-2 text-center text-xs font-semibold text-gray-900 sm:px-4 sm:text-sm">
                      {match.score}
                    </div>

                    <div className="app-panel-muted p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                        Opponents
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-2 text-sm font-semibold text-gray-900">
                        {match.opponents.map((opponent, index) => (
                          <span key={opponent.id}>
                            <Link
                              href={getPlayerProfileHref(
                                opponent.id,
                                communityId
                              )}
                              className="text-blue-700 hover:text-blue-800 hover:underline"
                            >
                              {opponent.name}
                            </Link>
                            {index === match.opponents.length - 1 ? null : " & "}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
