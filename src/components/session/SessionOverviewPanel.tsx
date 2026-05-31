"use client";

import { History, Play, Settings, Share2, Users } from "lucide-react";
import { SessionStatus } from "@/types/enums";
import { StatCard } from "@/components/ui/chrome";

interface SessionTutorialHint {
  title: string;
  detail: string;
}

interface SessionOverviewPanelProps {
  sessionTypeLabel: string;
  sessionModeLabel: string;
  isTestSession: boolean;
  playersCount: number;
  guestPlayersCount: number;
  activeMatchesCount: number;
  completedMatchesCount: number;
  pausedPlayersCount: number;
  sessionStatus: string;
  canStartSession: boolean;
  canOpenPlayerManager: boolean;
  canOpenSettings: boolean;
  canShareResults?: boolean;
  sharingResults?: boolean;
  tutorialHint?: SessionTutorialHint | null;
  onStartSession: () => void;
  onOpenPlayerManager: () => void;
  onOpenSettings: () => void;
  onOpenMatchHistory: () => void;
  onShareResults?: () => void;
}

export function SessionOverviewPanel({
  sessionTypeLabel,
  sessionModeLabel,
  isTestSession,
  playersCount,
  guestPlayersCount,
  activeMatchesCount,
  completedMatchesCount,
  pausedPlayersCount,
  sessionStatus,
  canStartSession,
  canOpenPlayerManager,
  canOpenSettings,
  canShareResults = false,
  sharingResults = false,
  tutorialHint = null,
  onStartSession,
  onOpenPlayerManager,
  onOpenSettings,
  onOpenMatchHistory,
  onShareResults,
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
    <section
      className="app-panel p-5 sm:p-6"
      data-tutorial-target="admin-onboarding-session-panel"
    >
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
          {isTestSession ? (
            <span className="app-chip border-amber-200 bg-amber-50 text-amber-700">
              Test Session
            </span>
          ) : null}
          <span className="app-chip app-chip-neutral">{sessionTypeLabel}</span>
          <span className="app-chip app-chip-neutral">{sessionModeLabel}</span>
        </div>

        <div className="flex flex-wrap gap-3 xl:max-w-[28rem] xl:justify-end">
          {canStartSession ? (
            <button
              type="button"
              onClick={onStartSession}
              className="app-button-primary"
              data-tutorial-target="admin-onboarding-start-session"
            >
              <Play aria-hidden="true" size={17} />
              Start Session
            </button>
          ) : null}
          {canOpenSettings ? (
            <button
              type="button"
              onClick={onOpenSettings}
              className="app-button-secondary"
              data-tutorial-target="admin-onboarding-end-session"
            >
              <Settings aria-hidden="true" size={17} />
              Settings
            </button>
          ) : null}
          <button
            type="button"
            onClick={onOpenMatchHistory}
            className="app-button-secondary"
          >
            <History aria-hidden="true" size={17} />
            Match History
          </button>
          {canShareResults && onShareResults ? (
            <button
              type="button"
              onClick={onShareResults}
              disabled={sharingResults}
              className="app-button-secondary"
            >
              <Share2 aria-hidden="true" size={17} />
              {sharingResults ? "Preparing..." : "Share"}
            </button>
          ) : null}
          {canOpenPlayerManager ? (
            <button
              type="button"
              onClick={onOpenPlayerManager}
              className="app-button-secondary ml-auto"
            >
              <Users aria-hidden="true" size={17} />
              Players
            </button>
          ) : null}
        </div>
      </div>

      {tutorialHint ? (
        <div className="mt-5 rounded-xl border border-teal-100 bg-teal-50/70 px-3 py-3">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-teal-700">
            Tutorial hint
          </p>
          <p className="mt-1 text-sm font-semibold text-gray-900">
            {tutorialHint.title}
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-600">
            {tutorialHint.detail}
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Players"
          value={playersCount}
          detail={guestPlayersCount > 0 ? `${guestPlayersCount} guests` : undefined}
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
          value={statusCardValue}
        />
      </div>
    </section>
  );
}
