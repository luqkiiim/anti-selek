"use client";

import { ModalFrame } from "@/components/ui/chrome";

interface CreateClubModalProps {
  open: boolean;
  clubName: string;
  clubPassword: string;
  creatingClub: boolean;
  onClubNameChange: (value: string) => void;
  onClubPasswordChange: (value: string) => void;
  onClose: () => void;
  onCreateClub: () => void;
}

export function CreateClubModal({
  open,
  clubName,
  clubPassword,
  creatingClub,
  onClubNameChange,
  onClubPasswordChange,
  onClose,
  onCreateClub,
}: CreateClubModalProps) {
  if (!open) return null;

  return (
    <ModalFrame
      title="Create club"
      subtitle="Set up a new club space with an optional password."
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="app-button-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onCreateClub}
            disabled={creatingClub || !clubName.trim()}
            className="app-button-primary"
          >
            {creatingClub ? "Creating..." : "Create"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <label className="block space-y-2 text-sm font-medium text-gray-900">
          <span>Club name</span>
          <input
            type="text"
            value={clubName}
            onChange={(event) => onClubNameChange(event.target.value)}
            placeholder="Unique club name"
            className="field"
          />
        </label>
        <label className="block space-y-2 text-sm font-medium text-gray-900">
          <span>Password</span>
          <input
            type="password"
            value={clubPassword}
            onChange={(event) => onClubPasswordChange(event.target.value)}
            placeholder="Optional"
            className="field"
          />
        </label>
      </div>
    </ModalFrame>
  );
}
