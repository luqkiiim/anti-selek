"use client";

import { useEffect, useRef, useState } from "react";
import { ModalFrame } from "@/components/ui/chrome";
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

const SESSION_TYPE_INFO: Record<
  SessionType,
  {
    title: string;
    lines: string[];
  }
> = {
  [SessionType.POINTS]: {
    title: "Points",
    lines: [
      "Balances by current session points.",
      "Everyone starts at 0.",
      "Best for groups still finding their level.",
    ],
  },
  [SessionType.ELO]: {
    title: "Ratings",
    lines: [
      "Balances by established community ratings.",
      "Best when ratings are already reliable.",
      "Best with established community members.",
    ],
  },
  [SessionType.LADDER]: {
    title: "Ladder",
    lines: [
      "Groups by current session performance.",
      "Similar-performing players face each other more often.",
      "Best for competitive sessions.",
    ],
  },
};

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

function FormatOption({
  label,
  selected,
  onSelect,
  onInfo,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  onInfo: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <SegmentedOption label={label} selected={selected} onClick={onSelect} />
      <button
        type="button"
        onClick={onInfo}
        aria-label={`About ${label} format`}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-xs font-semibold text-gray-600 transition hover:border-blue-200 hover:text-blue-700"
      >
        i
      </button>
    </div>
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
  const [infoSessionType, setInfoSessionType] = useState<SessionType | null>(
    null
  );
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
              <FormatOption
                label="Points"
                selected={sessionType === SessionType.POINTS}
                onSelect={() => onSessionTypeChange(SessionType.POINTS)}
                onInfo={() => setInfoSessionType(SessionType.POINTS)}
              />
              <FormatOption
                label="Ratings"
                selected={sessionType === SessionType.ELO}
                onSelect={() => onSessionTypeChange(SessionType.ELO)}
                onInfo={() => setInfoSessionType(SessionType.ELO)}
              />
              <FormatOption
                label="Ladder"
                selected={sessionType === SessionType.LADDER}
                onSelect={() => onSessionTypeChange(SessionType.LADDER)}
                onInfo={() => setInfoSessionType(SessionType.LADDER)}
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

      {infoSessionType ? (
        <ModalFrame
          title={SESSION_TYPE_INFO[infoSessionType].title}
          onClose={() => setInfoSessionType(null)}
          footer={
            <button
              type="button"
              onClick={() => setInfoSessionType(null)}
              className="app-button-primary w-full"
            >
              Done
            </button>
          }
        >
          <div className="px-4 py-4 sm:px-5">
            <ul className="space-y-2">
              {SESSION_TYPE_INFO[infoSessionType].lines.map((line) => (
                <li key={line} className="text-sm font-medium text-gray-700">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </ModalFrame>
      ) : null}
    </section>
  );
}
