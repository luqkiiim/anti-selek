"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type {
  PlayerProfileConnectionSummary,
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

type RankContext = NonNullable<
  NonNullable<UserProfileResponse["context"]>["rankContext"]
>;

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
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

function getResultLabel(result: PlayerProfileMatchHistoryEntry["result"]) {
  return result === "WIN" ? "Win" : "Loss";
}

function getResultChipClass(result: PlayerProfileMatchHistoryEntry["result"]) {
  return result === "WIN" ? "app-chip app-chip-success" : "app-chip app-chip-danger";
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

function ProfileMetric({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cx(
        "rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3 sm:px-4",
        accent && "border-[rgba(15,118,110,0.22)] bg-[var(--accent-faint)]"
      )}
    >
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold leading-none text-gray-900 sm:text-3xl">
        {value}
      </p>
      {detail ? <p className="mt-1.5 text-xs text-gray-600">{detail}</p> : null}
    </div>
  );
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
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3">
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <div className="mt-1 text-sm font-semibold text-gray-900">{value}</div>
      {detail ? <p className="mt-1 text-xs text-gray-600">{detail}</p> : null}
    </div>
  );
}

function ProfileHeader({
  data,
  rankContext,
  recentFormSummary,
  recentStreakSummary,
  onBack,
}: {
  data: UserProfileResponse;
  rankContext: RankContext | null;
  recentFormSummary: string;
  recentStreakSummary: string;
  onBack: () => void;
}) {
  const ratingLabel = data.context?.communityId
    ? "Community rating"
    : "Overall rating";
  const recentFormChipClass =
    data.recentForm.matches === 0
      ? "app-chip app-chip-neutral"
      : data.recentForm.wins >= data.recentForm.losses
        ? "app-chip app-chip-success"
        : "app-chip app-chip-danger";

  return (
    <section className="app-panel overflow-hidden">
      <div className="border-b border-[var(--line)] px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="app-button-secondary inline-flex min-h-11 items-center gap-2 px-3 py-2"
          >
            <ArrowLeft aria-hidden="true" size={18} strokeWidth={2.2} />
            Back
          </button>
          <span className="app-chip app-chip-warning">
            {ratingLabel} {data.user.elo}
          </span>
        </div>

        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="app-eyebrow">Player profile</p>
            <h1 className="mt-2 truncate text-3xl font-semibold leading-tight text-gray-900 sm:text-4xl">
              {data.user.name}
            </h1>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-600">
              <span>Joined {formatShortDate(data.user.createdAt)}</span>
              <span>Last played {formatShortDate(data.stats.lastPlayedAt)}</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            {rankContext ? (
              <span className="app-chip app-chip-neutral">
                {rankContext.currentRank
                  ? `Rank #${rankContext.currentRank} of ${rankContext.leaderboardSize}`
                  : "Unranked"}
              </span>
            ) : null}
            <span className={recentFormChipClass}>{recentFormSummary}</span>
            <span className="app-chip app-chip-neutral">
              Streak {recentStreakSummary}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4 sm:p-5">
        <ProfileMetric
          label="Matches"
          value={data.stats.totalMatches}
          detail={`Last played ${formatShortDate(data.stats.lastPlayedAt)}`}
          accent
        />
        <ProfileMetric
          label="Win rate"
          value={`${data.stats.winRate}%`}
          detail={`${data.stats.wins} wins / ${data.stats.losses} losses`}
        />
        <ProfileMetric
          label="Point diff"
          value={formatSignedNumber(data.stats.pointDifferential)}
          detail={`${data.stats.pointsScored} scored / ${data.stats.pointsConceded} conceded`}
        />
        <ProfileMetric
          label="Sessions"
          value={data.stats.sessionsPlayed}
          detail={`${data.stats.averageMatchesPerSession} matches per session`}
        />
      </div>
    </section>
  );
}

function ConnectionFeature({
  label,
  summary,
  communityId,
  tone = "neutral",
}: {
  label: string;
  summary: PlayerProfileConnectionSummary | null;
  communityId: string;
  tone?: "neutral" | "partner" | "rival";
}) {
  const toneClass =
    tone === "partner"
      ? "border-[rgba(15,118,110,0.18)] bg-[var(--accent-faint)]"
      : tone === "rival"
        ? "border-[rgba(140,100,22,0.2)] bg-[var(--warning-soft)]"
        : "border-[var(--line)] bg-[var(--surface)]";

  if (!summary) {
    return (
      <div className={cx("min-h-28 rounded-xl border px-3 py-3", toneClass)}>
        <p className="text-sm font-semibold text-gray-700">{label}</p>
        <p className="mt-2 text-sm text-gray-500">
          Not enough match history yet
        </p>
      </div>
    );
  }

  return (
    <div className={cx("min-h-28 rounded-xl border px-3 py-3", toneClass)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-gray-700">{label}</p>
        <span className="app-chip app-chip-neutral">{summary.matches} matches</span>
      </div>
      <div className="mt-2 text-lg leading-tight">
        <ProfileLink href={getPlayerProfileHref(summary.user.id, communityId)}>
          {summary.user.name}
        </ProfileLink>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="app-chip app-chip-accent">{summary.winRate}% win</span>
        <span className="app-chip app-chip-neutral">
          {summary.wins}-{summary.losses}
        </span>
        <span className={getSignedChipClass(summary.pointDifferential)}>
          {formatSignedNumber(summary.pointDifferential)} diff
        </span>
      </div>
    </div>
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
    <article className="snap-start rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-3 sm:min-w-[15rem]">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-500">
          {formatShortDate(summary.date)}
        </p>
        <div className="mt-1 truncate text-sm">
          <ProfileLink href={getSessionHistoryHref(summary.code)}>
            {summary.name}
          </ProfileLink>
        </div>
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

function RelationshipSection({
  data,
  communityId,
}: {
  data: UserProfileResponse;
  communityId: string;
}) {
  return (
    <SectionCard
      eyebrow="Relationships"
      title="Rivals and partners"
      description="The people shaping this player's table: who they see most, who gives them trouble, and who clicks as a partner."
    >
      <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-xl border border-[rgba(140,100,22,0.18)] bg-[var(--warning-soft)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="app-eyebrow">Opponents</p>
              <h3 className="mt-1 text-xl font-semibold text-gray-900">
                Rivalries
              </h3>
            </div>
            <span className="app-chip app-chip-warning">Head-to-head</span>
          </div>
          <div className="mt-4 grid gap-3">
            <ConnectionFeature
              label="Most faced"
              summary={data.opponents.mostFaced}
              communityId={communityId}
              tone="rival"
            />
            <ConnectionFeature
              label="Toughest"
              summary={data.opponents.toughest}
              communityId={communityId}
              tone="rival"
            />
          </div>
        </div>

        <div className="rounded-xl border border-[rgba(15,118,110,0.16)] bg-[var(--accent-faint)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="app-eyebrow">Connections</p>
              <h3 className="mt-1 text-xl font-semibold text-gray-900">
                Partner chemistry
              </h3>
            </div>
            <span className="app-chip app-chip-accent">Doubles</span>
          </div>
          <div className="mt-4 grid gap-3">
            <ConnectionFeature
              label="Most played"
              summary={data.partners.mostPlayed}
              communityId={communityId}
              tone="partner"
            />
            <ConnectionFeature
              label="Best partner"
              summary={data.partners.bestWinRate}
              communityId={communityId}
              tone="partner"
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function MatchTimelineCard({
  match,
  userName,
  communityId,
}: {
  match: PlayerProfileMatchHistoryEntry;
  userName: string;
  communityId: string;
}) {
  return (
    <article className="app-subcard p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base sm:text-lg">
            <ProfileLink href={getSessionHistoryHref(match.sessionCode)}>
              {match.sessionName}
            </ProfileLink>
          </div>
          <p className="mt-1 text-xs text-gray-600 sm:text-sm">
            {formatDateTime(match.date)}
          </p>
        </div>
        <span className={getResultChipClass(match.result)}>
          {getResultLabel(match.result)}
        </span>
      </div>

      <div className="mt-3 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface-muted)] px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="min-w-0 space-y-1 text-sm text-gray-700">
          <p className="min-w-0">
            <span className="text-gray-500">With </span>
            <span className="font-semibold text-gray-900">{userName}</span>
            <span> &amp; </span>
            <ProfileLink href={getPlayerProfileHref(match.partner.id, communityId)}>
              {match.partner.name}
            </ProfileLink>
          </p>
          <p className="min-w-0">
            <span className="text-gray-500">vs </span>
            {match.opponents.map((opponent, index) => (
              <span key={opponent.id}>
                <ProfileLink href={getPlayerProfileHref(opponent.id, communityId)}>
                  {opponent.name}
                </ProfileLink>
                {index === match.opponents.length - 1 ? null : " & "}
              </span>
            ))}
          </p>
        </div>

        <div className="w-fit rounded-full bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-sm">
          {match.score}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="app-chip app-chip-neutral">
          Diff {formatSignedNumber(match.pointDifferential)}
        </span>
        {typeof match.eloChange === "number" ? (
          <span
            className={
              match.eloChange >= 0
                ? "app-chip app-chip-success"
                : "app-chip app-chip-danger"
            }
          >
            {formatSignedNumber(match.eloChange)} rating
          </span>
        ) : null}
      </div>
    </article>
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
  const trendDirectionLabel = getTrendDirectionLabel(data.trend.direction);
  const rankContext = data.context?.rankContext ?? null;

  return (
    <main className="app-page">
      <div
        className="app-shell space-y-5 sm:space-y-6"
      >
        <ProfileHeader
          data={data}
          rankContext={rankContext}
          recentFormSummary={recentFormSummary}
          recentStreakSummary={recentStreakSummary}
          onBack={handleBack}
        />

        <RelationshipSection data={data} communityId={communityId} />

        <SectionCard
          eyebrow="Form"
          title="Momentum and sessions"
          description="Recent form, rating movement, and the sessions behind the profile."
          action={
            <span className="app-chip app-chip-neutral">
              {data.recentSessions.length} session window
            </span>
          }
        >
          <div className="grid gap-3 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="app-subcard p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="app-eyebrow">Recent form</p>
                  <h3 className="mt-1 text-xl font-semibold text-gray-900">
                    {recentFormSummary}
                  </h3>
                </div>
                <span className={getTrendDirectionChipClass(data.trend.direction)}>
                  {trendDirectionLabel}
                </span>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <MiniFact
                  label="Point swing"
                  value={formatSignedNumber(data.recentForm.pointDifferential)}
                  detail={`Rating ${formatSignedNumber(data.recentForm.ratingChange)}`}
                />
                <MiniFact
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
              </div>
            </div>

            <div className="app-subcard p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="app-eyebrow">Recent sessions</p>
                  <h3 className="mt-1 text-xl font-semibold text-gray-900">
                    Last completed sessions
                  </h3>
                </div>
                <span className="app-chip app-chip-neutral">
                  {data.trend.matches} matches
                </span>
              </div>

              {data.recentSessions.length === 0 ? (
                <EmptyState
                  title="No recent sessions yet"
                  detail="Complete a few matches and the momentum view will start filling in."
                  className="mt-4 py-6"
                />
              ) : (
                <div className="mt-4 grid gap-3 sm:-mx-1 sm:flex sm:snap-x sm:overflow-x-auto sm:px-1 sm:pb-1">
                  {data.recentSessions.map((recentSession) => (
                    <RecentSessionTile
                      key={recentSession.id}
                      summary={recentSession}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MiniFact
              label="Trend window"
              value={
                data.trend.sessions > 0
                  ? `${data.trend.wins}-${data.trend.losses}, ${data.trend.winRate}%`
                  : "No window yet"
              }
              detail={
                data.trend.sessions > 0
                  ? `${formatSignedNumber(data.trend.ratingChange)} rating, ${formatSignedNumber(data.trend.pointDifferential)} diff over ${data.trend.sessions} sessions`
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
                <MatchTimelineCard
                  key={match.id}
                  match={match}
                  userName={data.user.name}
                  communityId={communityId}
                />
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
