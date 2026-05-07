"use client";

interface ScoreEntryControlsProps {
  canSubmit: boolean;
  isConfirming: boolean;
  isSubmitting: boolean;
  onSubmit: () => void;
  onConfirm: () => void;
  onEdit: () => void;
}

export function ScoreEntryControls({
  canSubmit,
  isConfirming,
  isSubmitting,
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
          Edit
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isSubmitting}
          className="app-button-primary min-h-12 py-3"
        >
          {isSubmitting ? "Saving..." : "Confirm"}
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
      >
        {isSubmitting ? "Saving..." : "Submit Score"}
      </button>
    </div>
  );
}
