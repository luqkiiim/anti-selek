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
        meta={
          <>
            <span className="app-chip app-chip-neutral">{sessionTypeLabel}</span>
            <span className="app-chip app-chip-neutral">{sessionModeLabel}</span>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Players"
          value={playersCount}
          detail={`${guestPlayersCount} guests`}
          accent
        />
        <StatCard
          label="Active courts"
          value={activeMatchesCount}
        />
        <StatCard
          label="Paused"
          value={pausedPlayersCount}
        />
        <StatCard
          label="Status"
          value={sessionStatus}
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
