"use client";

import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Flame,
  Medal,
  Play,
  Swords,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { getSessionTypeLabel } from "@/lib/sessionModeLabels";
import type {
  CommunityPageMember,
  CommunityPagePulse,
  CommunityPageSession,
} from "./communityTypes";

interface CommunityOverviewPulsePanelProps {
  communityPulse: CommunityPagePulse | null;
  activeTournaments: CommunityPageSession[];
  leaderboardPreview: CommunityPageMember[];
  currentUserId?: string | null;
  onJoinTournament: (code: string) => void;
  onOpenTournament: (code: string) => void;
  onOpenLeaderboard: () => void;
  onOpenTournaments: () => void;
  onOpenPlayerProfile: (playerId: string) => void;
}

type OverviewPlayerPair = CommunityPagePulse["rivalries"][number]["players"];

function formatDate(value: string | null) {
  if (!value) return "No date";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatGameCount(value: number) {
  return `${value} ${value === 1 ? "game" : "games"}`;
}

function formatSigned(value: number) {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

function getCompactPlayerName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  return parts[0] ?? name;
}

function getHotPlayerDetail(player: CommunityPagePulse["hotPlayers"][number]) {
  if (
    player.currentStreak.result === "WIN" &&
    player.currentStreak.count >= 2
  ) {
    return `${player.currentStreak.count}-match win streak`;
  }

  if (player.ratingChange > 0) {
    return `${formatSigned(player.ratingChange)} rating`;
  }

  if (player.pointDifferential > 0) {
    return `${formatSigned(player.pointDifferential)} point diff`;
  }

  return `${player.wins}-${player.losses} recent`;
}

function getRivalryDisplay(rivalry: CommunityPagePulse["rivalries"][number]) {
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

function getPartnershipDetail(
  partnership: CommunityPagePulse["partnerships"][number]
) {
  return `${partnership.wins}-${partnership.losses} together`;
}

function isTournamentParticipant(
  tournament: CommunityPageSession,
  currentUserId?: string | null
) {
  return tournament.players.some((player) => player.user.id === currentUserId);
}

function SectionHeader({
  icon,
  title,
  detail,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] bg-[var(--accent-faint)] text-[var(--accent)]">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="app-section-eyebrow">{title}</h3>
          {detail ? (
            <p className="mt-1 text-xs font-semibold text-gray-500">
              {detail}
            </p>
          ) : null}
        </div>
      </div>
      {action}
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
    <div className="rounded-lg border border-[var(--line)] bg-white px-3 py-3">
      <div className="flex items-center gap-2 text-[var(--accent)]">
        {icon}
        <span className="text-xs font-semibold text-gray-500">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold leading-none text-gray-900">
        {value}
      </p>
    </div>
  );
}

function EmptyPulseState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--line-strong)] bg-[var(--surface-muted)] px-4 py-5 text-center text-sm font-semibold text-gray-500">
      {children}
    </div>
  );
}

function PartnerPairAvatars({ players }: { players: OverviewPlayerPair }) {
  return (
    <div className="flex shrink-0 -space-x-3" aria-hidden="true">
      {players.map((player) => (
        <Avatar
          key={player.id}
          name={player.name}
          avatarUrl={player.avatarUrl}
          size="md"
          className="ring-2 ring-white"
        />
      ))}
    </div>
  );
}

export function CommunityOverviewPulsePanel({
  communityPulse,
  activeTournaments,
  leaderboardPreview,
  currentUserId,
  onJoinTournament,
  onOpenTournament,
  onOpenLeaderboard,
  onOpenTournaments,
  onOpenPlayerProfile,
}: CommunityOverviewPulsePanelProps) {
  const metrics = communityPulse?.metrics ?? {
    members: 0,
    activeTournaments: activeTournaments.length,
    completedTournaments: 0,
    recentMatches: 0,
    activePlayers: 0,
  };
  const currentTournaments = activeTournaments.slice(0, 3);
  const topRankedPlayer = leaderboardPreview[0] ?? null;
  const hotPlayers = communityPulse?.hotPlayers ?? [];
  const rivalries = communityPulse?.rivalries ?? [];
  const partnerships = communityPulse?.partnerships ?? [];
  const latestStory = communityPulse?.latestStory ?? null;

  return (
    <div className="space-y-4 sm:space-y-6">
      <section className="app-panel space-y-5 p-5 sm:p-6">
        <SectionHeader
          icon={<Activity aria-hidden="true" size={20} />}
          title="Club pulse"
          detail="The competitive snapshot right now"
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <PulseMetric
            icon={<Users aria-hidden="true" size={15} />}
            label="Members"
            value={metrics.members}
          />
          <PulseMetric
            icon={<Activity aria-hidden="true" size={15} />}
            label="Recent players"
            value={metrics.activePlayers}
          />
          <PulseMetric
            icon={<Trophy aria-hidden="true" size={15} />}
            label="Finished"
            value={metrics.completedTournaments}
          />
          <PulseMetric
            icon={<TrendingUp aria-hidden="true" size={15} />}
            label="Recent games"
            value={metrics.recentMatches}
          />
        </div>
        {topRankedPlayer ? (
          <button
            type="button"
            onClick={() => onOpenPlayerProfile(topRankedPlayer.id)}
            className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-muted)] px-4 py-3 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(15,118,110,0.24)]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <Avatar
                name={topRankedPlayer.name}
                avatarUrl={topRankedPlayer.avatarUrl}
                size="md"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-500">
                  Current player to catch
                </p>
                <p className="mt-1 truncate text-sm font-semibold text-gray-900">
                  {topRankedPlayer.name}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-semibold text-gray-900">
                {topRankedPlayer.elo}
              </p>
              <p className="text-xs font-semibold text-[var(--accent)]">
                Rating
              </p>
            </div>
          </button>
        ) : null}
      </section>

      <section className="app-panel space-y-4 p-5 sm:p-6">
        <SectionHeader
          icon={<Play aria-hidden="true" size={20} />}
          title="Current tournament"
          detail="Open or running now"
          action={
            activeTournaments.length > 3 ? (
              <button
                type="button"
                onClick={onOpenTournaments}
                className="app-button-secondary px-3 py-2 text-sm"
              >
                View all
              </button>
            ) : null
          }
        />
        {currentTournaments.length > 0 ? (
          <div className="space-y-2">
            {currentTournaments.map((tournament) => {
              const isParticipant = isTournamentParticipant(
                tournament,
                currentUserId
              );
              return (
                <div
                  key={tournament.id}
                  className="rounded-lg border border-[var(--line)] bg-white px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {tournament.name}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-gray-500">
                        {tournament.players.length} players -{" "}
                        {getSessionTypeLabel(tournament.type)}
                      </p>
                    </div>
                    <span className="rounded-md bg-[var(--warning-soft)] px-2 py-1 text-xs font-semibold text-[var(--warning)]">
                      {tournament.status}
                    </span>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        isParticipant
                          ? onOpenTournament(tournament.code)
                          : onJoinTournament(tournament.code)
                      }
                      className={
                        isParticipant
                          ? "app-button-secondary px-4 py-2 text-sm"
                          : "app-button-primary px-4 py-2 text-sm"
                      }
                    >
                      {isParticipant ? "Open" : "Join"}
                      <ArrowRight aria-hidden="true" size={15} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyPulseState>No current tournament</EmptyPulseState>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3 lg:gap-6">
        <section className="app-panel space-y-4 p-5 sm:p-6">
          <SectionHeader
            icon={<Flame aria-hidden="true" size={20} />}
            title="Hot players"
            detail="Recent form leaders"
          />
          {hotPlayers.length > 0 ? (
            <div className="space-y-2">
              {hotPlayers.map((player, index) => (
                <button
                  key={player.user.id}
                  type="button"
                  onClick={() => onOpenPlayerProfile(player.user.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(15,118,110,0.24)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--success-soft)] text-sm font-semibold text-[var(--success)]">
                      {index + 1}
                    </span>
                    <Avatar
                      name={player.user.name}
                      avatarUrl={player.user.avatarUrl}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {player.user.name}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-gray-500">
                        {getHotPlayerDetail(player)}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-[var(--success)]">
                      {player.winRate}%
                    </p>
                    <p className="text-xs font-semibold text-gray-500">
                      {player.wins}-{player.losses}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyPulseState>
              Hot players appear after recent completed games
            </EmptyPulseState>
          )}
        </section>

        <section className="app-panel space-y-4 p-5 sm:p-6">
          <SectionHeader
            icon={<Swords aria-hidden="true" size={20} />}
            title="Top rivalry"
            detail="Repeated close matchups"
          />
          {rivalries.length > 0 ? (
            <div className="space-y-2">
              {rivalries.map((rivalry) => {
                const display = getRivalryDisplay(rivalry);

                return (
                  <div
                    key={`${rivalry.players[0].id}:${rivalry.players[1].id}`}
                    className="rounded-lg border border-[var(--line)] bg-white px-4 py-3"
                  >
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
                      <div className="min-w-0 text-center">
                        <div className="mx-auto flex w-fit max-w-full flex-col items-center gap-1.5">
                          <Avatar
                            name={display.leftPlayer.name}
                            avatarUrl={display.leftPlayer.avatarUrl}
                            size="md"
                            className="ring-2 ring-white"
                          />
                          <p
                            className="max-w-full truncate text-[12px] font-semibold text-gray-900 sm:text-sm"
                            title={display.leftPlayer.name}
                          >
                            {getCompactPlayerName(display.leftPlayer.name)}
                          </p>
                        </div>
                      </div>
                      <div className="min-w-[5.5rem] text-center sm:min-w-[6.5rem]">
                        <p className="text-2xl font-semibold leading-none text-gray-900 sm:text-3xl">
                          {display.score}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-gray-500">
                          {formatGameCount(rivalry.matches)}
                        </p>
                      </div>
                      <div className="min-w-0 text-center">
                        <div className="mx-auto flex w-fit max-w-full flex-col items-center gap-1.5">
                          <Avatar
                            name={display.rightPlayer.name}
                            avatarUrl={display.rightPlayer.avatarUrl}
                            size="md"
                            className="ring-2 ring-white"
                          />
                          <p
                            className="max-w-full truncate text-[12px] font-semibold text-gray-900 sm:text-sm"
                            title={display.rightPlayer.name}
                          >
                            {getCompactPlayerName(display.rightPlayer.name)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyPulseState>
              Top rivalries unlock after players face each other a few times
            </EmptyPulseState>
          )}
        </section>

        <section className="app-panel space-y-4 p-5 sm:p-6">
          <SectionHeader
            icon={<Users aria-hidden="true" size={20} />}
            title="Partner chemistry"
            detail="Duos with the strongest record together"
          />
          {partnerships.length > 0 ? (
            <div className="space-y-2">
              {partnerships.map((partnership) => (
                <div
                  key={`${partnership.players[0].id}:${partnership.players[1].id}`}
                  className="rounded-lg border border-[var(--line)] bg-white px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <PartnerPairAvatars players={partnership.players} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {partnership.players[0].name} &{" "}
                          {partnership.players[1].name}
                        </p>
                        <p className="mt-1 text-xs font-semibold text-gray-500">
                          {getPartnershipDetail(partnership)}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-[var(--success)]">
                        {partnership.winRate}%
                      </p>
                      <p className="text-xs font-semibold text-gray-500">
                        {formatGameCount(partnership.matches)}
                      </p>
                    </div>
                  </div>
                  {partnership.lastSession ? (
                    <p className="mt-3 truncate text-xs font-semibold text-gray-500">
                      Last teamed {formatDate(partnership.lastPlayedAt)} in{" "}
                      {partnership.lastSession.name}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <EmptyPulseState>
              Partner chemistry appears after duos play together a few times
            </EmptyPulseState>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
        <section className="app-panel space-y-4 p-5 sm:p-6">
          <SectionHeader
            icon={<Trophy aria-hidden="true" size={20} />}
            title="Latest story"
            detail="Most recent completed tournament"
            action={
              latestStory ? (
                <button
                  type="button"
                  onClick={() => onOpenTournament(latestStory.session.code)}
                  className="app-button-secondary px-3 py-2 text-sm"
                >
                  Results
                </button>
              ) : null
            }
          />
          {latestStory ? (
            <div className="rounded-lg border border-[var(--line)] bg-white px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-gray-900">
                    {latestStory.session.name}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-gray-500">
                    <CalendarDays aria-hidden="true" size={13} />
                    {formatDate(latestStory.session.date)}
                  </p>
                </div>
                <span className="rounded-md bg-[var(--surface-muted)] px-2 py-1 text-xs font-semibold text-gray-600">
                  {latestStory.matches} matches
                </span>
              </div>
              {latestStory.topPerformer ? (
                <button
                  type="button"
                  onClick={() =>
                    onOpenPlayerProfile(latestStory.topPerformer!.user.id)
                  }
                  className="mt-4 flex w-full items-center justify-between gap-3 rounded-lg bg-[var(--accent-faint)] px-4 py-2 text-left transition hover:bg-[var(--accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(15,118,110,0.24)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar
                      name={latestStory.topPerformer.user.name}
                      avatarUrl={latestStory.topPerformer.user.avatarUrl}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-500">
                        Standout player
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold text-gray-900">
                        {latestStory.topPerformer.user.name}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-[var(--success)]">
                      {latestStory.topPerformer.wins} wins
                    </p>
                    <p className="text-xs font-semibold text-gray-500">
                      {formatSigned(
                        latestStory.topPerformer.ratingChange
                      )}{" "}
                      rating
                    </p>
                  </div>
                </button>
              ) : (
                <p className="mt-4 text-sm font-semibold text-gray-500">
                  Finished with {latestStory.session.playerCount}{" "}
                  players.
                </p>
              )}
            </div>
          ) : (
            <EmptyPulseState>
              First tournament story appears after a completed session
            </EmptyPulseState>
          )}
        </section>

        <section className="app-panel space-y-4 p-5 sm:p-6">
          <SectionHeader
            icon={<Medal aria-hidden="true" size={20} />}
            title="Power rankings"
            detail="Top of the club table"
            action={
              <button
                type="button"
                onClick={onOpenLeaderboard}
                className="app-button-secondary px-3 py-2 text-sm"
              >
                Leaderboard
              </button>
            }
          />
          {leaderboardPreview.length > 0 ? (
            <div className="space-y-2">
              {leaderboardPreview.slice(0, 5).map((player, index) => (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => onOpenPlayerProfile(player.id)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-white px-4 py-2 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(15,118,110,0.24)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-7 shrink-0 text-xs font-semibold text-[var(--accent)]">
                      #{index + 1}
                    </span>
                    <Avatar name={player.name} avatarUrl={player.avatarUrl} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {player.name}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-gray-500">
                        W {player.wins} / L {player.losses}
                      </p>
                    </div>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-gray-900">
                    {player.elo}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <EmptyPulseState>Rankings appear after players join</EmptyPulseState>
          )}
        </section>
      </div>
    </div>
  );
}
