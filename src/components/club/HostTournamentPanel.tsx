"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal, UserPlus, Users, X } from "lucide-react";
import type { ClubCollabCandidate } from "./clubTypes";
import {
  SessionBalanceMetric,
  SessionCollabFormat,
  SessionMatchmakingStyle,
  SessionPairingMode,
  SessionPool,
} from "@/types/enums";

interface HostTournamentPanelProps {
  newSessionName: string;
  onNewSessionNameChange: (value: string) => void;
  matchmakingStyle: SessionMatchmakingStyle;
  onMatchmakingStyleChange: (style: SessionMatchmakingStyle) => void;
  balanceMetric: SessionBalanceMetric;
  onBalanceMetricChange: (metric: SessionBalanceMetric) => void;
  pairingMode: SessionPairingMode;
  onPairingModeChange: (mode: SessionPairingMode) => void;
  isTestSession: boolean;
  onIsTestSessionChange: (value: boolean) => void;
  autoQueueEnabled: boolean;
  onAutoQueueEnabledChange: (value: boolean) => void;
  respectPlayerRest: boolean;
  onRespectPlayerRestChange: (value: boolean) => void;
  collabFormat: SessionCollabFormat;
  onCollabFormatChange: (format: SessionCollabFormat) => void;
  partnerClubId: string;
  partnerClubSearch: string;
  onPartnerClubSearchChange: (value: string) => void;
  collabCandidates: ClubCollabCandidate[];
  selectedPartnerClub: ClubCollabCandidate | null;
  loadingCollabCandidates: boolean;
  onSelectPartnerClub: (candidate: ClubCollabCandidate) => void;
  onClearPartnerClub: () => void;
  loadingCollabRoster: boolean;
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

const MATCHMAKING_STYLE_ORDER: SessionMatchmakingStyle[] = [
  SessionMatchmakingStyle.BALANCED,
  SessionMatchmakingStyle.SOCIAL,
  SessionMatchmakingStyle.LEVEL_MATCH,
];

const MATCHMAKING_STYLE_INFO: Record<
  SessionMatchmakingStyle,
  {
    label: string;
    lines: string[];
  }
> = {
  [SessionMatchmakingStyle.BALANCED]: {
    label: "Balanced",
    lines: ["Fair games with some variety."],
  },
  [SessionMatchmakingStyle.SOCIAL]: {
    label: "Social",
    lines: ["More variety, less focus on fairness."],
  },
  [SessionMatchmakingStyle.LEVEL_MATCH]: {
    label: "Level Match",
    lines: ["Play mostly with people close to your level."],
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
      className={`min-w-0 rounded-lg border px-3 py-2 text-center text-sm font-semibold transition ${
        selected
          ? "border-blue-300 bg-blue-50 text-blue-700 shadow-sm"
          : "border-gray-200 bg-white text-gray-700 hover:border-blue-200 hover:bg-blue-50/40"
      }`}
    >
      {label}
    </button>
  );
}

function SectionIntro({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      {description ? <p className="text-xs text-gray-500">{description}</p> : null}
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
  const Icon = label === "Players" ? Users : UserPlus;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700">
          <Icon aria-hidden="true" size={18} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          <p className="text-xs text-gray-500">{countLabel}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="app-button-secondary shrink-0 px-3 py-2 text-sm"
        data-tutorial-target={
          label === "Players" ? "admin-onboarding-host-players" : undefined
        }
      >
        {actionLabel}
      </button>
    </div>
  );
}

function SwitchRow({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full min-w-0 max-w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50/40 disabled:cursor-not-allowed disabled:opacity-60 sm:gap-4 sm:px-4"
    >
      <span className="min-w-0">
        <span className="block break-words text-sm font-semibold text-gray-900">
          {label}
        </span>
        {description ? (
          <span className="mt-0.5 block break-words text-xs leading-5 text-gray-500">
            {description}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden="true"
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
          checked
            ? "border-blue-300 bg-blue-600"
            : "border-gray-300 bg-gray-100"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white shadow-sm transition ${
            checked ? "translate-x-5" : "translate-x-1"
          }`}
        />
      </span>
    </button>
  );
}

export function HostTournamentPanel({
  newSessionName,
  onNewSessionNameChange,
  matchmakingStyle,
  onMatchmakingStyleChange,
  balanceMetric,
  onBalanceMetricChange,
  pairingMode,
  onPairingModeChange,
  isTestSession,
  onIsTestSessionChange,
  autoQueueEnabled,
  onAutoQueueEnabledChange,
  respectPlayerRest,
  onRespectPlayerRestChange,
  collabFormat,
  onCollabFormatChange,
  partnerClubId,
  partnerClubSearch,
  onPartnerClubSearchChange,
  collabCandidates,
  selectedPartnerClub,
  loadingCollabCandidates,
  onSelectPartnerClub,
  onClearPartnerClub,
  loadingCollabRoster,
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const canCreateSession = Boolean(newSessionName.trim()) && !creatingSession;
  const hasPartnerClub = Boolean(partnerClubId);
  const isInterclub = collabFormat === SessionCollabFormat.INTERCLUB;
  const trimmedPartnerSearch = partnerClubSearch.trim();
  const selectedStyleInfo = MATCHMAKING_STYLE_INFO[matchmakingStyle];

  return (
    <section className="app-panel min-w-0 max-w-full overflow-hidden p-3 sm:p-4">
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

      <div className="mt-4 grid gap-5">
        <div className="grid gap-3">
          <label className="block space-y-1.5 text-sm font-medium text-gray-900">
            <span>Name</span>
            <input
              type="text"
              value={newSessionName}
              onChange={(event) => onNewSessionNameChange(event.target.value)}
              className="field"
              data-tutorial-target="admin-onboarding-session-name"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-gray-900">
                Matchmaking style
              </p>
              <select
                value={matchmakingStyle}
                onChange={(event) =>
                  onMatchmakingStyleChange(
                    event.target.value as SessionMatchmakingStyle
                  )
                }
                className="field"
              >
                {MATCHMAKING_STYLE_ORDER.map((style) => (
                  <option key={style} value={style}>
                    {MATCHMAKING_STYLE_INFO[style].label}
                  </option>
                ))}
              </select>
              <div className="rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-3">
                <div className="space-y-1.5">
                  {selectedStyleInfo.lines.map((line) => (
                    <p key={line} className="text-sm leading-5 text-gray-700">
                      {line}
                    </p>
                  ))}
                </div>
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
            <p className="text-sm font-medium text-gray-900">Pairing</p>
            <div className="flex flex-wrap gap-2">
              <SegmentedOption
                label={openModeLabel}
                selected={pairingMode === SessionPairingMode.OPEN}
                onClick={() => onPairingModeChange(SessionPairingMode.OPEN)}
              />
              <SegmentedOption
                label={mixedModeLabel}
                selected={pairingMode === SessionPairingMode.MIXED}
                onClick={() => onPairingModeChange(SessionPairingMode.MIXED)}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <SectionIntro title="Roster" />
          <div className="grid gap-2">
            <RosterRow
              label="Players"
              countLabel={
                loadingCollabRoster
                  ? "Loading collab roster"
                  : poolsEnabled
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

        <div className="rounded-xl border border-gray-200 bg-gray-50/70">
          <button
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            aria-expanded={advancedOpen}
            className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left sm:px-4"
          >
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600">
                <SlidersHorizontal aria-hidden="true" size={17} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-gray-900">
                  Advanced setup
                </span>
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              size={18}
              className={`shrink-0 text-gray-500 transition ${
                advancedOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {advancedOpen ? (
            <div className="min-w-0 space-y-3 border-t border-gray-200 px-3 py-3 sm:px-4">
              <div className="min-w-0 space-y-1.5 rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
                <p className="text-sm font-medium text-gray-900">Balance by</p>
                <div className="grid min-w-0 grid-cols-2 gap-2">
                  <SegmentedOption
                    label="Session points"
                    selected={
                      balanceMetric === SessionBalanceMetric.SESSION_POINTS
                    }
                    onClick={() =>
                      onBalanceMetricChange(
                        SessionBalanceMetric.SESSION_POINTS
                      )
                    }
                  />
                  <SegmentedOption
                    label="Rating"
                    selected={balanceMetric === SessionBalanceMetric.RATING}
                    onClick={() =>
                      onBalanceMetricChange(SessionBalanceMetric.RATING)
                    }
                  />
                </div>
              </div>

              <div className="min-w-0 space-y-2">
                <SwitchRow
                  label="Test session"
                  description="Resettable rehearsal."
                  checked={isTestSession}
                  onChange={onIsTestSessionChange}
                />
                <SwitchRow
                  label="Auto queue"
                  description="Fill open courts automatically."
                  checked={autoQueueEnabled}
                  onChange={onAutoQueueEnabledChange}
                />
                <SwitchRow
                  label="Respect player rest"
                  description="Avoid back-to-back games."
                  checked={respectPlayerRest}
                  onChange={onRespectPlayerRestChange}
                />
                <SwitchRow
                  label="Pools"
                  description={
                    isInterclub
                      ? "Off for club vs club."
                      : "Two soft groups."
                  }
                  checked={poolsEnabled}
                  onChange={onPoolsEnabledChange}
                  disabled={isInterclub}
                />
              </div>

              {poolsEnabled ? (
                <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-3 sm:grid-cols-2 sm:p-4">
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

              <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-1.5 text-sm font-medium text-gray-900">
                    <span>Collab club</span>
                    <p className="text-xs font-normal text-gray-500">
                      Invite another club. Approval is required before the
                      tournament can start.
                    </p>
                    {hasPartnerClub ? (
                      <div
                        key="selected-partner-club"
                        className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {selectedPartnerClub?.name ??
                              "Selected club"}
                          </p>
                          {selectedPartnerClub ? (
                            <p className="text-xs font-semibold text-amber-700">
                              {selectedPartnerClub.membersCount} members
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onClearPartnerClub();
                          }}
                          aria-label="Clear collab club"
                          className="app-button-secondary shrink-0 px-2.5 py-1.5 text-xs"
                        >
                          <X aria-hidden="true" size={14} />
                          Clear
                        </button>
                      </div>
                    ) : (
                      <div key="partner-club-search" className="mt-2 space-y-2">
                        <input
                          type="search"
                          value={partnerClubSearch}
                          onChange={(event) =>
                            onPartnerClubSearchChange(event.target.value)
                          }
                          aria-label="Search collab club"
                          placeholder="Search by club name"
                          className="field"
                        />
                        {partnerClubSearch.length > 0 ? (
                          <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
                            {trimmedPartnerSearch.length < 2 ? (
                              <p className="px-2 py-1.5 text-xs font-semibold text-gray-500">
                                Type at least 2 characters.
                              </p>
                            ) : loadingCollabCandidates ? (
                              <p className="px-2 py-1.5 text-xs font-semibold text-gray-500">
                                Searching clubs...
                              </p>
                            ) : collabCandidates.length > 0 ? (
                              <div className="grid gap-1">
                                {collabCandidates.map((candidate) => (
                                  <button
                                    key={candidate.id}
                                    type="button"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      onSelectPartnerClub(candidate);
                                    }}
                                    aria-label={`Select ${candidate.name} for collab`}
                                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-blue-50"
                                  >
                                    <span className="min-w-0 truncate text-sm font-semibold text-gray-900">
                                      {candidate.name}
                                    </span>
                                    <span className="shrink-0 text-xs font-semibold text-gray-500">
                                      {candidate.membersCount} members
                                    </span>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="px-2 py-1.5 text-xs font-semibold text-gray-500">
                                No clubs found.
                              </p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                  {hasPartnerClub ? (
                    <span className="app-chip app-chip-warning shrink-0">
                      Approval required
                    </span>
                  ) : null}
                </div>
                {hasPartnerClub ? (
                  <div className="mt-3 border-t border-gray-200 pt-3">
                    <p className="mb-2 text-sm font-medium text-gray-900">
                      Collab format
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <SegmentedOption
                        label="Free play"
                        selected={collabFormat === SessionCollabFormat.FREE_PLAY}
                        onClick={() =>
                          onCollabFormatChange(SessionCollabFormat.FREE_PLAY)
                        }
                      />
                      <SegmentedOption
                        label="Club vs club"
                        selected={collabFormat === SessionCollabFormat.INTERCLUB}
                        onClick={() =>
                          onCollabFormatChange(SessionCollabFormat.INTERCLUB)
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-2">
        <button
          type="button"
          onClick={onCreateSession}
          disabled={!canCreateSession}
          className="app-button-primary flex-1 px-4 py-2.5"
          data-tutorial-target="admin-onboarding-create-session"
        >
          {creatingSession
            ? "Creating..."
            : isTestSession
              ? "Create Test Session"
              : "Create Tournament"}
        </button>
        {!newSessionName.trim() ? (
          <p className="text-center text-xs text-gray-500">
            Add a tournament name to create it.
          </p>
        ) : null}
      </div>
    </section>
  );
}
