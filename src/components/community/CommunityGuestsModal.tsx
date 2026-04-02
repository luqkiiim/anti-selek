"use client";

import { PlayerPickerSheet } from "@/components/ui/PlayerPickerSheet";
import { PartnerPreference, PlayerGender, SessionMode } from "@/types/enums";
import type { CommunityGuestConfig } from "./communityTypes";

const GUEST_ELO_PRESETS = [
  { label: "Beginner", value: 850 },
  { label: "Average", value: 1000 },
  { label: "Advanced", value: 1200 },
] as const;

interface CommunityGuestsModalProps {
  open: boolean;
  guestConfigs: CommunityGuestConfig[];
  sessionMode: SessionMode;
  guestNameInput: string;
  guestGenderInput: PlayerGender;
  guestPreferenceInput: PartnerPreference;
  guestInitialEloInput: number;
  onGuestNameChange: (value: string) => void;
  onGuestGenderChange: (value: PlayerGender) => void;
  onGuestPreferenceChange: (value: PartnerPreference) => void;
  onGuestInitialEloChange: (value: number) => void;
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
  guestPreferenceInput,
  guestInitialEloInput,
  onGuestNameChange,
  onGuestGenderChange,
  onGuestPreferenceChange,
  onGuestInitialEloChange,
  onAddGuest,
  onRemoveGuest,
  onClose,
}: CommunityGuestsModalProps) {
  if (!open) return null;

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
              value={guestInitialEloInput}
              onChange={(event) =>
                onGuestInitialEloChange(parseInt(event.target.value, 10))
              }
              className="field px-3 py-2.5 text-sm"
            >
              {GUEST_ELO_PRESETS.map((preset) => (
                <option key={preset.label} value={preset.value}>
                  {preset.label} ({preset.value})
                </option>
              ))}
            </select>
            {sessionMode === SessionMode.MIXICANO ? (
              <>
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
                <select
                  value={guestPreferenceInput}
                  onChange={(event) =>
                    onGuestPreferenceChange(
                      event.target.value as PartnerPreference
                    )
                  }
                  className="field px-3 py-2.5 text-sm"
                >
                  {guestGenderInput === PlayerGender.FEMALE ? (
                    <>
                      <option value={PartnerPreference.FEMALE_FLEX}>
                        Default
                      </option>
                      <option value={PartnerPreference.OPEN}>Open Tag</option>
                    </>
                  ) : (
                    <option value={PartnerPreference.OPEN}>Open</option>
                  )}
                </select>
              </>
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
                  {sessionMode === SessionMode.MIXICANO ? (
                    <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-600">
                      {guest.gender === PlayerGender.FEMALE
                        ? guest.partnerPreference === PartnerPreference.OPEN
                          ? "F / Open Tag"
                          : "F / Default"
                        : "M"}
                    </span>
                  ) : null}
                  <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-700">
                    Rating {guest.initialElo}
                  </span>
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
