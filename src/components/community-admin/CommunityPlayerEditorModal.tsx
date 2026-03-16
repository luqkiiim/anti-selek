"use client";

import Link from "next/link";
import { ModalFrame } from "@/components/ui/chrome";
import {
  CommunityAdminClaimPill,
  CommunityAdminGenderPill,
  CommunityAdminRolePill,
} from "./communityAdminDisplay";
import type { CommunityAdminPlayer } from "./communityAdminTypes";
import { PartnerPreference, PlayerGender } from "@/types/enums";

interface CommunityPlayerEditorModalProps {
  player: CommunityAdminPlayer | null;
  communityId: string;
  editorName: string;
  editorRating: string;
  savingName: boolean;
  savingRating: boolean;
  savingRole: boolean;
  savingPreferences: boolean;
  onEditorNameChange: (value: string) => void;
  onEditorRatingChange: (value: string) => void;
  onClose: () => void;
  onRemovePlayer: (player: CommunityAdminPlayer) => void;
  onSavePlayerName: (player: CommunityAdminPlayer) => Promise<void>;
  onSavePlayerRating: (player: CommunityAdminPlayer) => Promise<void>;
  onUpdatePreferences: (
    player: CommunityAdminPlayer,
    updates: { gender?: PlayerGender; partnerPreference?: PartnerPreference }
  ) => Promise<void>;
  onPromotePlayer: (player: CommunityAdminPlayer) => Promise<void>;
  onOpenPasswordReset: (player: CommunityAdminPlayer) => void;
}

export function CommunityPlayerEditorModal({
  player,
  communityId,
  editorName,
  editorRating,
  savingName,
  savingRating,
  savingRole,
  savingPreferences,
  onEditorNameChange,
  onEditorRatingChange,
  onClose,
  onRemovePlayer,
  onSavePlayerName,
  onSavePlayerRating,
  onUpdatePreferences,
  onPromotePlayer,
  onOpenPasswordReset,
}: CommunityPlayerEditorModalProps) {
  if (!player) return null;

  return (
    <ModalFrame
      title={player.name}
      subtitle="Edit player details without turning the roster into a wall of forms."
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-between gap-3">
          <button
            type="button"
            onClick={() => onRemovePlayer(player)}
            className="app-button-danger px-4 py-2"
          >
            Remove player
          </button>
          <button
            type="button"
            onClick={onClose}
            className="app-button-secondary px-4 py-2"
          >
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-5 px-4 py-4 sm:px-5">
        <div className="app-panel-muted space-y-3 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Current profile
              </p>
              <p className="mt-1 text-lg font-semibold text-gray-900">
                {player.name}
              </p>
              <p className="text-sm text-gray-600">
                {player.email || "No email on file"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <CommunityAdminRolePill role={player.role} />
              <CommunityAdminClaimPill isClaimed={player.isClaimed} />
              <CommunityAdminGenderPill player={player} />
            </div>
          </div>
          <Link
            href={`/profile/${player.id}?communityId=${communityId}`}
            className="app-button-secondary inline-flex px-4 py-2"
          >
            View profile
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="app-panel-muted space-y-3 p-4">
            <label className="block space-y-2 text-sm font-medium text-gray-900">
              <span>Name</span>
              <input
                type="text"
                value={editorName}
                onChange={(event) => onEditorNameChange(event.target.value)}
                className="field"
              />
            </label>
            <button
              type="button"
              onClick={() => void onSavePlayerName(player)}
              disabled={savingName || editorName.trim() === player.name}
              className="app-button-primary px-4 py-2"
            >
              {savingName ? "Saving..." : "Save name"}
            </button>
          </div>

          <div className="app-panel-muted space-y-3 p-4">
            <label className="block space-y-2 text-sm font-medium text-gray-900">
              <span>Rating</span>
              <input
                type="number"
                value={editorRating}
                onChange={(event) => onEditorRatingChange(event.target.value)}
                className="field"
              />
            </label>
            <button
              type="button"
              onClick={() => void onSavePlayerRating(player)}
              disabled={savingRating || editorRating === `${player.elo}`}
              className="app-button-primary px-4 py-2"
            >
              {savingRating ? "Saving..." : "Save rating"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="app-panel-muted space-y-3 p-4">
            <label className="block space-y-2 text-sm font-medium text-gray-900">
              <span>Gender</span>
              <select
                value={player.gender}
                onChange={async (event) => {
                  const nextGender = event.target.value as PlayerGender;
                  const nextPreference =
                    nextGender === PlayerGender.MALE
                      ? PartnerPreference.OPEN
                      : PartnerPreference.FEMALE_FLEX;
                  await onUpdatePreferences(player, {
                    gender: nextGender,
                    partnerPreference: nextPreference,
                  });
                }}
                disabled={savingPreferences}
                className="field"
              >
                <option value={PlayerGender.MALE}>Male</option>
                <option value={PlayerGender.FEMALE}>Female</option>
              </select>
            </label>

            <label className="block space-y-2 text-sm font-medium text-gray-900">
              <span>Open tag</span>
              {player.gender === PlayerGender.FEMALE ? (
                <select
                  value={player.partnerPreference}
                  onChange={async (event) => {
                    const nextPreference =
                      event.target.value as PartnerPreference;
                    await onUpdatePreferences(player, {
                      partnerPreference: nextPreference,
                    });
                  }}
                  disabled={savingPreferences}
                  className="field"
                >
                  <option value={PartnerPreference.FEMALE_FLEX}>Default</option>
                  <option value={PartnerPreference.OPEN}>Open Tag</option>
                </select>
              ) : (
                <div className="field flex items-center text-sm text-gray-500">
                  Not needed
                </div>
              )}
            </label>

            {savingPreferences ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Saving preferences...
              </p>
            ) : null}
          </div>

          <div className="app-panel-muted space-y-4 p-4">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Admin access
              </p>
              <p className="mt-1 text-sm text-gray-600">
                Promote claimed members to admin when they need community
                control.
              </p>
            </div>

            {player.role === "ADMIN" ? (
              <p className="text-sm text-gray-600">
                This player already has admin access.
              </p>
            ) : player.isClaimed ? (
              <button
                type="button"
                onClick={() => void onPromotePlayer(player)}
                disabled={savingRole}
                className="app-button-secondary px-4 py-2"
              >
                {savingRole ? "Promoting..." : "Promote to admin"}
              </button>
            ) : (
              <p className="text-sm text-gray-600">
                Only claimed members can be promoted to admin.
              </p>
            )}

            {player.isClaimed && player.email ? (
              <button
                type="button"
                onClick={() => onOpenPasswordReset(player)}
                className="app-button-secondary px-4 py-2"
              >
                Reset password
              </button>
            ) : (
              <p className="text-sm text-gray-600">
                Password resets are only available for claimed members with an
                email.
              </p>
            )}
          </div>
        </div>
      </div>
    </ModalFrame>
  );
}
