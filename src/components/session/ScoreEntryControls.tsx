"use client";

interface ScoreEntryControlsProps {
  canSubmit: boolean;
  isSubmitting: boolean;
  onSubmit: () => void;
}

export function ScoreEntryControls({
  canSubmit,
  isSubmitting,
  onSubmit,
}: ScoreEntryControlsProps) {
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
