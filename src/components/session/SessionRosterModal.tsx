"use client";

import { PlayerPickerSheet } from "@/components/ui/PlayerPickerSheet";
import { SearchField } from "@/components/ui/SearchField";
import { getMixedSideOverrideOptionForGender } from "@/lib/mixedSide";
import { MixedSide, PlayerGender, SessionPool } from "@/types/enums";
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
  poolsEnabled: boolean;
  poolAName?: string | null;
  poolBName?: string | null;
  rosterSearch: string;
  rosterPool: SessionPool;
  guestName: string;
  guestGender: PlayerGender;
  guestMixedSideOverride: MixedSide | null;
  guestInitialElo: number;
  addingGuest: boolean;
  addingPlayerId: string | null;
  playersNotInSession: CommunityUser[];
  onClose: () => void;
  onRosterSearchChange: (value: string) => void;
  onRosterPoolChange: (value: SessionPool) => void;
  onGuestNameChange: (value: string) => void;
  onGuestGenderChange: (value: PlayerGender) => void;
  onGuestMixedSideOverrideChange: (value: MixedSide | null) => void;
  onGuestInitialEloChange: (value: number) => void;
  onAddGuest: () => void;
  onAddPlayer: (userId: string) => void;
}

export function SessionRosterModal({
  open,
  isAdmin,
  isMixicano,
  poolsEnabled,
  poolAName,
  poolBName,
  rosterSearch,
  rosterPool,
  guestName,
  guestGender,
  guestMixedSideOverride,
  guestInitialElo,
  addingGuest,
  addingPlayerId,
  playersNotInSession,
  onClose,
  onRosterSearchChange,
  onRosterPoolChange,
  onGuestNameChange,
  onGuestGenderChange,
  onGuestMixedSideOverrideChange,
  onGuestInitialEloChange,
  onAddGuest,
  onAddPlayer,
}: SessionRosterModalProps) {
  if (!open) return null;

  const mixedSideOption = getMixedSideOverrideOptionForGender(guestGender);

  return (
    <PlayerPickerSheet
      open={open}
      title="Add Players"
      subtitle={
        isAdmin
          ? "Search members or add a guest to this session."
          : "Search members and add them to this session."
      }
      onClose={onClose}
      toolbar={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchField
            value={rosterSearch}
            onChange={onRosterSearchChange}
            placeholder="Search players..."
            className="flex-1"
          />
          {poolsEnabled ? (
            <select
              value={rosterPool}
              onChange={(event) =>
                onRosterPoolChange(event.target.value as SessionPool)
              }
              className="field px-3 py-2.5 text-sm sm:max-w-[12rem]"
            >
              <option value={SessionPool.A}>{poolAName ?? "Open"}</option>
              <option value={SessionPool.B}>{poolBName ?? "Regular"}</option>
            </select>
          ) : null}
        </div>
      }
      bottomContent={
        isAdmin ? (
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
              {poolsEnabled ? (
                <select
                  value={rosterPool}
                  onChange={(event) =>
                    onRosterPoolChange(event.target.value as SessionPool)
                  }
                  className="field px-3 py-2.5 text-sm"
                >
                  <option value={SessionPool.A}>{poolAName ?? "Open"}</option>
                  <option value={SessionPool.B}>{poolBName ?? "Regular"}</option>
                </select>
              ) : null}
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
                    value={guestMixedSideOverride ?? ""}
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
                    {mixedSideOption ? (
                      <option value={mixedSideOption.value}>
                        {mixedSideOption.label}
                      </option>
                    ) : null}
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
        ) : null
      }
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="app-button-primary">
            Done
          </button>
        </div>
      }
    >
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
              className="app-touch-pan-y flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50/70 px-3 py-3 transition"
            >
              <div className="min-w-0 space-y-1">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {player.name}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs text-gray-500">Rating {player.elo}</p>
                  {poolsEnabled ? (
                    <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-indigo-700">
                      Add to {rosterPool === SessionPool.A ? poolAName ?? "Open" : poolBName ?? "Regular"}
                    </span>
                  ) : null}
                </div>
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
    </PlayerPickerSheet>
  );
}
