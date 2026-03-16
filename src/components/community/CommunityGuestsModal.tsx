"use client";

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
    <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col animate-in slide-in-from-bottom duration-300">
        <div className="px-4 py-3 border-b flex justify-between items-center">
          <div>
            <h2 className="text-base font-black text-gray-900">Add Guests</h2>
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
              {guestConfigs.length} pre-added
            </p>
          </div>
          <button
            onClick={onClose}
            className="bg-gray-100 text-gray-400 hover:text-gray-600 w-7 h-7 rounded-full flex items-center justify-center text-lg font-bold"
          >
            &times;
          </button>
        </div>

        <div className="px-3 py-2 border-b bg-gray-50/50 space-y-2">
          <div
            className={`grid gap-2 ${
              sessionMode === SessionMode.MIXICANO
                ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                : "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
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
              className="h-9 bg-white border border-gray-200 rounded-lg px-3 text-xs font-bold focus:outline-none focus:border-blue-500 transition-all"
            />
            <select
              value={guestInitialEloInput}
              onChange={(event) =>
                onGuestInitialEloChange(parseInt(event.target.value, 10))
              }
              className="h-9 bg-white border border-gray-200 rounded-lg px-2 text-[10px] font-bold focus:outline-none focus:border-blue-500 transition-all"
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
                  className="h-9 bg-white border border-gray-200 rounded-lg px-2 text-[10px] font-bold focus:outline-none focus:border-blue-500 transition-all"
                >
                  <option value={PlayerGender.MALE} className="text-gray-900">
                    Male
                  </option>
                  <option
                    value={PlayerGender.FEMALE}
                    className="text-gray-900"
                  >
                    Female
                  </option>
                </select>
                <select
                  value={guestPreferenceInput}
                  onChange={(event) =>
                    onGuestPreferenceChange(
                      event.target.value as PartnerPreference
                    )
                  }
                  className="h-9 bg-white border border-gray-200 rounded-lg px-2 text-[10px] font-bold focus:outline-none focus:border-blue-500 transition-all"
                >
                  {guestGenderInput === PlayerGender.FEMALE ? (
                    <>
                      <option
                        value={PartnerPreference.FEMALE_FLEX}
                        className="text-gray-900"
                      >
                        Default
                      </option>
                      <option
                        value={PartnerPreference.OPEN}
                        className="text-gray-900"
                      >
                        Open Tag
                      </option>
                    </>
                  ) : (
                    <option
                      value={PartnerPreference.OPEN}
                      className="text-gray-900"
                    >
                      Open
                    </option>
                  )}
                </select>
              </>
            ) : null}
            <button
              type="button"
              onClick={onAddGuest}
              disabled={!guestNameInput.trim()}
              className="h-9 bg-gray-900 text-white px-3 rounded-lg text-[10px] font-black uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
            >
              Add
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          {guestConfigs.length === 0 ? (
            <div className="text-center py-10 text-gray-400 italic text-sm">
              No guests added yet.
            </div>
          ) : (
            guestConfigs.map((guest) => (
              <div
                key={guest.name}
                className="flex justify-between items-center px-3 py-2 rounded-xl border bg-gray-50 border-gray-100"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <p className="font-black text-sm text-gray-900 truncate">
                    {guest.name}
                  </p>
                  {sessionMode === SessionMode.MIXICANO ? (
                    <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider whitespace-nowrap">
                      {guest.gender === PlayerGender.FEMALE
                        ? guest.partnerPreference === PartnerPreference.OPEN
                          ? "F / Open Tag"
                          : "F / Default"
                        : "M"}
                    </span>
                  ) : null}
                  <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider whitespace-nowrap">
                    Rating {guest.initialElo}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveGuest(guest.name)}
                  className="text-[10px] text-red-600 font-black uppercase tracking-widest"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>

        <div className="p-3 bg-white border-t sm:rounded-b-2xl flex justify-end">
          <button
            onClick={onClose}
            className="bg-gray-900 text-white px-4 py-2 rounded-lg font-black uppercase tracking-widest text-[10px] shadow-sm active:scale-95 transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
