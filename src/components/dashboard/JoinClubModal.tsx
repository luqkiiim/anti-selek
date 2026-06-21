"use client";

import { ModalFrame } from "@/components/ui/chrome";

interface JoinClubModalProps {
  open: boolean;
  clubName: string;
  clubPassword: string;
  joiningClub: boolean;
  onClubNameChange: (value: string) => void;
  onClubPasswordChange: (value: string) => void;
  onClose: () => void;
  onJoinClub: () => void;
}

export function JoinClubModal({
  open,
  clubName,
  clubPassword,
  joiningClub,
  onClubNameChange,
  onClubPasswordChange,
  onClose,
  onJoinClub,
}: JoinClubModalProps) {
  if (!open) return null;

  return (
    <ModalFrame
      title="Join club"
      subtitle="Enter the club name and password if the group is protected."
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
            onClick={onJoinClub}
            disabled={joiningClub || !clubName.trim()}
            className="app-button-dark"
          >
            {joiningClub ? "Joining..." : "Join"}
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
            placeholder="Club name"
            className="field"
          />
        </label>
        <label className="block space-y-2 text-sm font-medium text-gray-900">
          <span>Password</span>
          <input
            type="password"
            value={clubPassword}
            onChange={(event) => onClubPasswordChange(event.target.value)}
            placeholder="If required"
            className="field"
          />
        </label>
      </div>
    </ModalFrame>
  );
}
