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
              className="app-button-primary min-h-12 w-full py-3"
            >
              Approve score
            </button>
          ) : null}
          {isAdmin ? (
            <button
              type="button"
              onClick={onReopen}
              disabled={isReopening}
              className="app-button-secondary min-h-12 w-full py-3"
            >
              {isReopening ? "Opening..." : "Edit score"}
            </button>
          ) : null}
        </div>
      ) : null}
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border border-orange-100 bg-orange-50 py-2 text-center text-sm font-semibold text-orange-700"
      >
        Waiting for opponent or admin approval
      </div>
    </div>
  );
}
