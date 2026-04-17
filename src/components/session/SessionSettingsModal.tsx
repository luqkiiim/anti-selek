"use client";

import { getCourtDisplayLabel } from "@/lib/courtLabels";
import { ModalFrame } from "@/components/ui/chrome";
import type { Court } from "./sessionTypes";

interface SessionSettingsModalProps {
  open: boolean;
  courts: Court[];
  isTestSession: boolean;
  autoQueueEnabled: boolean;
  autoQueueDraft: boolean;
  canOpenRoster: boolean;
  canEndSession: boolean;
  canResetTestSession: boolean;
  canCreateRealSession: boolean;
  canDeleteTestSession: boolean;
  courtLabelDrafts: Record<string, string>;
  hasAutoQueueChange: boolean;
  hasCourtLabelChanges: boolean;
  hasSettingsChanges: boolean;
  savingSettings: boolean;
  onClose: () => void;
  onOpenRoster: () => void;
  onEndSession: () => void;
  onResetTestSession: () => void;
  onCreateRealSession: () => void;
  onDeleteTestSession: () => void;
  onAutoQueueChange: (enabled: boolean) => void;
  onCourtLabelChange: (courtId: string, value: string) => void;
  onSaveSettings: () => void;
}

export function SessionSettingsModal({
  open,
  courts,
  isTestSession,
  autoQueueEnabled,
  autoQueueDraft,
  canOpenRoster,
  canEndSession,
  canResetTestSession,
  canCreateRealSession,
  canDeleteTestSession,
  courtLabelDrafts,
  hasAutoQueueChange,
  hasCourtLabelChanges,
  hasSettingsChanges,
  savingSettings,
  onClose,
  onOpenRoster,
  onEndSession,
  onResetTestSession,
  onCreateRealSession,
  onDeleteTestSession,
  onAutoQueueChange,
  onCourtLabelChange,
  onSaveSettings,
}: SessionSettingsModalProps) {
  if (!open) return null;

  return (
    <ModalFrame
      title="Session settings"
      subtitle="Manage roster, queue behavior, court labels, and session controls."
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
              >
                End Session
              </button>
            ) : null}
            {canResetTestSession ? (
              <button
                type="button"
                onClick={onResetTestSession}
                className="app-button-secondary justify-center"
              >
                Reset Test Session
              </button>
            ) : null}
            {canCreateRealSession ? (
              <button
                type="button"
                onClick={onCreateRealSession}
                className="app-button-primary justify-center"
              >
                Create Real Session
              </button>
            ) : null}
            {canDeleteTestSession ? (
              <button
                type="button"
                onClick={onDeleteTestSession}
                className="app-button-danger justify-center"
              >
                Delete Test Session
              </button>
            ) : null}
          </div>
          {isTestSession ? (
            <p className="text-sm text-gray-500">
              Test sessions are safe for rehearsal. Reset clears simulated play,
              and creating a real session copies this setup into a fresh live
              tournament.
            </p>
          ) : null}
        </section>

        <section className="space-y-3">
          <div className="flex items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-gray-900">Auto queue</h3>
              <p className="text-sm text-gray-500">
                When on, the app locks the next quartet automatically once every
                court is busy.
              </p>
              {autoQueueEnabled && !autoQueueDraft ? (
                <p className="text-xs font-medium text-amber-700">
                  Turning this off clears the current queued match.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onAutoQueueChange(!autoQueueDraft)}
              className={`shrink-0 rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition ${
                autoQueueDraft
                  ? "border-blue-200 bg-blue-50 text-blue-700"
                  : "border-gray-200 bg-white text-gray-500"
              }`}
            >
              {autoQueueDraft ? "On" : "Off"}
            </button>
          </div>
          {hasAutoQueueChange && !hasCourtLabelChanges ? (
            <p className="text-xs text-gray-500">
              Queue behavior will update when you save.
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
            {courts
              .slice()
              .sort((left, right) => left.courtNumber - right.courtNumber)
              .map((court) => (
                <label
                  key={court.id}
                  className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-gray-50/80 px-3 py-3"
                >
                  <span className="min-w-0 flex-1 text-sm font-semibold text-gray-900">
                    {getCourtDisplayLabel(court)}
                  </span>
                  <input
                    type="text"
                    value={courtLabelDrafts[court.id] ?? ""}
                    onChange={(event) =>
                      onCourtLabelChange(court.id, event.target.value)
                    }
                    maxLength={24}
                    placeholder={`Court ${court.courtNumber}`}
                    className="field max-w-[13rem] px-3 py-2 text-sm"
                  />
                </label>
              ))}
          </div>
        </section>
      </div>
    </ModalFrame>
  );
}
