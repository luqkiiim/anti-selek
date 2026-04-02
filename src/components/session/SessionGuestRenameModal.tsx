"use client";

import { ModalFrame } from "@/components/ui/chrome";

interface SessionGuestRenameModalProps {
  open: boolean;
  guestName: string;
  saving: boolean;
  onGuestNameChange: (value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export function SessionGuestRenameModal({
  open,
  guestName,
  saving,
  onGuestNameChange,
  onClose,
  onSubmit,
}: SessionGuestRenameModalProps) {
  if (!open) return null;

  return (
    <ModalFrame
      title="Rename guest"
      subtitle="Update the guest name for this live session."
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="app-button-secondary px-4 py-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={saving || guestName.trim().length < 2}
            className="app-button-primary px-4 py-2"
          >
            {saving ? "Saving..." : "Save name"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <label className="block space-y-2 text-sm font-medium text-gray-900">
          <span>Guest name</span>
          <input
            type="text"
            value={guestName}
            onChange={(event) => onGuestNameChange(event.target.value)}
            className="field"
            placeholder="Guest name"
            autoFocus
          />
        </label>
      </div>
    </ModalFrame>
  );
}
