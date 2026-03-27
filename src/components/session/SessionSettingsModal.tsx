"use client";

import { getCourtDisplayLabel } from "@/lib/courtLabels";
import { ModalFrame } from "@/components/ui/chrome";
import type { Court } from "./sessionTypes";

interface SessionSettingsModalProps {
  open: boolean;
  courts: Court[];
  canOpenRoster: boolean;
  canEndSession: boolean;
  courtLabelDrafts: Record<string, string>;
  hasCourtLabelChanges: boolean;
  savingCourtLabels: boolean;
  onClose: () => void;
  onOpenRoster: () => void;
  onEndSession: () => void;
  onCourtLabelChange: (courtId: string, value: string) => void;
  onSaveCourtLabels: () => void;
}

export function SessionSettingsModal({
  open,
  courts,
  canOpenRoster,
  canEndSession,
  courtLabelDrafts,
  hasCourtLabelChanges,
  savingCourtLabels,
  onClose,
  onOpenRoster,
  onEndSession,
  onCourtLabelChange,
  onSaveCourtLabels,
}: SessionSettingsModalProps) {
  if (!open) return null;

  return (
    <ModalFrame
      title="Session settings"
      subtitle="Manage roster, court labels, and session controls."
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={savingCourtLabels}
            className="app-button-secondary"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onSaveCourtLabels}
            disabled={!hasCourtLabelChanges || savingCourtLabels}
            className="app-button-primary"
          >
            {savingCourtLabels ? "Saving..." : "Save Labels"}
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
          </div>
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
