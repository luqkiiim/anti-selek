"use client";

import type { ReactNode } from "react";
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
  creatingSession: boolean;
}

function SetupOptionCard({
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
      className={`rounded-[1.35rem] border px-4 py-4 text-left transition ${
        selected
          ? "border-blue-300 bg-blue-50 shadow-sm"
          : "border-gray-100 bg-white hover:border-blue-200 hover:bg-blue-50/40"
      }`}
    >
      <p className="text-sm font-semibold text-gray-900">{label}</p>
    </button>
  );
}

function SetupStep({
  step,
  title,
  children,
}: {
  step: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="app-subcard p-5 sm:p-6">
      <div className="mb-4 space-y-2">
        <p className="app-eyebrow">{step}</p>
        <div>
          <h4 className="text-lg font-semibold text-gray-900">{title}</h4>
        </div>
      </div>
      {children}
    </section>
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
  creatingSession,
}: HostTournamentPanelProps) {
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

  return (
    <section className="app-panel p-5 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="app-eyebrow">Host desk</p>
          <h3 className="text-xl font-semibold text-gray-900 sm:text-2xl">
            Build the next tournament in three quick steps
          </h3>
        </div>

        <div className="flex flex-wrap gap-2">
          <span className="app-chip app-chip-neutral">
            {selectedPlayerCount} players selected
          </span>
          <span className="app-chip app-chip-neutral">
            {guestCount} guests ready
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.9fr)]">
        <div className="space-y-4">
          <SetupStep
            step="Step 1"
            title="Session details"
          >
            <div className="space-y-4">
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

              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-900">Format</p>
                <div className="grid gap-3 md:grid-cols-3">
                  {sessionTypeOptions.map((option) => (
                    <SetupOptionCard
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
                <div className="grid gap-3 md:grid-cols-2">
                  {sessionModeOptions.map((option) => (
                    <SetupOptionCard
                      key={option.value}
                      label={option.label}
                      selected={sessionMode === option.value}
                      onClick={() => onSessionModeChange(option.value)}
                    />
                  ))}
                </div>
              </div>

              <label className="block max-w-xs space-y-2 text-sm font-medium text-gray-900">
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
          </SetupStep>

          <SetupStep
            step="Step 2"
            title="Roster"
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div className="app-panel-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Players
                </p>
                <p className="mt-2 text-3xl font-semibold leading-none text-gray-900">
                  {selectedPlayerCount}
                </p>
                <button
                  type="button"
                  onClick={onOpenPlayers}
                  className="app-button-secondary mt-4 w-full"
                >
                  Choose Players
                </button>
              </div>

              <div className="app-panel-muted p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Guests
                </p>
                <p className="mt-2 text-3xl font-semibold leading-none text-gray-900">
                  {guestCount}
                </p>
                <button
                  type="button"
                  onClick={onOpenGuests}
                  className="app-button-secondary mt-4 w-full"
                >
                  Manage Guests
                </button>
              </div>
            </div>
          </SetupStep>
        </div>

        <aside className="app-panel-soft p-5 sm:p-6">
          <p className="app-eyebrow">Step 3</p>
          <h4 className="mt-2 text-lg font-semibold text-gray-900">
            Review and launch
          </h4>

          <div className="mt-5 space-y-3">
            <div className="app-subcard px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                Tournament name
              </p>
              <p className="mt-2 text-base font-semibold text-gray-900">
                {newSessionName.trim() || "Add a tournament name"}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="app-subcard px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Format
                </p>
                <p className="mt-2 text-base font-semibold text-gray-900">
                  {sessionTypeSummary}
                </p>
              </div>

              <div className="app-subcard px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Mode
                </p>
                <p className="mt-2 text-base font-semibold text-gray-900">
                  {sessionModeSummary}
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="app-subcard px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Courts
                </p>
                <p className="mt-2 text-base font-semibold text-gray-900">
                  {courtCount} Court{courtCount > 1 ? "s" : ""}
                </p>
              </div>

              <div className="app-subcard px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Players
                </p>
                <p className="mt-2 text-base font-semibold text-gray-900">
                  {selectedPlayerCount} selected
                </p>
              </div>

              <div className="app-subcard px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Guests
                </p>
                <p className="mt-2 text-base font-semibold text-gray-900">
                  {guestCount} added
                </p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onCreateSession}
            disabled={creatingSession || !newSessionName.trim()}
            className="app-button-primary mt-6 w-full"
          >
            {creatingSession ? "Creating..." : "Create Tournament"}
          </button>
        </aside>
      </div>
    </section>
  );
}
