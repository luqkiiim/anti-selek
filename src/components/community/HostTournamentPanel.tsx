"use client";

import { useEffect, useRef, useState } from "react";
import { SessionMode, SessionPool, SessionType } from "@/types/enums";

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
  poolsEnabled: boolean;
  onPoolsEnabledChange: (enabled: boolean) => void;
  poolAName: string;
  onPoolANameChange: (value: string) => void;
  poolBName: string;
  onPoolBNameChange: (value: string) => void;
  selectedPoolCounts: Record<SessionPool, number>;
  guestPoolCounts: Record<SessionPool, number>;
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
    label: string;
    lines: string[];
  }
> = {
  [SessionType.POINTS]: {
    label: "Points",
    lines: [
      "Balances by current session points.",
      "Everyone starts at 0.",
      "Best for groups still finding their level.",
    ],
  },
  [SessionType.ELO]: {
    label: "Ratings",
    lines: [
      "Balances by established community ratings.",
      "Best when ratings are already reliable.",
      "Best with established community members.",
    ],
  },
  [SessionType.LADDER]: {
    label: "Ladder",
    lines: [
      "Groups by current session performance.",
      "Similar-performing players face each other more often.",
      "Best for competitive sessions.",
    ],
  },
  [SessionType.RACE]: {
    label: "Race",
    lines: [
      "Groups by accumulated session race points.",
      "Wins add 3. Losses do not remove points.",
      "Best for competitive sessions with a climb.",
    ],
  },
};

function FormatCard({
  sessionType,
  selected,
  infoOpen,
  onSelect,
  onToggleInfo,
}: {
  sessionType: SessionType;
  selected: boolean;
  infoOpen: boolean;
  onSelect: () => void;
  onToggleInfo: () => void;
}) {
  const info = SESSION_TYPE_INFO[sessionType];
  const bubblePositionClass =
    sessionType === SessionType.ELO || sessionType === SessionType.RACE
      ? "right-0 sm:left-1/2 sm:right-auto sm:-translate-x-1/2"
      : "left-0 sm:left-1/2 sm:-translate-x-1/2";
  const bubbleArrowClass =
    sessionType === SessionType.ELO || sessionType === SessionType.RACE
      ? "right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2"
      : "left-4 sm:left-1/2 sm:-translate-x-1/2";

  return (
    <div className="relative" data-format-info-root="true">
      <button
        type="button"
        onClick={onSelect}
        className={`w-full rounded-2xl border px-2.5 py-2.5 pr-7 text-left transition ${
          selected
            ? "border-blue-300 bg-blue-50 text-blue-700 shadow-sm"
            : "border-gray-200 bg-white text-gray-800 hover:border-blue-200 hover:bg-blue-50/40"
        }`}
      >
        <span className="block text-[13px] font-semibold leading-tight">
          {info.label}
        </span>
      </button>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleInfo();
        }}
        aria-label={`About ${info.label} format`}
        aria-expanded={infoOpen}
        className="absolute right-1.5 top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-gray-200 bg-white text-[9px] font-semibold text-gray-500 shadow-sm transition hover:border-blue-200 hover:text-blue-700"
      >
        i
      </button>

      {infoOpen ? (
        <div
          className={`absolute top-full z-20 mt-2 w-[min(15rem,calc(100vw-2rem))] max-w-[15rem] ${bubblePositionClass}`}
        >
          <div className="relative rounded-2xl border border-gray-900 bg-gray-950 px-3 py-3 shadow-[0_18px_40px_-22px_rgba(15,23,42,0.55)]">
            <div
              className={`absolute top-0 h-3 w-3 -translate-y-1/2 rotate-45 border-l border-t border-gray-900 bg-gray-950 ${bubbleArrowClass}`}
            />
            <div className="space-y-1.5">
              {info.lines.map((line) => (
                <p key={line} className="text-sm leading-5 text-white">
                  {line}
                </p>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
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
  poolsEnabled,
  onPoolsEnabledChange,
  poolAName,
  onPoolANameChange,
  poolBName,
  onPoolBNameChange,
  selectedPoolCounts,
  guestPoolCounts,
  selectedPlayerCount,
  guestCount,
  onOpenPlayers,
  onOpenGuests,
  onCreateSession,
  onExitHostMode,
  exitHostModeLabel,
  creatingSession,
}: HostTournamentPanelProps) {
  const formatInfoAreaRef = useRef<HTMLDivElement | null>(null);
  const [infoSessionType, setInfoSessionType] = useState<SessionType | null>(
    null
  );
  const canCreateSession = Boolean(newSessionName.trim()) && !creatingSession;

  useEffect(() => {
    if (!infoSessionType) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (formatInfoAreaRef.current?.contains(event.target)) return;
      setInfoSessionType(null);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [infoSessionType]);

  return (
    <section className="app-panel p-3 sm:p-4">
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
          <div ref={formatInfoAreaRef} className="space-y-1.5">
            <p className="text-sm font-medium text-gray-900">Format</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.values(SessionType) as SessionType[]).map((type) => (
                <FormatCard
                  key={type}
                  sessionType={type}
                  selected={sessionType === type}
                  infoOpen={infoSessionType === type}
                  onSelect={() => {
                    setInfoSessionType(null);
                    onSessionTypeChange(type);
                  }}
                  onToggleInfo={() =>
                    setInfoSessionType((prev) => (prev === type ? null : type))
                  }
                />
              ))}
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

        <div className="app-subcard space-y-3 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Pools</p>
              <p className="text-xs text-gray-500">
                Split matchmaking into two soft groups that can crossover later.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onPoolsEnabledChange(!poolsEnabled)}
              className={`rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition ${
                poolsEnabled
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-500"
              }`}
            >
              {poolsEnabled ? "Enabled" : "Off"}
            </button>
          </div>

          {poolsEnabled ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5 text-sm font-medium text-gray-900">
                <span>Pool A</span>
                <input
                  type="text"
                  value={poolAName}
                  onChange={(event) => onPoolANameChange(event.target.value)}
                  className="field"
                />
                <p className="text-xs text-gray-500">
                  {selectedPoolCounts[SessionPool.A]} players,{" "}
                  {guestPoolCounts[SessionPool.A]} guests
                </p>
              </label>
              <label className="block space-y-1.5 text-sm font-medium text-gray-900">
                <span>Pool B</span>
                <input
                  type="text"
                  value={poolBName}
                  onChange={(event) => onPoolBNameChange(event.target.value)}
                  className="field"
                />
                <p className="text-xs text-gray-500">
                  {selectedPoolCounts[SessionPool.B]} players,{" "}
                  {guestPoolCounts[SessionPool.B]} guests
                </p>
              </label>
            </div>
          ) : null}
        </div>

        <div className="grid gap-2">
          <RosterRow
            label="Players"
            countLabel={
              poolsEnabled
                ? `${selectedPlayerCount} selected across ${poolAName.trim() || "Open"} and ${poolBName.trim() || "Regular"}`
                : `${selectedPlayerCount} selected`
            }
            actionLabel="Choose"
            onClick={onOpenPlayers}
          />
          <RosterRow
            label="Guests"
            countLabel={
              poolsEnabled
                ? `${guestCount} added across ${poolAName.trim() || "Open"} and ${poolBName.trim() || "Regular"}`
                : `${guestCount} added`
            }
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
