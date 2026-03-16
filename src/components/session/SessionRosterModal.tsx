"use client";

import { PartnerPreference, PlayerGender } from "@/types/enums";
import type { CommunityUser } from "./sessionTypes";

const GUEST_ELO_PRESETS = [
  { label: "Beginner", value: 850 },
  { label: "Average", value: 1000 },
  { label: "Advanced", value: 1200 },
] as const;

interface SessionRosterModalProps {
  open: boolean;
  isAdmin: boolean;
  isMixicano: boolean;
  rosterSearch: string;
  guestName: string;
  guestGender: PlayerGender;
  guestPreference: PartnerPreference;
  guestInitialElo: number;
  addingGuest: boolean;
  addingPlayerId: string | null;
  playersNotInSession: CommunityUser[];
  onClose: () => void;
  onRosterSearchChange: (value: string) => void;
  onGuestNameChange: (value: string) => void;
  onGuestGenderChange: (value: PlayerGender) => void;
  onGuestPreferenceChange: (value: PartnerPreference) => void;
  onGuestInitialEloChange: (value: number) => void;
  onAddGuest: () => void;
  onAddPlayer: (userId: string) => void;
}

export function SessionRosterModal({
  open,
  isAdmin,
  isMixicano,
  rosterSearch,
  guestName,
  guestGender,
  guestPreference,
  guestInitialElo,
  addingGuest,
  addingPlayerId,
  playersNotInSession,
  onClose,
  onRosterSearchChange,
  onGuestNameChange,
  onGuestGenderChange,
  onGuestPreferenceChange,
  onGuestInitialEloChange,
  onAddGuest,
  onAddPlayer,
}: SessionRosterModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-900/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-lg animate-in slide-in-from-bottom flex-col rounded-t-3xl bg-white shadow-2xl duration-300 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h2 className="text-base font-black text-gray-900">Add Players</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-lg font-bold text-gray-400 hover:text-gray-600"
          >
            &times;
          </button>
        </div>

        <div className="space-y-2 border-b bg-gray-50/50 px-3 py-2">
          {isAdmin ? (
            <div
              className={`grid gap-2 ${
                isMixicano
                  ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                  : "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
              }`}
            >
              <input
                type="text"
                placeholder="Guest name..."
                value={guestName}
                onChange={(e) => onGuestNameChange(e.target.value)}
                className="h-9 flex-1 rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold transition-all focus:border-blue-500 focus:outline-none"
              />
              <select
                value={guestInitialElo}
                onChange={(e) => onGuestInitialEloChange(parseInt(e.target.value, 10))}
                className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-[10px] font-bold transition-all focus:border-blue-500 focus:outline-none"
              >
                {GUEST_ELO_PRESETS.map((preset) => (
                  <option key={preset.label} value={preset.value}>
                    {preset.label} ({preset.value})
                  </option>
                ))}
              </select>
              {isMixicano ? (
                <>
                  <select
                    value={guestGender}
                    onChange={(e) =>
                      onGuestGenderChange(e.target.value as PlayerGender)
                    }
                    className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-[10px] font-bold transition-all focus:border-blue-500 focus:outline-none"
                  >
                    <option value={PlayerGender.MALE}>Male</option>
                    <option value={PlayerGender.FEMALE}>Female</option>
                  </select>
                  <select
                    value={guestPreference}
                    onChange={(e) =>
                      onGuestPreferenceChange(
                        e.target.value as PartnerPreference
                      )
                    }
                    className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-[10px] font-bold transition-all focus:border-blue-500 focus:outline-none"
                  >
                    {guestGender === PlayerGender.FEMALE ? (
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
                onClick={onAddGuest}
                disabled={addingGuest || !guestName.trim()}
                className="h-9 w-full rounded-lg bg-gray-900 px-3 text-[10px] font-black uppercase tracking-wider text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {addingGuest ? "Adding..." : "Add"}
              </button>
            </div>
          ) : null}
          <input
            type="text"
            placeholder="Search players..."
            value={rosterSearch}
            onChange={(e) => onRosterSearchChange(e.target.value)}
            className="h-9 w-full rounded-lg border border-gray-200 bg-white px-3 text-xs font-bold transition-all focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex-1 space-y-1.5 overflow-y-auto p-2.5">
          {playersNotInSession.length === 0 ? (
            <div className="py-12 text-center text-sm italic text-gray-400">
              Everyone is already playing!
            </div>
          ) : (
            playersNotInSession.map((player) => (
              <div
                key={player.id}
                className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 px-3 py-2 transition-colors active:bg-gray-100"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <p className="truncate text-sm font-black text-gray-900">
                    {player.name}
                  </p>
                  <span className="whitespace-nowrap text-[9px] font-bold uppercase tracking-wider text-gray-500">
                    Rating {player.elo}
                  </span>
                </div>
                <button
                  onClick={() => onAddPlayer(player.id)}
                  disabled={addingPlayerId === player.id}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-white shadow-sm transition-all active:scale-95 disabled:opacity-50"
                >
                  {addingPlayerId === player.id ? "..." : "Add"}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end border-t bg-white p-3 sm:rounded-b-2xl">
          <button
            onClick={onClose}
            className="rounded-lg bg-gray-900 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-sm transition-all active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
