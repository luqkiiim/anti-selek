"use client";

import { HeroCard, StatCard } from "@/components/ui/chrome";

interface SessionOverviewPanelProps {
  sessionName: string;
  sessionTypeLabel: string;
  sessionModeLabel: string;
  playersCount: number;
  guestPlayersCount: number;
  activeMatchesCount: number;
  courtCount: number;
  pausedPlayersCount: number;
  sessionStatus: string;
  isRatingsSession: boolean;
  isAdmin: boolean;
  canStartSession: boolean;
  canEndSession: boolean;
  onStartSession: () => void;
  onOpenRoster: () => void;
  onEndSession: () => void;
}

export function SessionOverviewPanel({
  sessionName,
  sessionTypeLabel,
  sessionModeLabel,
  playersCount,
  guestPlayersCount,
  activeMatchesCount,
  courtCount,
  pausedPlayersCount,
  sessionStatus,
  isRatingsSession,
  isAdmin,
  canStartSession,
  canEndSession,
  onStartSession,
  onOpenRoster,
  onEndSession,
}: SessionOverviewPanelProps) {
  return (
    <>
      <HeroCard
        eyebrow="Live session"
        title={sessionName}
        description="Manage courts, keep the player pool moving, and review standings from a single session board designed for court-side use."
        meta={
          <>
            <span className="app-chip app-chip-neutral">{sessionTypeLabel}</span>
            <span className="app-chip app-chip-neutral">{sessionModeLabel}</span>
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Players"
          value={playersCount}
          detail={`${guestPlayersCount} guests`}
          accent
        />
        <StatCard
          label="Active courts"
          value={activeMatchesCount}
          detail={`${courtCount} total courts`}
        />
        <StatCard
          label="Paused"
          value={pausedPlayersCount}
          detail={pausedPlayersCount > 0 ? "Temporarily out of rotation" : "Everyone ready"}
        />
        <StatCard
          label="Status"
          value={sessionStatus}
          detail={isRatingsSession ? "Points standings with rating updates" : "Points race"}
        />
      </section>

      {isAdmin ? (
        <div className="app-panel flex flex-wrap gap-3 p-4">
          {canStartSession ? (
            <button type="button" onClick={onStartSession} className="app-button-primary">
              Start Session
            </button>
          ) : null}
          <button type="button" onClick={onOpenRoster} className="app-button-secondary">
            Add Players
          </button>
          {canEndSession ? (
            <button type="button" onClick={onEndSession} className="app-button-danger">
              End Session
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
