"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { PlayerPickerSheet } from "@/components/ui/PlayerPickerSheet";
import { SearchField } from "@/components/ui/SearchField";
import { getMixedSideOverrideOptionForGender } from "@/lib/mixedSide";
import {
  ClubPlayerStatus,
  MixedSide,
  PlayerGender,
  SessionPool,
} from "@/types/enums";
import type { ClubUser } from "./sessionTypes";

const GUEST_ELO_PRESETS = [
  { label: "Beginner", value: 850 },
  { label: "Average", value: 1000 },
  { label: "Advanced", value: 1200 },
] as const;

interface SessionRosterModalProps {
  open: boolean;
  isAdmin: boolean;
  isMixicano: boolean;
  isInterclub: boolean;
  interclubClubOptions: Array<{ id: string; name: string }>;
  poolsEnabled: boolean;
  poolAName?: string | null;
  poolBName?: string | null;
  rosterSearch: string;
  rosterPool: SessionPool;
  guestName: string;
  guestGender: PlayerGender;
  guestMixedSideOverride: MixedSide | null;
  guestRepresentingClubId: string;
  guestInitialElo: number;
  addingGuest: boolean;
  addingPlayerId: string | null;
  playersNotInSession: ClubUser[];
  onClose: () => void;
  onRosterSearchChange: (value: string) => void;
  onRosterPoolChange: (value: SessionPool) => void;
  onGuestNameChange: (value: string) => void;
  onGuestGenderChange: (value: PlayerGender) => void;
  onGuestMixedSideOverrideChange: (value: MixedSide | null) => void;
  onGuestRepresentingClubChange: (value: string) => void;
  onGuestInitialEloChange: (value: number) => void;
  onAddGuest: () => void;
  onAddPlayer: (player: ClubUser) => void;
}

export function SessionRosterModal({
  open,
  isAdmin,
  isMixicano,
  isInterclub,
  interclubClubOptions,
  poolsEnabled,
  poolAName,
  poolBName,
  rosterSearch,
  rosterPool,
  guestName,
  guestGender,
  guestMixedSideOverride,
  guestRepresentingClubId,
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
  onGuestRepresentingClubChange,
  onGuestInitialEloChange,
  onAddGuest,
  onAddPlayer,
}: SessionRosterModalProps) {
  const [guestFormOpen, setGuestFormOpen] = useState(false);

  if (!open) return null;

  const mixedSideOption = getMixedSideOverrideOptionForGender(guestGender);
  const handleClose = () => {
    setGuestFormOpen(false);
    onClose();
  };
  const guestForm = isAdmin ? (
    <div className="app-subcard space-y-3 p-3 sm:p-4">
      <button
        type="button"
        onClick={() => setGuestFormOpen((isOpen) => !isOpen)}
        aria-expanded={guestFormOpen}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="app-chip app-chip-accent">Guest</span>
          <span className="text-sm font-semibold text-gray-900">
            Add guest instead
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          size={18}
          className={`shrink-0 text-gray-500 transition ${
            guestFormOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {guestFormOpen ? (
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
          {isInterclub ? (
            <select
              aria-label="Guest representing club"
              value={guestRepresentingClubId}
              onChange={(event) =>
                onGuestRepresentingClubChange(event.target.value)
              }
              className="field px-3 py-2.5 text-sm"
            >
              {interclubClubOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
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
      ) : (
        <p className="text-xs leading-5 text-gray-500">
          Use this when someone is not in the club roster.
        </p>
      )}
    </div>
  ) : null;

  return (
    <PlayerPickerSheet
      open={open}
      title="Add Players"
      subtitle={
        isAdmin
          ? "Members or guests."
          : "Members"
      }
      onClose={handleClose}
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
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleClose}
            className="app-button-primary"
          >
            Done
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {guestForm}

        {playersNotInSession.length === 0 ? (
          <div className="app-empty px-4 py-10 text-center">
            <p className="text-sm font-semibold text-gray-900">
              No available club players.
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Try another search or add a guest instead.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {playersNotInSession.map((player) => {
              const rosterEntryId = `${player.id}:${
                player.representingClubId ?? ""
              }`;

              return (
              <div
                key={rosterEntryId}
                className="app-touch-pan-y flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-3 transition"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <Avatar
                    name={player.name}
                    avatarUrl={player.avatarUrl}
                    size="sm"
                  />
                  <div className="min-w-0 space-y-1">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {player.name}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs text-gray-500">Rating {player.elo}</p>
                      {player.status === ClubPlayerStatus.OCCASIONAL ? (
                        <span className="app-chip app-chip-success px-2 py-0.5 text-[10px]">
                          Occasional
                        </span>
                      ) : null}
                      {player.representingClubName ? (
                        <span className="app-chip app-chip-accent px-2 py-0.5 text-[10px]">
                          {player.representingClubName}
                        </span>
                      ) : null}
                      {poolsEnabled ? (
                        <span className="app-chip app-chip-accent px-2 py-0.5 text-[10px]">
                          Add to{" "}
                          {rosterPool === SessionPool.A
                            ? poolAName ?? "Open"
                            : poolBName ?? "Regular"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onAddPlayer(player)}
                  disabled={addingPlayerId === rosterEntryId}
                  className="app-button-primary px-4 py-2.5 disabled:opacity-50"
                >
                  {addingPlayerId === rosterEntryId ? "Adding..." : "Add"}
                </button>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </PlayerPickerSheet>
  );
}
