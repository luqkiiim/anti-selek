"use client";

import { ModalFrame } from "@/components/ui/chrome";

interface CreateCommunityModalProps {
  open: boolean;
  communityName: string;
  communityPassword: string;
  creatingCommunity: boolean;
  onCommunityNameChange: (value: string) => void;
  onCommunityPasswordChange: (value: string) => void;
  onClose: () => void;
  onCreateCommunity: () => void;
}

export function CreateCommunityModal({
  open,
  communityName,
  communityPassword,
  creatingCommunity,
  onCommunityNameChange,
  onCommunityPasswordChange,
  onClose,
  onCreateCommunity,
}: CreateCommunityModalProps) {
  if (!open) return null;

  return (
    <ModalFrame
      title="Create community"
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
            onClick={onCreateCommunity}
            disabled={creatingCommunity || !communityName.trim()}
            className="app-button-primary"
          >
            {creatingCommunity ? "Creating..." : "Create"}
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
            placeholder="Unique community name"
            className="field"
          />
        </label>
        <label className="block space-y-2 text-sm font-medium text-gray-900">
          <span>Password</span>
          <input
            type="password"
            value={communityPassword}
            onChange={(event) => onCommunityPasswordChange(event.target.value)}
            placeholder="Optional"
            className="field"
          />
        </label>
      </div>
    </ModalFrame>
  );
}
