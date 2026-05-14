"use client";

import type { FormEvent } from "react";
import { ModalFrame } from "@/components/ui/chrome";
import { getMixedSideOverrideOptionForGender } from "@/lib/mixedSide";
import {
  CommunityPlayerStatus,
  MixedSide,
  PlayerGender,
} from "@/types/enums";
import type { LinkableCommunityPlayer } from "@/app/community/[id]/admin/useCommunityAdminPlayerActions";

interface CreateCommunityPlayerModalProps {
  open: boolean;
  name: string;
  linkSearch: string;
  linkCandidates: LinkableCommunityPlayer[];
  loadingLinkCandidates: boolean;
  linkingPlayerId: string | null;
  newPlayerGender: PlayerGender;
  newPlayerMixedSideOverride: MixedSide | null;
  newPlayerStatus: CommunityPlayerStatus;
  onNameChange: (value: string) => void;
  onLinkSearchChange: (value: string) => void;
  onLinkExistingPlayer: (player: LinkableCommunityPlayer) => void;
  onNewPlayerGenderChange: (value: PlayerGender) => void;
  onNewPlayerMixedSideOverrideChange: (value: MixedSide | null) => void;
  onNewPlayerStatusChange: (value: CommunityPlayerStatus) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function CreateCommunityPlayerModal({
  open,
  name,
  linkSearch,
  linkCandidates,
  loadingLinkCandidates,
  linkingPlayerId,
  newPlayerGender,
  newPlayerMixedSideOverride,
  newPlayerStatus,
  onNameChange,
  onLinkSearchChange,
  onLinkExistingPlayer,
  onNewPlayerGenderChange,
  onNewPlayerMixedSideOverrideChange,
  onNewPlayerStatusChange,
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
        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3">
          <p className="text-sm font-semibold text-gray-900">
            Link existing unclaimed player
          </p>
          <p className="mt-1 text-xs text-gray-600">
            Use this when the same unsigned-up person already exists in another
            community. Names are only display text; linking uses the player ID.
          </p>
          <input
            type="search"
            value={linkSearch}
            onChange={(event) => onLinkSearchChange(event.target.value)}
            className="field mt-3"
            placeholder="Search existing placeholders"
          />
          <div className="mt-3 space-y-2">
            {loadingLinkCandidates ? (
              <p className="text-xs font-semibold text-gray-500">Loading...</p>
            ) : linkCandidates.length === 0 ? (
              <p className="text-xs font-semibold text-gray-500">
                No linkable placeholders found.
              </p>
            ) : (
              linkCandidates.slice(0, 5).map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {player.name}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {player.communities
                        .map((community) => `${community.name} ${community.elo}`)
                        .join(" | ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onLinkExistingPlayer(player)}
                    disabled={linkingPlayerId !== null}
                    className="app-button-secondary shrink-0 px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {linkingPlayerId === player.id ? "Linking..." : "Link"}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="border-t border-gray-200 pt-4">
          <p className="text-sm font-semibold text-gray-900">
            Or create a new placeholder
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
                event.target.value as CommunityPlayerStatus
              )
            }
            className="field"
          >
            <option value={CommunityPlayerStatus.CORE}>Core</option>
            <option value={CommunityPlayerStatus.OCCASIONAL}>
              Occasional
            </option>
          </select>
        </label>
      </form>
    </ModalFrame>
  );
}
