"use client";

import type { FormEvent } from "react";
import { ModalFrame } from "@/components/ui/chrome";
import { getMixedSideOverrideOptionForGender } from "@/lib/mixedSide";
import {
  ClubPlayerStatus,
  MixedSide,
  PlayerGender,
} from "@/types/enums";

interface CreateClubPlayerModalProps {
  open: boolean;
  name: string;
  newPlayerGender: PlayerGender;
  newPlayerMixedSideOverride: MixedSide | null;
  newPlayerStatus: ClubPlayerStatus;
  onNameChange: (value: string) => void;
  onNewPlayerGenderChange: (value: PlayerGender) => void;
  onNewPlayerMixedSideOverrideChange: (value: MixedSide | null) => void;
  onNewPlayerStatusChange: (value: ClubPlayerStatus) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function CreateClubPlayerModal({
  open,
  name,
  newPlayerGender,
  newPlayerMixedSideOverride,
  newPlayerStatus,
  onNameChange,
  onNewPlayerGenderChange,
  onNewPlayerMixedSideOverrideChange,
  onNewPlayerStatusChange,
  onClose,
  onSubmit,
}: CreateClubPlayerModalProps) {
  if (!open) return null;

  const mixedSideOption = getMixedSideOverrideOptionForGender(newPlayerGender);

  return (
    <ModalFrame
      title="Create player profile"
      subtitle="Create a brand-new placeholder profile for this club."
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
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
          <p className="text-sm font-semibold text-gray-900">
            Local placeholder only
          </p>
          <p className="mt-1 text-xs text-gray-600">
            Players who already belong in this club should join it
            themselves and request a claim on their placeholder profile.
          </p>
        </div>

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

        <label className="block space-y-2 text-sm font-medium text-gray-900">
          <span>Roster status</span>
          <select
            value={newPlayerStatus}
            onChange={(event) =>
              onNewPlayerStatusChange(
                event.target.value as ClubPlayerStatus
              )
            }
            className="field"
          >
            <option value={ClubPlayerStatus.CORE}>Core</option>
            <option value={ClubPlayerStatus.OCCASIONAL}>
              Occasional
            </option>
          </select>
        </label>
      </form>
    </ModalFrame>
  );
}
