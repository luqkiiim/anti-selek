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
  canOpenPlayerManager: boolean;
  canOpenSettings: boolean;
  onStartSession: () => void;
  onOpenPlayerManager: () => void;
  onOpenSettings: () => void;
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
  canOpenPlayerManager,
  canOpenSettings,
  onStartSession,
  onOpenPlayerManager,
  onOpenSettings,
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
          <p className="app-section-eyebrow">
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
          {canOpenSettings ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="app-button-secondary"
            >
              Settings
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpenMatchHistory}
            className="app-button-secondary"
          >
            Match History
          </button>
          {canOpenPlayerManager ? (
            <button
              type="button"
              onClick={onOpenPlayerManager}
              className="app-button-secondary ml-auto"
            >
              Players
            </button>
          ) : null}
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
