"use client";

interface PendingApprovalActionsProps {
  canConfirmPending: boolean;
  isAdmin: boolean;
  isReopening: boolean;
  onApprove: () => void;
  onReopen: () => void;
}

export function PendingApprovalActions({
  canConfirmPending,
  isAdmin,
  isReopening,
  onApprove,
  onReopen,
}: PendingApprovalActionsProps) {
  return (
    <div className="space-y-2 pt-2">
      {canConfirmPending || isAdmin ? (
        <div
          className={`grid gap-2 ${
            isAdmin ? "grid-cols-2" : "grid-cols-1"
          }`}
        >
          {canConfirmPending ? (
            <button
              type="button"
              onClick={onApprove}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-black uppercase text-white shadow-md transition-all active:scale-95 active:bg-blue-700"
            >
              Confirm Results
            </button>
          ) : null}
          {isAdmin ? (
            <button
              type="button"
              onClick={onReopen}
              disabled={isReopening}
              className="w-full rounded-xl border border-gray-200 bg-gray-100 py-3 text-sm font-black uppercase text-gray-700 transition-all active:scale-95 active:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isReopening ? "Opening..." : "Back To Edit"}
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="rounded-lg border border-orange-100 bg-orange-50 py-2 text-center text-[10px] font-black uppercase tracking-widest text-orange-700">
        Awaiting Confirmation
      </div>
    </div>
  );
}
