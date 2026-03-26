"use client";

import { SessionStatus } from "@/types/enums";
import { StatCard } from "@/components/ui/chrome";

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
  const isCompleted = sessionStatus === SessionStatus.COMPLETED;
  const isWaiting = sessionStatus === SessionStatus.WAITING;
  const statusChipClass = isCompleted
    ? "app-chip-success"
    : isWaiting
      ? "app-chip-warning"
      : "app-chip-accent";
  const statusCardValue = isCompleted ? (
    <span className="text-lg font-semibold leading-tight tracking-tight sm:text-2xl">
      Completed
    </span>
  ) : isWaiting ? (
    "Waiting"
  ) : sessionStatus === SessionStatus.ACTIVE ? (
    "Active"
  ) : (
    sessionStatus
  );

  return (
    <section className="app-panel p-5 sm:p-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="app-eyebrow">
            {isCompleted
              ? "Completed session"
              : isWaiting
                ? "Ready to start"
                : "Live session"}
          </p>
          <span className={`app-chip ${statusChipClass}`}>{sessionStatus}</span>
          <span className="app-chip app-chip-neutral">{sessionTypeLabel}</span>
          <span className="app-chip app-chip-neutral">{sessionModeLabel}</span>
        </div>

        <div className="flex flex-wrap gap-3 xl:max-w-[28rem] xl:justify-end">
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
          <button
            type="button"
            onClick={onOpenMatchHistory}
            className="app-button-secondary"
          >
            Match History
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Players" value={playersCount} accent />
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
          value={statusCardValue}
        />
      </div>
    </section>
  );
}
