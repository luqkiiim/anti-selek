"use client";

import { PlayerPickerSheet } from "@/components/ui/PlayerPickerSheet";
import {
  getMixedSideDisplayLabel,
  getMixedSideOverrideOptionForGender,
} from "@/lib/mixedSide";
import { MixedSide, PlayerGender, SessionMode, SessionPool } from "@/types/enums";
import type { CommunityGuestConfig } from "./communityTypes";

interface CommunityGuestsModalProps {
  open: boolean;
  guestConfigs: CommunityGuestConfig[];
  sessionMode: SessionMode;
  guestNameInput: string;
  guestGenderInput: PlayerGender;
  guestMixedSideOverrideInput: MixedSide | null;
  guestPoolInput: SessionPool;
  poolsEnabled: boolean;
  poolAName: string;
  poolBName: string;
  onGuestNameChange: (value: string) => void;
  onGuestGenderChange: (value: PlayerGender) => void;
  onGuestMixedSideOverrideChange: (value: MixedSide | null) => void;
  onGuestPoolChange: (value: SessionPool) => void;
  onAddGuest: () => void;
  onRemoveGuest: (name: string) => void;
  onClose: () => void;
}

export function CommunityGuestsModal({
  open,
  guestConfigs,
  sessionMode,
  guestNameInput,
  guestGenderInput,
  guestMixedSideOverrideInput,
  guestPoolInput,
  poolsEnabled,
  poolAName,
  poolBName,
  onGuestNameChange,
  onGuestGenderChange,
  onGuestMixedSideOverrideChange,
  onGuestPoolChange,
  onAddGuest,
  onRemoveGuest,
  onClose,
}: CommunityGuestsModalProps) {
  if (!open) return null;

  const mixedSideOption = getMixedSideOverrideOptionForGender(guestGenderInput);

  return (
    <PlayerPickerSheet
      open={open}
      title="Add Guests"
      subtitle={`${guestConfigs.length} added`}
      onClose={onClose}
      toolbar={
        <div className="app-subcard space-y-3 p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <span className="app-chip app-chip-accent">Guest</span>
            <p className="text-sm font-semibold text-gray-900">Pre-add guest</p>
          </div>

          <div
            className={`grid gap-2 ${
              sessionMode === SessionMode.MIXICANO
                ? "grid-cols-1 sm:grid-cols-2"
                : "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_auto]"
            }`}
          >
            <input
              type="text"
              value={guestNameInput}
              onChange={(event) => onGuestNameChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onAddGuest();
                }
              }}
              placeholder="Guest name"
              className="field px-3 py-2.5 text-sm"
            />
            <select
              value={guestGenderInput}
              onChange={(event) =>
                onGuestGenderChange(event.target.value as PlayerGender)
              }
              className="field px-3 py-2.5 text-sm"
            >
              <option value={PlayerGender.MALE}>Male</option>
              <option value={PlayerGender.FEMALE}>Female</option>
            </select>
            {poolsEnabled ? (
              <select
                value={guestPoolInput}
                onChange={(event) =>
                  onGuestPoolChange(event.target.value as SessionPool)
                }
                className="field px-3 py-2.5 text-sm"
              >
                <option value={SessionPool.A}>{poolAName}</option>
                <option value={SessionPool.B}>{poolBName}</option>
              </select>
            ) : null}
            {mixedSideOption ? (
              <select
                value={guestMixedSideOverrideInput ?? ""}
                onChange={(event) =>
                  onGuestMixedSideOverrideChange(
                    event.target.value
                      ? (event.target.value as MixedSide)
                      : null
                  )
                }
                className="field px-3 py-2.5 text-sm"
              >
                <option value="">Default</option>
                <option value={mixedSideOption.value}>{mixedSideOption.label}</option>
              </select>
            ) : null}
            <button
              type="button"
              onClick={onAddGuest}
              disabled={!guestNameInput.trim()}
              className="app-button-secondary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add Guest
            </button>
          </div>
        </div>
      }
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="app-button-primary">
            Done
          </button>
        </div>
      }
    >
      {guestConfigs.length === 0 ? (
        <div className="app-empty px-4 py-10 text-center">
          <p className="text-sm font-semibold text-gray-900">
            No guests added yet.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Add guest placeholders here before creating the tournament.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {guestConfigs.map((guest) => (
            <div
              key={guest.name}
              className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50/70 px-3 py-3"
            >
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {guest.name}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-600">
                    {guest.gender === PlayerGender.FEMALE ? "Female" : "Male"}
                  </span>
                  {poolsEnabled ? (
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-indigo-700">
                      {guest.pool === SessionPool.A ? poolAName : poolBName}
                    </span>
                  ) : null}
                  {guest.mixedSideOverride ? (
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700">
                      {getMixedSideDisplayLabel({
                        gender: guest.gender,
                        mixedSideOverride: guest.mixedSideOverride,
                        partnerPreference: guest.partnerPreference,
                      })}
                    </span>
                  ) : null}
                </div>
              </div>

              <button
                type="button"
                onClick={() => onRemoveGuest(guest.name)}
                className="app-button-danger px-3 py-2 text-[11px]"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </PlayerPickerSheet>
  );
}
