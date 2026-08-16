"use client";

import type { ReactNode } from "react";

interface ScoreEntryControlsProps {
  canSubmit: boolean;
  isConfirming: boolean;
  isSubmitting: boolean;
  submitLeadingAction?: ReactNode;
  onSubmit: () => void;
  onConfirm: () => void;
  onEdit: () => void;
}

export function ScoreEntryControls({
  canSubmit,
  isConfirming,
  isSubmitting,
  submitLeadingAction,
  onSubmit,
  onConfirm,
  onEdit,
}: ScoreEntryControlsProps) {
  if (isConfirming) {
    return (
      <div className="grid grid-cols-2 gap-2 pt-2">
        <button
          type="button"
          onClick={onEdit}
          disabled={isSubmitting}
          className="app-button-secondary min-h-12 py-3"
        >
          Edit score
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isSubmitting}
          className="app-button-primary min-h-12 py-3"
          data-tutorial-target="admin-onboarding-submit-score"
        >
          {isSubmitting ? "Saving..." : "Submit result"}
        </button>
      </div>
    );
  }

  if (submitLeadingAction) {
    return (
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 pt-2">
        {submitLeadingAction}
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting || !canSubmit}
          className="app-button-primary min-h-12 w-full py-3"
          data-tutorial-target="admin-onboarding-submit-score"
        >
          {isSubmitting ? "Saving..." : "Review result"}
        </button>
      </div>
    );
  }

  return (
    <div className="pt-2">
      <button
        type="button"
        onClick={onSubmit}
        disabled={isSubmitting || !canSubmit}
        className="app-button-primary min-h-12 w-full py-3"
        data-tutorial-target="admin-onboarding-submit-score"
      >
        {isSubmitting ? "Saving..." : "Review result"}
      </button>
    </div>
  );
}
