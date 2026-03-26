"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { SessionMode, SessionType } from "@/types/enums";

interface HostTournamentPanelProps {
  newSessionName: string;
  onNewSessionNameChange: (value: string) => void;
  sessionType: SessionType;
  onSessionTypeChange: (type: SessionType) => void;
  sessionMode: SessionMode;
  onSessionModeChange: (mode: SessionMode) => void;
  openModeLabel: string;
  mixedModeLabel: string;
  courtCount: number;
  onCourtCountChange: (count: number) => void;
  selectedPlayerCount: number;
  guestCount: number;
  onOpenPlayers: () => void;
  onOpenGuests: () => void;
  onCreateSession: () => void;
  onExitHostMode: () => void;
  exitHostModeLabel: string;
  creatingSession: boolean;
}

function SetupOptionButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${
        selected
          ? "border-blue-300 bg-blue-50 text-blue-700 shadow-sm"
          : "border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:bg-blue-50/40"
      }`}
    >
      {label}
    </button>
  );
}

function SetupStep({
  step,
  title,
  description,
  children,
}: {
  step: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="app-subcard p-4 sm:p-5">
      <div className="mb-4 space-y-2">
        <p className="app-eyebrow">{step}</p>
        <div>
          <h4 className="text-lg font-semibold text-gray-900">{title}</h4>
          {description ? (
            <p className="mt-1 text-sm text-gray-600">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function SummaryPill({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/90 px-3 py-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

export function HostTournamentPanel({
  newSessionName,
  onNewSessionNameChange,
  sessionType,
  onSessionTypeChange,
  sessionMode,
  onSessionModeChange,
  openModeLabel,
  mixedModeLabel,
  courtCount,
  onCourtCountChange,
  selectedPlayerCount,
  guestCount,
  onOpenPlayers,
  onOpenGuests,
  onCreateSession,
  onExitHostMode,
  exitHostModeLabel,
  creatingSession,
}: HostTournamentPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const sessionTypeOptions = [
    {
      value: SessionType.POINTS,
      label: "Points format",
    },
    {
      value: SessionType.ELO,
      label: "Ratings format",
    },
    {
      value: SessionType.LADDER,
      label: "Ladder format",
    },
  ] as const;

  const sessionModeOptions = [
    {
      value: SessionMode.MEXICANO,
      label: openModeLabel,
    },
    {
      value: SessionMode.MIXICANO,
      label: mixedModeLabel,
    },
  ] as const;

  const sessionTypeSummary =
    sessionTypeOptions.find((option) => option.value === sessionType)?.label ??
    "Points format";
  const sessionModeSummary =
    sessionModeOptions.find((option) => option.value === sessionMode)?.label ??
    openModeLabel;
  const rosterSummary = `${selectedPlayerCount} players, ${guestCount} guests`;
  const canCreateSession = Boolean(newSessionName.trim()) && !creatingSession;

  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    panelRef.current?.focus();
  }, []);

  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      className="app-panel scroll-mt-24 p-4 outline-none sm:p-5"
    >
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="app-chip app-chip-accent">Host setup active</span>
            <span className="app-chip app-chip-neutral">
              {selectedPlayerCount} players
            </span>
            <span className="app-chip app-chip-neutral">
              {guestCount} guests
            </span>
          </div>
          <div>
            <p className="app-eyebrow">Host desk</p>
            <h3 className="text-xl font-semibold text-gray-900 sm:text-2xl">
              Build the next tournament in three quick steps
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              Session details, roster changes, and launch controls stay on one
              compact screen while host mode is active.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onExitHostMode}
            className="app-button-secondary px-4 py-2"
          >
            {exitHostModeLabel}
          </button>
          <button
            type="button"
            onClick={onCreateSession}
            disabled={!canCreateSession}
            className="app-button-primary hidden px-4 py-2 sm:inline-flex lg:hidden"
          >
            {creatingSession ? "Creating..." : "Create Tournament"}
          </button>
        </div>
      </div>

      <div className="mt-5 rounded-[1.75rem] border border-blue-100 bg-[linear-gradient(145deg,rgba(240,247,255,0.95),rgba(235,245,255,0.78)_45%,rgba(255,255,255,0.96))] p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <div>
              <p className="app-eyebrow">Launch snapshot</p>
              <h4 className="text-lg font-semibold text-gray-900">
                Review the essentials, then start the tournament
              </h4>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryPill
                label="Name"
                value={newSessionName.trim() || "Add a tournament name"}
              />
              <SummaryPill label="Format" value={sessionTypeSummary} />
              <SummaryPill label="Mode" value={sessionModeSummary} />
              <SummaryPill
                label="Courts"
                value={`${courtCount} Court${courtCount > 1 ? "s" : ""}`}
              />
              <SummaryPill label="Roster" value={rosterSummary} />
            </div>
          </div>

          <div className="hidden w-full max-w-[240px] lg:block">
            <button
              type="button"
              onClick={onCreateSession}
              disabled={!canCreateSession}
              className="app-button-primary w-full"
            >
              {creatingSession ? "Creating..." : "Create Tournament"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
        <SetupStep
          step="Step 1"
          title="Session details"
          description="Keep the setup light: name it, choose the format, then set mode and court count."
        >
          <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(200px,0.65fr)]">
              <label className="block space-y-2 text-sm font-medium text-gray-900">
                <span>Tournament name</span>
                <input
                  type="text"
                  value={newSessionName}
                  onChange={(event) => onNewSessionNameChange(event.target.value)}
                  placeholder="Wednesday Night Ladder"
                  className="field"
                />
              </label>

              <label className="block space-y-2 text-sm font-medium text-gray-900">
                <span>Courts available</span>
                <select
                  value={courtCount}
                  onChange={(event) =>
                    onCourtCountChange(parseInt(event.target.value, 10))
                  }
                  className="field"
                >
                  {Array.from({ length: 10 }, (_, index) => index + 1).map(
                    (count) => (
                      <option key={count} value={count}>
                        {count} Court{count > 1 ? "s" : ""}
                      </option>
                    )
                  )}
                </select>
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-900">Format</p>
                <div className="flex flex-wrap gap-2">
                  {sessionTypeOptions.map((option) => (
                    <SetupOptionButton
                      key={option.value}
                      label={option.label}
                      selected={sessionType === option.value}
                      onClick={() => onSessionTypeChange(option.value)}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-900">Mode</p>
                <div className="flex flex-wrap gap-2">
                  {sessionModeOptions.map((option) => (
                    <SetupOptionButton
                      key={option.value}
                      label={option.label}
                      selected={sessionMode === option.value}
                      onClick={() => onSessionModeChange(option.value)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </SetupStep>

        <SetupStep
          step="Step 2"
          title="Roster"
          description="Players and guests stay as quick actions instead of separate tall cards."
        >
          <div className="space-y-3">
            <div className="app-panel-muted flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">Players</p>
                  <span className="app-chip app-chip-neutral">
                    {selectedPlayerCount} selected
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  Choose community members for the next draw.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenPlayers}
                className="app-button-secondary w-full sm:w-auto"
              >
                Choose Players
              </button>
            </div>

            <div className="app-panel-muted flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-gray-900">Guests</p>
                  <span className="app-chip app-chip-neutral">
                    {guestCount} added
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  Add and review guest entries without leaving host mode.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenGuests}
                className="app-button-secondary w-full sm:w-auto"
              >
                Manage Guests
              </button>
            </div>

            <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
              Launch readiness updates live as you change the roster. The name
              field is the only required input before creating the tournament.
            </div>
          </div>
        </SetupStep>
      </div>

      <div className="sticky bottom-3 z-10 mt-4 rounded-2xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
              Ready to launch
            </p>
            <p className="mt-1 text-sm font-semibold text-gray-900">
              {rosterSummary}
            </p>
          </div>
          <button
            type="button"
            onClick={onCreateSession}
            disabled={!canCreateSession}
            className="app-button-primary px-4 py-2"
          >
            {creatingSession ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </section>
  );
}
