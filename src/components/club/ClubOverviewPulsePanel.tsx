"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Flame,
  Heart,
  Newspaper,
  TrendingUp,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { getSessionTypeLabel } from "@/lib/sessionModeLabels";
import type { ClubPagePulse, ClubPageSession } from "./clubTypes";

interface ClubOverviewPulsePanelProps {
  clubId: string;
  clubPulse: ClubPagePulse | null;
  activeTournaments: ClubPageSession[];
  currentUserId?: string | null;
  onJoinTournament: (code: string) => void;
  onOpenTournament: (code: string) => void;
  onOpenTournaments: () => void;
  onOpenPlayerProfile: (playerId: string) => void;
}

type OverviewPlayerPair = ClubPagePulse["rivalries"][number]["players"];
type NewsItem = ClubPagePulse["sessionNews"][number];

function formatDate(value: string | null) {
  if (!value) return "No date";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatSigned(value: number) {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function formatScore(
  team1Score: number | null,
  team2Score: number | null
) {
  if (team1Score === null || team2Score === null) return "-";
  return `${team1Score}-${team2Score}`;
}

function getRecord(wins: number, losses: number) {
  return `${wins}W/${losses}L`;
}

function getTeamNames(players: Array<{ name: string }>) {
  return players.map((player) => player.name).join(" / ");
}

function isTournamentParticipant(
  tournament: ClubPageSession,
  currentUserId?: string | null
) {
  return tournament.players.some((player) => player.user.id === currentUserId);
}

function SectionHeader({
  icon,
  title,
  action,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="text-gray-900">{icon}</span>
        <h3 className="truncate text-xl font-semibold tracking-normal text-gray-950">
          {title}
        </h3>
      </div>
      {action}
    </div>
  );
}

function ViewAllButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--accent-strong)] transition hover:text-[var(--accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      View all
      <ChevronRight aria-hidden="true" size={16} />
    </button>
  );
}

function EmptyPulseState({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-5 text-center text-sm font-medium text-gray-500">
      {children}
    </div>
  );
}

function PulseMetric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="min-h-20 border-r border-[var(--line)] px-3 py-3 text-center last:border-r-0">
      <div className="mx-auto mb-1 flex h-6 w-6 items-center justify-center text-gray-900">
        {icon}
      </div>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-semibold leading-tight text-gray-950">
        {value}
      </p>
    </div>
  );
}

function PartnerPairAvatars({ players }: { players: OverviewPlayerPair }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
      <Avatar
        name={players[0].name}
        avatarUrl={players[0].avatarUrl}
        size="sm"
        className="ring-2 ring-white"
      />
      <span className="text-sm font-medium text-gray-400">+</span>
      <Avatar
        name={players[1].name}
        avatarUrl={players[1].avatarUrl}
        size="sm"
        className="ring-2 ring-white"
      />
    </div>
  );
}

function OverviewModal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-8"
      onClick={onClose}
      role="presentation"
    >
      <section
        className="grid max-h-[min(34rem,82vh)] w-full max-w-md overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_24px_60px_rgba(23,32,31,0.22)]"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex min-h-12 items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-2">
          <h3 className="text-base font-semibold text-gray-950">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition hover:bg-[var(--surface-muted)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            aria-label="Close"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="min-h-0 overflow-y-auto">{children}</div>
      </section>
    </div>
  );
}

function NewsLikeButton({
  item,
  disabled,
  onToggle,
}: {
  item: NewsItem;
  disabled: boolean;
  onToggle: (item: NewsItem) => void;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggle(item);
      }}
      disabled={disabled}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-60 ${
        item.likedByMe
          ? "border-red-100 bg-red-50 text-red-600 hover:bg-red-100"
          : "border-[var(--line)] bg-white text-gray-500 hover:border-red-100 hover:text-red-600"
      }`}
      aria-label={item.likedByMe ? "Unlike news" : "Like news"}
    >
      <Heart
        aria-hidden="true"
        size={16}
        fill={item.likedByMe ? "currentColor" : "none"}
      />
      {item.likeCount}
    </button>
  );
}

function NewsRow({
  item,
  disabled,
  onToggle,
}: {
  item: NewsItem;
  disabled: boolean;
  onToggle: (item: NewsItem) => void;
}) {
  const primaryPlayer = item.players[0] ?? null;

  return (
    <div className="grid min-h-20 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--line)] px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        {primaryPlayer ? (
          <Avatar
            name={primaryPlayer.name}
            avatarUrl={primaryPlayer.avatarUrl}
            size="sm"
          />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent-faint)] text-[var(--accent-strong)]">
            <Newspaper aria-hidden="true" size={18} />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-950">
            {item.title}
          </p>
          <p className="mt-0.5 text-xs font-medium text-gray-500">
            {item.detail}
          </p>
          <p className="mt-1 text-sm font-semibold text-[var(--accent-strong)]">
            {item.value}
          </p>
        </div>
      </div>
      <NewsLikeButton item={item} disabled={disabled} onToggle={onToggle} />
    </div>
  );
}

function getRivalryDisplay(rivalry: ClubPagePulse["rivalries"][number]) {
  if (rivalry.playerTwoWins > rivalry.playerOneWins) {
    return {
      leftPlayer: rivalry.players[1],
      rightPlayer: rivalry.players[0],
      score: `${rivalry.playerTwoWins} - ${rivalry.playerOneWins}`,
    };
  }

  return {
    leftPlayer: rivalry.players[0],
    rightPlayer: rivalry.players[1],
    score: `${rivalry.playerOneWins} - ${rivalry.playerTwoWins}`,
  };
}

export function ClubOverviewPulsePanel({
  clubId,
  clubPulse,
  activeTournaments,
  currentUserId,
  onJoinTournament,
  onOpenTournament,
  onOpenTournaments,
  onOpenPlayerProfile,
}: ClubOverviewPulsePanelProps) {
  const metrics = clubPulse?.metrics ?? {
    members: 0,
    activeTournaments: activeTournaments.length,
    completedTournaments: 0,
    recentMatches: 0,
    activePlayers: 0,
    totalMatches: 0,
    totalSessions: activeTournaments.length,
    lastPlayedAt: null,
  };
  const currentTournaments = activeTournaments.slice(0, 3);
  const hotPlayers = clubPulse?.hotPlayers ?? [];
  const ratingMovers = clubPulse?.ratingMovers ?? [];
  const rivalries = clubPulse?.rivalries ?? [];
  const partnerships = clubPulse?.partnerships ?? [];
  const recentMatches = clubPulse?.recentMatches ?? [];
  const latestStory = clubPulse?.latestStory ?? null;
  const [sessionNews, setSessionNews] = useState<NewsItem[]>(
    clubPulse?.sessionNews ?? []
  );
  const [openModal, setOpenModal] = useState<
    "news" | "rivalries" | "partnerships" | null
  >(null);
  const [pendingLikeIds, setPendingLikeIds] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    setSessionNews(clubPulse?.sessionNews ?? []);
  }, [clubPulse?.sessionNews]);

  const previewNews = sessionNews.slice(0, 3);
  const previewRivalries = rivalries.slice(0, 3);
  const previewPartnerships = partnerships.slice(0, 3);
  const shouldShowEmptyNews =
    sessionNews.length === 0 && metrics.totalMatches === 0;

  const updateNewsItem = (newsItemId: string, next: Partial<NewsItem>) => {
    setSessionNews((items) =>
      items.map((item) =>
        item.id === newsItemId
          ? {
              ...item,
              ...next,
            }
          : item
      )
    );
  };

  const toggleNewsLike = async (item: NewsItem) => {
    if (!currentUserId || pendingLikeIds.has(item.id)) return;

    const nextLiked = !item.likedByMe;
    const previousLiked = item.likedByMe;
    const previousCount = item.likeCount;

    updateNewsItem(item.id, {
      likedByMe: nextLiked,
      likeCount: Math.max(0, item.likeCount + (nextLiked ? 1 : -1)),
    });
    setPendingLikeIds((ids) => new Set(ids).add(item.id));

    try {
      const response = await fetch(`/api/clubs/${clubId}/news-likes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newsItemId: item.id,
          liked: nextLiked,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Failed to update like");
      }

      updateNewsItem(item.id, {
        likedByMe: Boolean(data.likedByMe),
        likeCount:
          typeof data.likeCount === "number" ? data.likeCount : previousCount,
      });
    } catch {
      updateNewsItem(item.id, {
        likedByMe: previousLiked,
        likeCount: previousCount,
      });
    } finally {
      setPendingLikeIds((ids) => {
        const next = new Set(ids);
        next.delete(item.id);
        return next;
      });
    }
  };

  const sessionCards = useMemo(
    () =>
      currentTournaments.map((tournament) => {
        const isParticipant = isTournamentParticipant(
          tournament,
          currentUserId
        );

        return (
          <article
            key={tournament.id}
            className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-[var(--line)] bg-white px-4 py-3 shadow-[0_12px_28px_rgba(23,32,31,0.04)]"
          >
            <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-[var(--accent)] text-white">
              <Trophy aria-hidden="true" size={29} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-gray-950">
                {tournament.name}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-gray-500">
                <span className="inline-flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                  {tournament.status}
                </span>
                <span>{tournament.players.length} players</span>
                <span>{getSessionTypeLabel(tournament.type)}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                isParticipant
                  ? onOpenTournament(tournament.code)
                  : onJoinTournament(tournament.code)
              }
              className="app-button-primary px-4 py-2 text-sm"
            >
              {isParticipant ? "Open" : "Join"}
              <ArrowRight aria-hidden="true" size={15} />
            </button>
          </article>
        );
      }),
    [
      currentTournaments,
      currentUserId,
      onJoinTournament,
      onOpenTournament,
    ]
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="space-y-2">
        {sessionCards.length > 0 ? (
          <>
            {sessionCards}
            {activeTournaments.length > currentTournaments.length ? (
              <button
                type="button"
                onClick={onOpenTournaments}
                className="app-button-secondary w-full justify-center px-4 py-2 text-sm"
              >
                View all sessions
              </button>
            ) : null}
          </>
        ) : (
          <div className="rounded-xl border border-[var(--line)] bg-white px-4 py-4 text-sm font-medium text-gray-500">
            No current tournament
          </div>
        )}
      </section>

      <section className="grid grid-cols-4 overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_14px_34px_rgba(23,32,31,0.06)]">
        <PulseMetric
          icon={<Users aria-hidden="true" size={18} />}
          label="Members"
          value={metrics.members}
        />
        <PulseMetric
          icon={<Trophy aria-hidden="true" size={18} />}
          label="Matches"
          value={metrics.totalMatches}
        />
        <PulseMetric
          icon={<CalendarDays aria-hidden="true" size={18} />}
          label="Sessions"
          value={metrics.totalSessions}
        />
        <PulseMetric
          icon={<Activity aria-hidden="true" size={18} />}
          label="Last played"
          value={metrics.lastPlayedAt ? formatDate(metrics.lastPlayedAt) : "-"}
        />
      </section>

      {sessionNews.length > 0 || shouldShowEmptyNews ? (
        <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_14px_34px_rgba(23,32,31,0.06)]">
          <SectionHeader
            icon={<Newspaper aria-hidden="true" size={28} />}
            title="Session news"
            action={
              sessionNews.length > 0 ? (
                <ViewAllButton onClick={() => setOpenModal("news")} />
              ) : null
            }
          />
          {previewNews.length > 0 ? (
            <div>
              {previewNews.map((item) => (
                <NewsRow
                  key={item.id}
                  item={item}
                  disabled={pendingLikeIds.has(item.id)}
                  onToggle={toggleNewsLike}
                />
              ))}
            </div>
          ) : (
            <EmptyPulseState>No session news yet</EmptyPulseState>
          )}
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_14px_34px_rgba(23,32,31,0.06)]">
          <SectionHeader
            icon={<Flame aria-hidden="true" size={28} />}
            title="In form"
          />
          {hotPlayers.length > 0 ? (
            <div>
              {hotPlayers.slice(0, 3).map((player, index) => (
                <button
                  key={player.user.id}
                  type="button"
                  onClick={() => onOpenPlayerProfile(player.user.id)}
                  className="grid min-h-20 w-full grid-cols-[2rem_3rem_minmax(0,1fr)_auto_1.5rem] items-center gap-3 border-b border-[var(--line)] px-4 py-3 text-left transition last:border-b-0 hover:bg-[rgba(15,118,110,0.045)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]"
                >
                  <span className="text-lg font-semibold text-[var(--accent-strong)]">
                    {index + 1}
                  </span>
                  <Avatar
                    name={player.user.name}
                    avatarUrl={player.user.avatarUrl}
                    size="sm"
                  />
                  <span className="min-w-0 truncate text-sm font-medium text-gray-950">
                    {player.user.name}
                  </span>
                  <span className="grid grid-cols-[4.2rem_4.2rem] gap-2 text-right">
                    <span>
                      <span className="block text-xs font-medium text-gray-500">
                        Win rate
                      </span>
                      <span className="block text-sm font-semibold text-[var(--accent-strong)]">
                        {player.winRate}%
                      </span>
                    </span>
                    <span>
                      <span className="block text-xs font-medium text-gray-500">
                        W/L
                      </span>
                      <span className="block text-sm font-semibold text-[var(--accent-strong)]">
                        {getRecord(player.wins, player.losses)}
                      </span>
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" size={18} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyPulseState>No form data yet</EmptyPulseState>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_14px_34px_rgba(23,32,31,0.06)]">
          <SectionHeader
            icon={<TrendingUp aria-hidden="true" size={28} />}
            title="Rating movers"
          />
          {ratingMovers.length > 0 ? (
            <div>
              {ratingMovers.map((player, index) => (
                <button
                  key={player.user.id}
                  type="button"
                  onClick={() => onOpenPlayerProfile(player.user.id)}
                  className="grid min-h-20 w-full grid-cols-[2rem_3rem_minmax(0,1fr)_auto_1.5rem] items-center gap-3 border-b border-[var(--line)] px-4 py-3 text-left transition last:border-b-0 hover:bg-[rgba(15,118,110,0.045)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]"
                >
                  <span className="text-lg font-semibold text-[var(--accent-strong)]">
                    {index + 1}
                  </span>
                  <Avatar
                    name={player.user.name}
                    avatarUrl={player.user.avatarUrl}
                    size="sm"
                  />
                  <span className="min-w-0 truncate text-sm font-medium text-gray-950">
                    {player.user.name}
                  </span>
                  <span className="text-lg font-semibold text-[var(--accent-strong)]">
                    {formatSigned(player.ratingChange)}
                  </span>
                  <ChevronRight aria-hidden="true" size={18} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyPulseState>No rating movers yet</EmptyPulseState>
          )}
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_14px_34px_rgba(23,32,31,0.06)]">
        <SectionHeader
          icon={<CalendarDays aria-hidden="true" size={28} />}
          title="Latest session"
          action={
            latestStory ? (
              <button
                type="button"
                onClick={() => onOpenTournament(latestStory.session.code)}
                className="app-button-primary px-4 py-2 text-sm"
              >
                Results
                <ArrowRight aria-hidden="true" size={15} />
              </button>
            ) : null
          }
        />
        {latestStory ? (
          <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-4 px-4 py-4 sm:grid-cols-[4rem_minmax(0,1fr)_auto]">
            <span className="flex h-16 w-16 items-center justify-center rounded-xl bg-[var(--accent)] text-white">
              <Trophy aria-hidden="true" size={34} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xl font-semibold text-gray-950">
                {latestStory.session.name}
              </p>
              <p className="mt-1 text-sm font-medium text-gray-500">
                {formatDate(latestStory.session.date)}
              </p>
              {latestStory.topPerformer ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenPlayerProfile(latestStory.topPerformer!.user.id)
                  }
                  className="mt-2 inline-flex max-w-full items-center gap-2 text-sm font-medium text-gray-600 transition hover:text-[var(--accent-strong)]"
                >
                  <span>MVP</span>
                  <Avatar
                    name={latestStory.topPerformer.user.name}
                    avatarUrl={latestStory.topPerformer.user.avatarUrl}
                    size="match"
                  />
                  <span className="truncate">
                    {latestStory.topPerformer.user.name}
                  </span>
                  <span className="shrink-0 text-[var(--accent-strong)]">
                    {formatSigned(latestStory.topPerformer.ratingChange)} rating
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <EmptyPulseState>No completed session yet</EmptyPulseState>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_14px_34px_rgba(23,32,31,0.06)]">
          <SectionHeader
            icon={<Trophy aria-hidden="true" size={28} />}
            title="Top rivalry"
            action={
              rivalries.length > 0 ? (
                <ViewAllButton onClick={() => setOpenModal("rivalries")} />
              ) : null
            }
          />
          {previewRivalries.length > 0 ? (
            <div>
              {previewRivalries.map((rivalry, index) => {
                const display = getRivalryDisplay(rivalry);

                return (
                  <button
                    key={`${rivalry.players[0].id}:${rivalry.players[1].id}`}
                    type="button"
                    onClick={() => setOpenModal("rivalries")}
                    className="grid min-h-20 w-full grid-cols-[2rem_minmax(0,1fr)_4.2rem_minmax(0,1fr)_1.5rem] items-center gap-2 border-b border-[var(--line)] px-4 py-3 text-left transition last:border-b-0 hover:bg-[rgba(15,118,110,0.045)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]"
                  >
                    <span className="text-lg font-semibold text-[var(--accent-strong)]">
                      {index + 1}
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      <Avatar
                        name={display.leftPlayer.name}
                        avatarUrl={display.leftPlayer.avatarUrl}
                        size="sm"
                      />
                      <span className="min-w-0 truncate text-sm font-medium text-gray-950">
                        {display.leftPlayer.name}
                      </span>
                    </span>
                    <span className="text-center text-xl font-semibold text-[var(--accent-strong)]">
                      {display.score}
                    </span>
                    <span className="flex min-w-0 items-center justify-end gap-2">
                      <span className="min-w-0 truncate text-right text-sm font-medium text-gray-950">
                        {display.rightPlayer.name}
                      </span>
                      <Avatar
                        name={display.rightPlayer.name}
                        avatarUrl={display.rightPlayer.avatarUrl}
                        size="sm"
                      />
                    </span>
                    <ChevronRight aria-hidden="true" size={18} />
                  </button>
                );
              })}
            </div>
          ) : (
            <EmptyPulseState>No rivalry data yet</EmptyPulseState>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_14px_34px_rgba(23,32,31,0.06)]">
          <SectionHeader
            icon={<Users aria-hidden="true" size={28} />}
            title="Partner chemistry"
            action={
              partnerships.length > 0 ? (
                <ViewAllButton onClick={() => setOpenModal("partnerships")} />
              ) : null
            }
          />
          {previewPartnerships.length > 0 ? (
            <div>
              {previewPartnerships.map((partnership, index) => (
                <button
                  key={`${partnership.players[0].id}:${partnership.players[1].id}`}
                  type="button"
                  onClick={() => setOpenModal("partnerships")}
                  className="grid min-h-20 w-full grid-cols-[2rem_auto_minmax(0,1fr)_auto_1.5rem] items-center gap-3 border-b border-[var(--line)] px-4 py-3 text-left transition last:border-b-0 hover:bg-[rgba(15,118,110,0.045)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]"
                >
                  <span className="text-lg font-semibold text-[var(--accent-strong)]">
                    {index + 1}
                  </span>
                  <PartnerPairAvatars players={partnership.players} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-gray-950">
                      {partnership.players[0].name}
                    </span>
                    <span className="block truncate text-sm font-medium text-gray-500">
                      + {partnership.players[1].name}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-lg font-semibold text-[var(--accent-strong)]">
                      {getRecord(partnership.wins, partnership.losses)}
                    </span>
                    <span className="block text-xs font-medium text-gray-500">
                      {partnership.winRate}%
                    </span>
                  </span>
                  <ChevronRight aria-hidden="true" size={18} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyPulseState>No partner data yet</EmptyPulseState>
          )}
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_14px_34px_rgba(23,32,31,0.06)]">
        <SectionHeader
          icon={<CalendarDays aria-hidden="true" size={28} />}
          title="Recent matches"
        />
        {recentMatches.length > 0 ? (
          <div>
            {recentMatches.slice(0, 5).map((match) => (
              <button
                key={match.id}
                type="button"
                onClick={() => onOpenTournament(match.session.code)}
                className="grid min-h-20 w-full grid-cols-[4.8rem_minmax(0,1fr)_4rem_minmax(0,1fr)_1.5rem] items-center gap-2 border-b border-[var(--line)] px-4 py-3 text-left transition last:border-b-0 hover:bg-[rgba(15,118,110,0.045)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-gray-950">
                    {formatDate(match.completedAt)}
                  </span>
                  <span className="block truncate text-sm font-medium text-gray-500">
                    {match.session.name}
                  </span>
                </span>
                <span className="min-w-0 truncate text-sm font-medium text-gray-600">
                  {getTeamNames(match.team1)}
                </span>
                <span className="text-center text-lg font-semibold text-[var(--accent-strong)]">
                  {formatScore(match.team1Score, match.team2Score)}
                </span>
                <span className="min-w-0 truncate text-sm font-medium text-gray-950">
                  {getTeamNames(match.team2)}
                </span>
                <ChevronRight aria-hidden="true" size={18} />
              </button>
            ))}
          </div>
        ) : (
          <EmptyPulseState>No matches yet</EmptyPulseState>
        )}
      </section>

      {openModal === "news" ? (
        <OverviewModal title="Session news" onClose={() => setOpenModal(null)}>
          {sessionNews.map((item) => (
            <NewsRow
              key={item.id}
              item={item}
              disabled={pendingLikeIds.has(item.id)}
              onToggle={toggleNewsLike}
            />
          ))}
        </OverviewModal>
      ) : null}

      {openModal === "rivalries" ? (
        <OverviewModal title="Top rivalry" onClose={() => setOpenModal(null)}>
          {rivalries.map((rivalry, index) => {
            const display = getRivalryDisplay(rivalry);
            return (
              <div
                key={`${rivalry.players[0].id}:${rivalry.players[1].id}`}
                className="grid min-h-20 grid-cols-[2rem_minmax(0,1fr)_4.2rem_minmax(0,1fr)] items-center gap-2 border-b border-[var(--line)] px-4 py-3 last:border-b-0"
              >
                <span className="text-lg font-semibold text-[var(--accent-strong)]">
                  {index + 1}
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar
                    name={display.leftPlayer.name}
                    avatarUrl={display.leftPlayer.avatarUrl}
                    size="sm"
                  />
                  <span className="min-w-0 truncate text-sm font-medium text-gray-950">
                    {display.leftPlayer.name}
                  </span>
                </span>
                <span className="text-center text-xl font-semibold text-[var(--accent-strong)]">
                  {display.score}
                </span>
                <span className="flex min-w-0 items-center justify-end gap-2">
                  <span className="min-w-0 truncate text-right text-sm font-medium text-gray-950">
                    {display.rightPlayer.name}
                  </span>
                  <Avatar
                    name={display.rightPlayer.name}
                    avatarUrl={display.rightPlayer.avatarUrl}
                    size="sm"
                  />
                </span>
              </div>
            );
          })}
        </OverviewModal>
      ) : null}

      {openModal === "partnerships" ? (
        <OverviewModal
          title="Partner chemistry"
          onClose={() => setOpenModal(null)}
        >
          {partnerships.map((partnership, index) => (
            <div
              key={`${partnership.players[0].id}:${partnership.players[1].id}`}
              className="grid min-h-20 grid-cols-[2rem_auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--line)] px-4 py-3 last:border-b-0"
            >
              <span className="text-lg font-semibold text-[var(--accent-strong)]">
                {index + 1}
              </span>
              <PartnerPairAvatars players={partnership.players} />
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-gray-950">
                  {partnership.players[0].name}
                </span>
                <span className="block truncate text-sm font-medium text-gray-500">
                  + {partnership.players[1].name}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-lg font-semibold text-[var(--accent-strong)]">
                  {getRecord(partnership.wins, partnership.losses)}
                </span>
                <span className="block text-xs font-medium text-gray-500">
                  {partnership.winRate}%
                </span>
              </span>
            </div>
          ))}
        </OverviewModal>
      ) : null}
    </div>
  );
}
