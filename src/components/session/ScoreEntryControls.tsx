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
          className="rounded-xl border border-gray-200 bg-white py-3 text-sm font-black uppercase text-gray-700 transition-all active:scale-95 active:bg-gray-50 disabled:opacity-50"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isSubmitting}
          className="rounded-xl bg-gray-900 py-3 text-sm font-black uppercase text-white shadow-md transition-all active:scale-95 active:bg-gray-800 disabled:opacity-50"
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
        className="w-full rounded-xl bg-gray-900 py-3 text-sm font-black uppercase text-white shadow-md transition-all active:scale-95 active:bg-gray-800 disabled:opacity-50"
      >
        {isSubmitting ? "Saving..." : "Submit Score"}
      </button>
    </div>
  );
}
