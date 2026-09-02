"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal, Users, X } from "lucide-react";
import type { ClubCollabCandidate } from "./clubTypes";
import {
  SessionBalanceMetric,
  SessionCollabFormat,
  SessionCrossoverFrequency,
  SessionMatchmakingStyle,
  SessionPairingMode,
  SessionPool,
} from "@/types/enums";
import {
  BalanceMetricControl,
  CourtCountControl,
  CrossoverFrequencyControl,
  MatchmakingStyleControl,
  PairingModeControl,
  PlayerGroupsControl,
  SegmentedGameplayOption,
} from "@/components/session/GameplaySettingsControls";

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
  crossoverFrequency: SessionCrossoverFrequency;
  onCrossoverFrequencyChange: (frequency: SessionCrossoverFrequency) => void;
  selectedPoolCounts: Record<SessionPool, number>;
  guestPoolCounts: Record<SessionPool, number>;
  selectedPlayerCount: number;
  guestCount: number;
  onOpenPlayers: () => void;
  onCreateSession: () => void;
  creatingSession: boolean;
  creationIssues: readonly string[];
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
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 text-blue-700">
          <Users aria-hidden="true" size={18} />
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
        data-tutorial-target="admin-onboarding-host-players"
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
  crossoverFrequency,
  onCrossoverFrequencyChange,
  selectedPoolCounts,
  guestPoolCounts,
  selectedPlayerCount,
  guestCount,
  onOpenPlayers,
  onCreateSession,
  creatingSession,
  creationIssues,
}: HostTournamentPanelProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const canCreateSession = creationIssues.length === 0 && !creatingSession;
  const hasPartnerClub = Boolean(partnerClubId);
  const isInterclub = collabFormat === SessionCollabFormat.INTERCLUB;
  const trimmedPartnerSearch = partnerClubSearch.trim();
  const participantCount = selectedPlayerCount + guestCount;
  const competitiveCount =
    selectedPoolCounts[SessionPool.A] + guestPoolCounts[SessionPool.A];
  const socialCount =
    selectedPoolCounts[SessionPool.B] + guestPoolCounts[SessionPool.B];
  const guestCountLabel = `${guestCount} ${guestCount === 1 ? "guest" : "guests"}`;
  const rosterCountLabel = poolsEnabled
    ? `${participantCount} added · ${competitiveCount} Competitive · ${socialCount} Social${guestCount > 0 ? ` · ${guestCountLabel}` : ""}`
    : `${participantCount} added${guestCount > 0 ? ` · ${guestCountLabel}` : ""}`;

  return (
    <section className="app-panel min-w-0 max-w-full overflow-hidden p-3 sm:p-4">
      <div className="flex items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="app-chip app-chip-accent">Host</span>
          <span className="truncate text-sm font-semibold text-gray-900">
            New tournament
          </span>
        </div>
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
            <MatchmakingStyleControl
              value={matchmakingStyle}
              onChange={onMatchmakingStyleChange}
            />
            <CourtCountControl value={courtCount} onChange={onCourtCountChange} />
          </div>

          <PairingModeControl
            value={pairingMode}
            onChange={onPairingModeChange}
            openLabel={openModeLabel}
            mixedLabel={mixedModeLabel}
          />
        </div>

        <div className="grid gap-3">
          <SectionIntro title="Roster" />
          <div className="grid gap-2">
            <RosterRow
              label="Players"
              countLabel={loadingCollabRoster ? "Loading collab roster" : rosterCountLabel}
              actionLabel="Add players"
              onClick={onOpenPlayers}
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
                <BalanceMetricControl
                  value={balanceMetric}
                  onChange={onBalanceMetricChange}
                />
              </div>

              <div className="min-w-0 space-y-2">
                <SwitchRow
                  label="Test tournament"
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
                <PlayerGroupsControl
                  enabled={poolsEnabled}
                  onChange={onPoolsEnabledChange}
                  disabled={isInterclub}
                  description={
                    isInterclub
                      ? "Off for club vs club."
                      : "Balance Competitive, Social, and mixed Crossover courts from the active-player ratio."
                  }
                />
              </div>

              {poolsEnabled ? (
                <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 sm:p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                      <p className="text-sm font-semibold text-blue-900">
                        Competitive
                      </p>
                      <p className="mt-1 text-xs text-blue-700">
                        {selectedPoolCounts[SessionPool.A]} players,{" "}
                        {guestPoolCounts[SessionPool.A]} guests
                      </p>
                    </div>
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
                      <p className="text-sm font-semibold text-emerald-900">
                        Social
                      </p>
                      <p className="mt-1 text-xs text-emerald-700">
                        {selectedPoolCounts[SessionPool.B]} players,{" "}
                        {guestPoolCounts[SessionPool.B]} guests
                      </p>
                    </div>
                  </div>
                  <p className="text-xs leading-5 text-gray-500">
                    Crossover courts pair one Competitive and one Social player
                    on each team. Add at least two people to each group.
                  </p>
                  <div className="space-y-2 border-t border-gray-100 pt-3">
                    <CrossoverFrequencyControl
                      value={crossoverFrequency}
                      onChange={onCrossoverFrequencyChange}
                    />
                  </div>
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
                      <SegmentedGameplayOption
                        label="Free play"
                        selected={collabFormat === SessionCollabFormat.FREE_PLAY}
                        onClick={() =>
                          onCollabFormatChange(SessionCollabFormat.FREE_PLAY)
                        }
                      />
                      <SegmentedGameplayOption
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
          aria-describedby={
            creationIssues.length > 0 ? "host-creation-issues" : undefined
          }
          className="app-button-primary flex-1 px-4 py-2.5"
          data-tutorial-target="admin-onboarding-create-session"
        >
          {creatingSession
            ? "Creating..."
            : isTestSession
              ? "Create Test Tournament"
              : "Create Tournament"}
        </button>
        {creationIssues.length > 0 ? (
          <div
            id="host-creation-issues"
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3"
            aria-live="polite"
          >
            <p className="text-xs font-semibold text-amber-900">
              Complete these steps before creating:
            </p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs font-medium text-amber-900">
              {creationIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
