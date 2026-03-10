"use client";

import { HeroCard, StatCard } from "@/components/ui/chrome";

interface SessionOverviewPanelProps {
  sessionTypeLabel: string;
  sessionModeLabel: string;
  playersCount: number;
  guestPlayersCount: number;
  activeMatchesCount: number;
  completedMatchesCount: number;
  pausedPlayersCount: number;
  sessionStatus: string;
  canStartSession: boolean;
  canEndSession: boolean;
  canOpenRoster: boolean;
  onStartSession: () => void;
  onOpenRoster: () => void;
  onEndSession: () => void;
  onOpenMatchHistory: () => void;
}

export function SessionOverviewPanel({
  sessionTypeLabel,
  sessionModeLabel,
  playersCount,
  guestPlayersCount,
  activeMatchesCount,
  completedMatchesCount,
  pausedPlayersCount,
  sessionStatus,
  canStartSession,
  canEndSession,
  canOpenRoster,
  onStartSession,
  onOpenRoster,
  onEndSession,
  onOpenMatchHistory,
}: SessionOverviewPanelProps) {
  const isCompleted = sessionStatus === "COMPLETED";

  return (
    <>
      <HeroCard
        eyebrow={isCompleted ? "Completed session" : "Live session"}
        actionsPosition="below"
        meta={
          <>
            <span className="app-chip app-chip-neutral">{sessionTypeLabel}</span>
            <span className="app-chip app-chip-neutral">{sessionModeLabel}</span>
          </>
        }
        actions={
          <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap gap-3">
              {canStartSession ? (
                <button type="button" onClick={onStartSession} className="app-button-primary">
                  Start Session
                </button>
              ) : null}
              {canEndSession ? (
                <button type="button" onClick={onEndSession} className="app-button-danger">
                  End Session
                </button>
              ) : null}
              {canOpenRoster ? (
                <button type="button" onClick={onOpenRoster} className="app-button-secondary">
                  Add Players
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onOpenMatchHistory}
              className="app-button-secondary sm:ml-auto"
            >
              Match History
            </button>
          </div>
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
          label={isCompleted ? "Matches" : "Active courts"}
          value={isCompleted ? completedMatchesCount : activeMatchesCount}
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
    </>
  );
}
