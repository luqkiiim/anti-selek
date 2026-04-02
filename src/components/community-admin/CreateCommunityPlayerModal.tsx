"use client";

import type { FormEvent } from "react";
import { ModalFrame } from "@/components/ui/chrome";
import { getMixedSideOverrideOptionForGender } from "@/lib/mixedSide";
import { MixedSide, PlayerGender } from "@/types/enums";

interface CreateCommunityPlayerModalProps {
  open: boolean;
  name: string;
  newPlayerGender: PlayerGender;
  newPlayerMixedSideOverride: MixedSide | null;
  onNameChange: (value: string) => void;
  onNewPlayerGenderChange: (value: PlayerGender) => void;
  onNewPlayerMixedSideOverrideChange: (value: MixedSide | null) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function CreateCommunityPlayerModal({
  open,
  name,
  newPlayerGender,
  newPlayerMixedSideOverride,
  onNameChange,
  onNewPlayerGenderChange,
  onNewPlayerMixedSideOverrideChange,
  onClose,
  onSubmit,
}: CreateCommunityPlayerModalProps) {
  if (!open) return null;

  const mixedSideOption = getMixedSideOverrideOptionForGender(newPlayerGender);

  return (
    <ModalFrame
      title="Create player profile"
      subtitle="Add a new member or placeholder profile to this community."
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="app-button-secondary px-4 py-2"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-player-form"
            className="app-button-primary px-4 py-2"
          >
            Create profile
          </button>
        </div>
      }
    >
      <form
        id="create-player-form"
        onSubmit={onSubmit}
        className="space-y-4 px-4 py-4 sm:px-5"
      >
        <label className="block space-y-2 text-sm font-medium text-gray-900">
          <span>Player name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            className="field"
            placeholder="Player name"
            required
          />
        </label>

        <label className="block space-y-2 text-sm font-medium text-gray-900">
          <span>Gender</span>
          <select
            value={newPlayerGender}
            onChange={(event) =>
              onNewPlayerGenderChange(event.target.value as PlayerGender)
            }
            className="field"
          >
            <option value={PlayerGender.MALE}>Male</option>
            <option value={PlayerGender.FEMALE}>Female</option>
          </select>
        </label>

        {mixedSideOption ? (
          <label className="block space-y-2 text-sm font-medium text-gray-900">
            <span>Mixed side</span>
            <select
              value={newPlayerMixedSideOverride ?? ""}
              onChange={(event) =>
                onNewPlayerMixedSideOverrideChange(
                  event.target.value
                    ? (event.target.value as MixedSide)
                    : null
                )
              }
              className="field"
            >
              <option value="">Default</option>
              <option value={mixedSideOption.value}>{mixedSideOption.label}</option>
            </select>
          </label>
        ) : null}
      </form>
    </ModalFrame>
  );
}
