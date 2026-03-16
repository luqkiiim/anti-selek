"use client";

import { ModalFrame } from "@/components/ui/chrome";

interface ScoreSubmissionModalProps {
  team1Names: [string, string];
  team2Names: [string, string];
  team1Score: number;
  team2Score: number;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ScoreSubmissionModal({
  team1Names,
  team2Names,
  team1Score,
  team2Score,
  isSubmitting,
  onClose,
  onConfirm,
}: ScoreSubmissionModalProps) {
  return (
    <ModalFrame
      title="Confirm score submission"
      subtitle="Double-check the teams and result before sending it."
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="app-button-secondary"
          >
            Edit Score
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            className="app-button-primary"
          >
            {isSubmitting ? "Submitting..." : "Confirm Submission"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <div className="app-panel-muted space-y-2 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            Team 1
          </p>
          <p className="text-base font-semibold text-gray-900">{team1Names[0]}</p>
          <p className="text-base font-semibold text-gray-900">{team1Names[1]}</p>
        </div>

        <div className="flex items-center justify-center gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-4">
          <div className="text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">
              Team 1
            </p>
            <p className="mt-1 text-3xl font-black text-gray-900">{team1Score}</p>
          </div>
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-gray-400">
            VS
          </div>
          <div className="text-center">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">
              Team 2
            </p>
            <p className="mt-1 text-3xl font-black text-gray-900">{team2Score}</p>
          </div>
        </div>

        <div className="app-panel-muted space-y-2 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
            Team 2
          </p>
          <p className="text-base font-semibold text-gray-900">{team2Names[0]}</p>
          <p className="text-base font-semibold text-gray-900">{team2Names[1]}</p>
        </div>
      </div>
    </ModalFrame>
  );
}
