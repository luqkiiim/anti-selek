"use client";

import { getCourtDisplayLabel } from "@/lib/courtLabels";
import { ModalFrame } from "@/components/ui/chrome";
import type { Court } from "./sessionTypes";
import {
  SessionBalanceMetric,
  SessionCollabFormat,
  SessionCrossoverFrequency,
  SessionMatchmakingStyle,
  SessionPairingMode,
} from "@/types/enums";
import {
  BalanceMetricControl,
  CourtCountControl,
  CrossoverFrequencyControl,
  MatchmakingStyleControl,
  PairingModeControl,
  PlayerGroupsControl,
} from "./GameplaySettingsControls";
import {
  getBalanceMetricLabel,
  getMatchmakingStyleLabel,
  getPairingModeLabel,
} from "@/lib/sessionSettings";

interface SessionSettingsModalProps {
  open: boolean;
  courts: Court[];
  isTestSession: boolean;
  autoQueueEnabled: boolean;
  autoQueueDraft: boolean;
  respectPlayerRest: boolean;
  respectPlayerRestDraft: boolean;
  canEditGameplay: boolean;
  collabFormat: SessionCollabFormat;
  matchmakingStyleDraft: SessionMatchmakingStyle;
  balanceMetricDraft: SessionBalanceMetric;
  pairingModeDraft: SessionPairingMode;
  poolsEnabledDraft: boolean;
  crossoverFrequencyDraft: SessionCrossoverFrequency;
  courtCountDraft: number;
  canOpenRoster: boolean;
  canEndSession: boolean;
  canResetSession: boolean;
  canCreateRealSession: boolean;
  canDeleteSession: boolean;
  courtLabelDrafts: Record<number, string>;
  hasGameplayChanges: boolean;
  hasAutoQueueChange: boolean;
  hasRespectPlayerRestChange: boolean;
  hasCourtLabelChanges: boolean;
  hasSettingsChanges: boolean;
  savingSettings: boolean;
  onClose: () => void;
  onOpenRoster: () => void;
  onEndSession: () => void;
  onResetSession: () => void;
  onCreateRealSession: () => void;
  onDeleteSession: () => void;
  onAutoQueueChange: (enabled: boolean) => void;
  onRespectPlayerRestChange: (enabled: boolean) => void;
  onMatchmakingStyleChange: (value: SessionMatchmakingStyle) => void;
  onBalanceMetricChange: (value: SessionBalanceMetric) => void;
  onPairingModeChange: (value: SessionPairingMode) => void;
  onPoolsEnabledChange: (value: boolean) => void;
  onCrossoverFrequencyChange: (value: SessionCrossoverFrequency) => void;
  onCourtCountChange: (value: number) => void;
  onCourtLabelChange: (courtNumber: number, value: string) => void;
  onSaveSettings: () => void;
}

export function SessionSettingsModal({
  open,
  courts,
  isTestSession,
  autoQueueEnabled,
  autoQueueDraft,
  respectPlayerRest,
  respectPlayerRestDraft,
  canEditGameplay,
  collabFormat,
  matchmakingStyleDraft,
  balanceMetricDraft,
  pairingModeDraft,
  poolsEnabledDraft,
  crossoverFrequencyDraft,
  courtCountDraft,
  canOpenRoster,
  canEndSession,
  canResetSession,
  canCreateRealSession,
  canDeleteSession,
  courtLabelDrafts,
  hasGameplayChanges,
  hasAutoQueueChange,
  hasRespectPlayerRestChange,
  hasCourtLabelChanges,
  hasSettingsChanges,
  savingSettings,
  onClose,
  onOpenRoster,
  onEndSession,
  onResetSession,
  onCreateRealSession,
  onDeleteSession,
  onAutoQueueChange,
  onRespectPlayerRestChange,
  onMatchmakingStyleChange,
  onBalanceMetricChange,
  onPairingModeChange,
  onPoolsEnabledChange,
  onCrossoverFrequencyChange,
  onCourtCountChange,
  onCourtLabelChange,
  onSaveSettings,
}: SessionSettingsModalProps) {
  if (!open) return null;

  return (
    <ModalFrame
      title="Tournament settings"
      subtitle="Roster, courts, controls."
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={savingSettings}
            className="app-button-secondary"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onSaveSettings}
            disabled={!hasSettingsChanges || savingSettings}
            className="app-button-primary"
          >
            {savingSettings ? "Saving..." : "Save Changes"}
          </button>
        </div>
      }
    >
      <div className="space-y-5 px-4 py-4 sm:px-5">
        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Quick actions</h3>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {canOpenRoster ? (
              <button
                type="button"
                onClick={onOpenRoster}
                className="app-button-secondary justify-center"
              >
                Add Players
              </button>
            ) : null}
            {canEndSession ? (
              <button
              type="button"
              onClick={onEndSession}
              className="app-button-danger justify-center"
              data-tutorial-target="admin-onboarding-end-session"
            >
                End Tournament
              </button>
            ) : null}
            {canResetSession ? (
              <button
                type="button"
                onClick={onResetSession}
                className="app-button-secondary justify-center"
              >
                {isTestSession ? "Reset Test Tournament" : "Reset Tournament"}
              </button>
            ) : null}
            {canCreateRealSession ? (
              <button
                type="button"
                onClick={onCreateRealSession}
                className="app-button-primary justify-center"
              >
                Create Real Tournament
              </button>
            ) : null}
            {canDeleteSession ? (
              <button
                type="button"
                onClick={onDeleteSession}
                className="app-button-danger justify-center"
              >
                {isTestSession
                  ? "Delete Test Tournament"
                  : "Cancel & Delete Tournament"}
              </button>
            ) : null}
          </div>
          {isTestSession ? (
            <p className="text-sm text-gray-500">
              Test tournaments are safe for rehearsal. Reset clears simulated play,
              and creating a real tournament copies this setup into a fresh live
              tournament.
            </p>
          ) : null}
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">
              Gameplay setup
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {canEditGameplay
                ? "Adjust how matches are formed before the tournament starts."
                : "Reset the tournament to change these gameplay settings."}
            </p>
          </div>
          {canEditGameplay ? (
            <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50/70 p-3 sm:p-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
                <MatchmakingStyleControl
                  value={matchmakingStyleDraft}
                  onChange={onMatchmakingStyleChange}
                />
                <CourtCountControl
                  value={courtCountDraft}
                  onChange={onCourtCountChange}
                />
              </div>
              <PairingModeControl
                value={pairingModeDraft}
                onChange={onPairingModeChange}
                openLabel="Open"
                mixedLabel="Mixed"
              />
              <BalanceMetricControl
                value={balanceMetricDraft}
                onChange={onBalanceMetricChange}
              />
              <PlayerGroupsControl
                enabled={poolsEnabledDraft}
                disabled={collabFormat === SessionCollabFormat.INTERCLUB}
                onChange={onPoolsEnabledChange}
                description={
                  collabFormat === SessionCollabFormat.INTERCLUB
                    ? "Off for club vs club."
                    : "Balance Competitive, Social, and mixed Crossover courts from the active-player ratio."
                }
              />
              {poolsEnabledDraft ? (
                <div className="rounded-xl border border-gray-200 bg-white p-3">
                  <CrossoverFrequencyControl
                    value={crossoverFrequencyDraft}
                    onChange={onCrossoverFrequencyChange}
                  />
                </div>
              ) : null}
              {hasGameplayChanges ? (
                <p role="status" aria-live="polite" className="text-xs text-blue-700">
                  Gameplay changes will apply when you save.
                </p>
              ) : null}
            </div>
          ) : (
            <dl className="grid gap-2 rounded-xl border border-gray-200 bg-gray-50/80 p-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">Matchmaking</dt>
                <dd className="font-semibold text-gray-900">
                  {getMatchmakingStyleLabel(matchmakingStyleDraft)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Balance by</dt>
                <dd className="font-semibold text-gray-900">
                  {getBalanceMetricLabel(balanceMetricDraft)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Pairing</dt>
                <dd className="font-semibold text-gray-900">
                  {getPairingModeLabel(pairingModeDraft)}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Player groups</dt>
                <dd className="font-semibold text-gray-900">
                  {poolsEnabledDraft ? "On" : "Off"}
                </dd>
              </div>
            </dl>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-gray-900">Auto queue</h3>
              <p className="text-sm text-gray-500">
                When on, the app locks the next quartet automatically once every
                court is busy.
              </p>
              {autoQueueEnabled && !autoQueueDraft ? (
                <p
                  role="status"
                  aria-live="polite"
                  className="text-xs font-medium text-amber-700"
                >
                  Turning this off clears the current queued match.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoQueueDraft}
              aria-label="Auto queue"
              onClick={() => onAutoQueueChange(!autoQueueDraft)}
              className={`min-h-11 shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                autoQueueDraft
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-500"
              }`}
            >
              {autoQueueDraft ? "On" : "Off"}
            </button>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-gray-900">
                Respect player rest
              </h3>
              <p className="text-sm text-gray-500">
                When on, matchmaking prefers longer-waiting players and avoids
                immediate back-to-back play.
              </p>
              {!respectPlayerRest && respectPlayerRestDraft ? (
                <p
                  role="status"
                  aria-live="polite"
                  className="text-xs font-medium text-blue-700"
                >
                  Turning this back on restores rest-aware matchmaking.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={respectPlayerRestDraft}
              aria-label="Respect player rest"
              onClick={() =>
                onRespectPlayerRestChange(!respectPlayerRestDraft)
              }
              className={`min-h-11 shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                respectPlayerRestDraft
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-500"
              }`}
            >
              {respectPlayerRestDraft ? "On" : "Off"}
            </button>
          </div>
          {(hasAutoQueueChange || hasRespectPlayerRestChange) &&
          !hasCourtLabelChanges ? (
            <p role="status" aria-live="polite" className="text-xs text-gray-500">
              Matchmaking settings will update when you save.
            </p>
          ) : null}
        </section>

        <section className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Court labels</h3>
            <p className="mt-1 text-sm text-gray-500">
              Leave a label blank to keep the default court name.
            </p>
          </div>

          <div className="space-y-2">
            {Array.from(
              {
                length: canEditGameplay ? courtCountDraft : courts.length,
              },
              (_, index) => index + 1
            ).map((courtNumber) => {
              const court = courts.find(
                (item) => item.courtNumber === courtNumber
              );
              return (
                <label
                  key={courtNumber}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50/80 px-3 py-3"
                >
                  <span className="min-w-0 flex-1 text-sm font-semibold text-gray-900">
                    {court ? getCourtDisplayLabel(court) : `Court ${courtNumber}`}
                  </span>
                  <input
                    type="text"
                    value={courtLabelDrafts[courtNumber] ?? ""}
                    onChange={(event) =>
                      onCourtLabelChange(courtNumber, event.target.value)
                    }
                    maxLength={24}
                    placeholder={`Court ${courtNumber}`}
                    className="field max-w-[13rem] px-3 py-2 text-sm"
                  />
                </label>
              );
            })}
          </div>
        </section>
      </div>
    </ModalFrame>
  );
}
