"use client";

import { ModalFrame } from "@/components/ui/chrome";
import { SearchField } from "@/components/ui/SearchField";
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
    <ModalFrame
      title="Add Players"
      subtitle={
        isAdmin
          ? "Search members or add a guest to this session."
          : "Search members and add them to this session."
      }
      onClose={onClose}
      bodyScroll={false}
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="app-button-primary">
            Done
          </button>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col px-4 py-4 sm:px-5">
        <div className="shrink-0">
          <SearchField
            value={rosterSearch}
            onChange={onRosterSearchChange}
            placeholder="Search players..."
          />
        </div>

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1 pb-2">
          {playersNotInSession.length === 0 ? (
            <div className="app-empty px-4 py-10 text-center">
              <p className="text-sm font-semibold text-gray-900">
                Everyone is already playing.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {playersNotInSession.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50/70 px-3 py-3 transition"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {player.name}
                    </p>
                    <p className="text-xs text-gray-500">Rating {player.elo}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onAddPlayer(player.id)}
                    disabled={addingPlayerId === player.id}
                    className="app-button-primary px-4 py-2.5 disabled:opacity-50"
                  >
                    {addingPlayerId === player.id ? "Adding..." : "Add"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {isAdmin ? (
          <div className="mt-4 shrink-0">
            <div className="app-subcard space-y-3 p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <span className="app-chip app-chip-accent">Guest</span>
                <p className="text-sm font-semibold text-gray-900">Add guest</p>
              </div>

              <div
                className={`grid gap-2 ${
                  isMixicano
                    ? "grid-cols-1 sm:grid-cols-2"
                    : "grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,11rem)_auto]"
                }`}
              >
                <input
                  type="text"
                  placeholder="Guest name"
                  value={guestName}
                  onChange={(event) => onGuestNameChange(event.target.value)}
                  className="field px-3 py-2.5 text-sm"
                />
                <select
                  value={guestInitialElo}
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
                {isMixicano ? (
                  <>
                    <select
                      value={guestGender}
                      onChange={(event) =>
                        onGuestGenderChange(event.target.value as PlayerGender)
                      }
                      className="field px-3 py-2.5 text-sm"
                    >
                      <option value={PlayerGender.MALE}>Male</option>
                      <option value={PlayerGender.FEMALE}>Female</option>
                    </select>
                    <select
                      value={guestPreference}
                      onChange={(event) =>
                        onGuestPreferenceChange(
                          event.target.value as PartnerPreference
                        )
                      }
                      className="field px-3 py-2.5 text-sm"
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
                  type="button"
                  onClick={onAddGuest}
                  disabled={addingGuest || !guestName.trim()}
                  className="app-button-secondary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {addingGuest ? "Adding..." : "Add Guest"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ModalFrame>
  );
}
