"use client";

import { useEffect, useRef } from "react";
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

function SegmentedOption({
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
      className={`rounded-full border px-3 py-2 text-sm font-semibold transition ${
        selected
          ? "border-blue-300 bg-blue-50 text-blue-700 shadow-sm"
          : "border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:bg-blue-50/40"
      }`}
    >
      {label}
    </button>
  );
}

function RosterRow({
  label,
  countLabel,
  actionLabel,
  onClick,
}: {
  label: string;
  countLabel: string;
  actionLabel: string;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50/80 px-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
          {countLabel}
        </p>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="app-button-secondary shrink-0 px-3 py-2 text-sm"
      >
        {actionLabel}
      </button>
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
  const canCreateSession = Boolean(newSessionName.trim()) && !creatingSession;

  useEffect(() => {
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    panelRef.current?.focus();
  }, []);

  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      className="app-panel scroll-mt-24 p-3 outline-none sm:p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="app-chip app-chip-accent">Host</span>
          <span className="truncate text-sm font-semibold text-gray-900">
            New tournament
          </span>
        </div>
        <button
          type="button"
          onClick={onExitHostMode}
          className="app-button-secondary shrink-0 px-3 py-2 text-sm"
        >
          {exitHostModeLabel}
        </button>
      </div>

      <div className="mt-3 grid gap-3">
        <label className="block space-y-1.5 text-sm font-medium text-gray-900">
          <span>Name</span>
          <input
            type="text"
            value={newSessionName}
            onChange={(event) => onNewSessionNameChange(event.target.value)}
            className="field"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-gray-900">Format</p>
            <div className="flex flex-wrap gap-2">
              <SegmentedOption
                label="Points"
                selected={sessionType === SessionType.POINTS}
                onClick={() => onSessionTypeChange(SessionType.POINTS)}
              />
              <SegmentedOption
                label="Ratings"
                selected={sessionType === SessionType.ELO}
                onClick={() => onSessionTypeChange(SessionType.ELO)}
              />
              <SegmentedOption
                label="Ladder"
                selected={sessionType === SessionType.LADDER}
                onClick={() => onSessionTypeChange(SessionType.LADDER)}
              />
            </div>
          </div>

          <label className="block space-y-1.5 text-sm font-medium text-gray-900">
            <span>Courts</span>
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
                    {count}
                  </option>
                )
              )}
            </select>
          </label>
        </div>

        <div className="space-y-1.5">
          <p className="text-sm font-medium text-gray-900">Mode</p>
          <div className="flex flex-wrap gap-2">
            <SegmentedOption
              label={openModeLabel}
              selected={sessionMode === SessionMode.MEXICANO}
              onClick={() => onSessionModeChange(SessionMode.MEXICANO)}
            />
            <SegmentedOption
              label={mixedModeLabel}
              selected={sessionMode === SessionMode.MIXICANO}
              onClick={() => onSessionModeChange(SessionMode.MIXICANO)}
            />
          </div>
        </div>

        <div className="grid gap-2">
          <RosterRow
            label="Players"
            countLabel={`${selectedPlayerCount} selected`}
            actionLabel="Choose"
            onClick={onOpenPlayers}
          />
          <RosterRow
            label="Guests"
            countLabel={`${guestCount} added`}
            actionLabel="Manage"
            onClick={onOpenGuests}
          />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onCreateSession}
          disabled={!canCreateSession}
          className="app-button-primary flex-1 px-4 py-2.5"
        >
          {creatingSession ? "Creating..." : "Create Tournament"}
        </button>
      </div>
    </section>
  );
}
