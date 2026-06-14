"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal, UserPlus, Users, X } from "lucide-react";
import type { CommunityCollabCandidate } from "./communityTypes";
import {
  SessionBalanceMetric,
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
  partnerCommunityId: string;
  partnerCommunitySearch: string;
  onPartnerCommunitySearchChange: (value: string) => void;
  collabCandidates: CommunityCollabCandidate[];
  selectedPartnerCommunity: CommunityCollabCandidate | null;
  loadingCollabCandidates: boolean;
  onSelectPartnerCommunity: (candidate: CommunityCollabCandidate) => void;
  onClearPartnerCommunity: () => void;
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
  description: string;
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm font-semibold text-gray-900">{title}</p>
      <p className="text-xs text-gray-500">{description}</p>
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
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full min-w-0 max-w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50/40 sm:gap-4 sm:px-4"
    >
      <span className="min-w-0">
        <span className="block break-words text-sm font-semibold text-gray-900">
          {label}
        </span>
        <span className="mt-0.5 block break-words text-xs leading-5 text-gray-500">
          {description}
        </span>
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
  partnerCommunityId,
  partnerCommunitySearch,
  onPartnerCommunitySearchChange,
  collabCandidates,
  selectedPartnerCommunity,
  loadingCollabCandidates,
  onSelectPartnerCommunity,
  onClearPartnerCommunity,
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
  const hasPartnerCommunity = Boolean(partnerCommunityId);
  const trimmedPartnerSearch = partnerCommunitySearch.trim();
  const advancedSummaryItems = [
    isTestSession ? "Test session" : null,
    autoQueueEnabled ? null : "Auto queue off",
    respectPlayerRest ? null : "Rest ignored",
    balanceMetric === SessionBalanceMetric.RATING ? "Balance by rating" : null,
    poolsEnabled ? "Pools enabled" : null,
    selectedPartnerCommunity
      ? `Collab: ${selectedPartnerCommunity.name}`
      : hasPartnerCommunity
        ? "Collab selected"
        : null,
  ].filter(Boolean);
  const advancedSummary =
    advancedSummaryItems.length > 0
      ? advancedSummaryItems.join(" / ")
      : "Regular tournament / Auto queue on";
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
          <SectionIntro
            title="Roster"
            description="Choose community players and add any guests before creating."
          />
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
                <span className="block truncate text-xs text-gray-500">
                  {advancedSummary}
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
                  description="Safe for rehearsal and can be reset later."
                  checked={isTestSession}
                  onChange={onIsTestSessionChange}
                />
                <SwitchRow
                  label="Auto queue"
                  description="Lock the next quartet automatically once all courts are full."
                  checked={autoQueueEnabled}
                  onChange={onAutoQueueEnabledChange}
                />
                <SwitchRow
                  label="Respect player rest"
                  description="Prefer longer-waiting players and avoid immediate back-to-back matches."
                  checked={respectPlayerRest}
                  onChange={onRespectPlayerRestChange}
                />
                <SwitchRow
                  label="Pools"
                  description="Split matchmaking into two soft groups that can crossover later."
                  checked={poolsEnabled}
                  onChange={onPoolsEnabledChange}
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
                    <span>Collab community</span>
                    <p className="text-xs font-normal text-gray-500">
                      Invite another community. Approval is required before the
                      tournament can start.
                    </p>
                    {hasPartnerCommunity ? (
                      <div
                        key="selected-partner-community"
                        className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {selectedPartnerCommunity?.name ??
                              "Selected community"}
                          </p>
                          {selectedPartnerCommunity ? (
                            <p className="text-xs font-semibold text-amber-700">
                              {selectedPartnerCommunity.membersCount} members
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onClearPartnerCommunity();
                          }}
                          aria-label="Clear collab community"
                          className="app-button-secondary shrink-0 px-2.5 py-1.5 text-xs"
                        >
                          <X aria-hidden="true" size={14} />
                          Clear
                        </button>
                      </div>
                    ) : (
                      <div key="partner-community-search" className="mt-2 space-y-2">
                        <input
                          type="search"
                          value={partnerCommunitySearch}
                          onChange={(event) =>
                            onPartnerCommunitySearchChange(event.target.value)
                          }
                          aria-label="Search collab community"
                          placeholder="Search by community name"
                          className="field"
                        />
                        {partnerCommunitySearch.length > 0 ? (
                          <div className="rounded-xl border border-gray-200 bg-white p-2 shadow-sm">
                            {trimmedPartnerSearch.length < 2 ? (
                              <p className="px-2 py-1.5 text-xs font-semibold text-gray-500">
                                Type at least 2 characters.
                              </p>
                            ) : loadingCollabCandidates ? (
                              <p className="px-2 py-1.5 text-xs font-semibold text-gray-500">
                                Searching communities...
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
                                      onSelectPartnerCommunity(candidate);
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
                                No communities found.
                              </p>
                            )}
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                  {hasPartnerCommunity ? (
                    <span className="app-chip app-chip-warning shrink-0">
                      Approval required
                    </span>
                  ) : null}
                </div>
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
