"use client";

import { ModalFrame } from "@/components/ui/chrome";

interface JoinCommunityModalProps {
  open: boolean;
  communityName: string;
  communityPassword: string;
  joiningCommunity: boolean;
  onCommunityNameChange: (value: string) => void;
  onCommunityPasswordChange: (value: string) => void;
  onClose: () => void;
  onJoinCommunity: () => void;
}

export function JoinCommunityModal({
  open,
  communityName,
  communityPassword,
  joiningCommunity,
  onCommunityNameChange,
  onCommunityPasswordChange,
  onClose,
  onJoinCommunity,
}: JoinCommunityModalProps) {
  if (!open) return null;

  return (
    <ModalFrame
      title="Join community"
      subtitle="Enter the community name and password if the group is protected."
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
            onClick={onJoinCommunity}
            disabled={joiningCommunity || !communityName.trim()}
            className="app-button-dark"
          >
            {joiningCommunity ? "Joining..." : "Join"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <label className="block space-y-2 text-sm font-medium text-gray-900">
          <span>Community name</span>
          <input
            type="text"
            value={communityName}
            onChange={(event) => onCommunityNameChange(event.target.value)}
            placeholder="Community name"
            className="field"
          />
        </label>
        <label className="block space-y-2 text-sm font-medium text-gray-900">
          <span>Password</span>
          <input
            type="password"
            value={communityPassword}
            onChange={(event) => onCommunityPasswordChange(event.target.value)}
            placeholder="If required"
            className="field"
          />
        </label>
      </div>
    </ModalFrame>
  );
}
