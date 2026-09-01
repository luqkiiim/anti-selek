"use client";

import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { GuestDefinitionModal } from "@/components/ui/GuestDefinitionModal";
import { PlayerPickerSheet } from "@/components/ui/PlayerPickerSheet";
import { SearchField } from "@/components/ui/SearchField";
import { getPlayerGroupLabel } from "@/lib/playerGroups";
import {
  ClubPlayerStatus,
  MixedSide,
  PlayerGender,
  SessionPool,
} from "@/types/enums";
import type { ClubUser } from "./sessionTypes";

interface SessionRosterModalProps {
  open: boolean;
  isAdmin: boolean;
  isMixicano: boolean;
  isInterclub: boolean;
  interclubClubOptions: Array<{ id: string; name: string }>;
  poolsEnabled: boolean;
  rosterSearch: string;
  rosterPool: SessionPool;
  rosterPlayerPools: Record<string, SessionPool>;
  guestName: string;
  guestGender: PlayerGender;
  guestMixedSideOverride: MixedSide | null;
  guestRepresentingClubId: string;
  guestInitialElo: number;
  guestFormError: string;
  addingGuest: boolean;
  addingPlayerId: string | null;
  playersNotInSession: ClubUser[];
  existingParticipantNames: string[];
  onClose: () => void;
  onRosterSearchChange: (value: string) => void;
  onRosterPoolChange: (value: SessionPool) => void;
  onRosterPlayerPoolChange: (userId: string, value: SessionPool) => void;
  onGuestNameChange: (value: string) => void;
  onGuestGenderChange: (value: PlayerGender) => void;
  onGuestMixedSideOverrideChange: (value: MixedSide | null) => void;
  onGuestRepresentingClubChange: (value: string) => void;
  onGuestInitialEloChange: (value: number) => void;
  onResetGuestDraft: () => void;
  onAddGuest: () => Promise<boolean>;
  onAddPlayer: (player: ClubUser) => void;
}

export function SessionRosterModal({
  open,
  isAdmin,
  isMixicano,
  isInterclub,
  interclubClubOptions,
  poolsEnabled,
  rosterSearch,
  rosterPool,
  rosterPlayerPools,
  guestName,
  guestGender,
  guestMixedSideOverride,
  guestRepresentingClubId,
  guestInitialElo,
  guestFormError,
  addingGuest,
  addingPlayerId,
  playersNotInSession,
  existingParticipantNames,
  onClose,
  onRosterSearchChange,
  onRosterPoolChange,
  onRosterPlayerPoolChange,
  onGuestNameChange,
  onGuestGenderChange,
  onGuestMixedSideOverrideChange,
  onGuestRepresentingClubChange,
  onGuestInitialEloChange,
  onResetGuestDraft,
  onAddGuest,
  onAddPlayer,
}: SessionRosterModalProps) {
  const [guestModalOpen, setGuestModalOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  if (!open) return null;

  const trimmedSearch = rosterSearch.trim();
  const normalizedSearch = trimmedSearch.toLowerCase();
  const hasExactAvailableMemberMatch = playersNotInSession.some(
    (player) => player.name.trim().toLowerCase() === normalizedSearch
  );
  const hasExactParticipantMatch = existingParticipantNames.some(
    (name) => name.trim().toLowerCase() === normalizedSearch
  );
  const canAddGuest =
    isAdmin &&
    trimmedSearch.length >= 2 &&
    !hasExactAvailableMemberMatch &&
    !hasExactParticipantMatch;

  function openGuestModal() {
    onResetGuestDraft();
    onGuestNameChange(trimmedSearch);
    setGuestModalOpen(true);
  }

  function closeGuestModal() {
    if (addingGuest) return;
    setGuestModalOpen(false);
    onResetGuestDraft();
  }

  async function submitGuest() {
    if (!(await onAddGuest())) return;
    setGuestModalOpen(false);
    onRosterSearchChange("");
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function closePicker() {
    setGuestModalOpen(false);
    onClose();
  }

  return (
    <>
      <PlayerPickerSheet
        open={open}
        title="Add players"
        subtitle={isAdmin ? "Members or guests." : "Members"}
        onClose={closePicker}
        toolbar={
          <SearchField
            ariaLabel="Search available club players"
            value={rosterSearch}
            onChange={onRosterSearchChange}
            placeholder="Search players..."
            className="flex-1"
            inputRef={searchInputRef}
          />
        }
        footer={
          <div className="flex justify-end">
            <button type="button" onClick={closePicker} className="app-button-primary">
              Done
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          {playersNotInSession.length > 0 ? (
            <div className="space-y-2">
              {playersNotInSession.map((player) => {
                const rosterEntryId = `${player.id}:${player.representingClubId ?? ""}`;
                const selectedGroup =
                  rosterPlayerPools[player.id] ?? player.preferredPool ?? SessionPool.B;

                return (
                  <div
                    key={rosterEntryId}
                    className="app-touch-pan-y flex flex-col gap-3 rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-3 transition sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <Avatar name={player.name} avatarUrl={player.avatarUrl} size="sm" />
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
                              {getPlayerGroupLabel(selectedGroup)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex w-full shrink-0 items-center justify-end gap-2 sm:w-auto">
                      {poolsEnabled ? (
                        <select
                          aria-label={`Game group for ${player.name}`}
                          value={selectedGroup}
                          onChange={(event) =>
                            onRosterPlayerPoolChange(
                              player.id,
                              event.target.value as SessionPool
                            )
                          }
                          className="field max-w-[8.5rem] px-2 py-2 text-xs"
                        >
                          <option value={SessionPool.A}>Competitive</option>
                          <option value={SessionPool.B}>Social</option>
                        </select>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => onAddPlayer(player)}
                        disabled={addingPlayerId === rosterEntryId}
                        className="app-button-primary px-4 py-2.5 disabled:opacity-50"
                      >
                        {addingPlayerId === rosterEntryId ? "Adding..." : "Add"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {canAddGuest ? (
            <button
              type="button"
              onClick={openGuestModal}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-dashed border-[rgba(15,118,110,0.32)] bg-[var(--accent-faint)] px-4 py-4 text-left transition hover:border-[var(--accent)] hover:bg-white"
            >
              <span>
                <span className="block text-sm font-semibold text-gray-900">
                  Add “{trimmedSearch}” as a guest
                </span>
                <span className="mt-1 block text-xs text-gray-500">
                  No exact club player match.
                </span>
              </span>
              <span className="app-chip app-chip-accent shrink-0">Guest</span>
            </button>
          ) : null}

          {playersNotInSession.length === 0 && !canAddGuest ? (
            <div className="app-empty px-4 py-10 text-center">
              <p className="text-sm font-semibold text-gray-900">
                {hasExactParticipantMatch
                  ? "This player is already in the tournament."
                  : "No available club players."}
              </p>
              <p className="mt-2 text-sm text-gray-500">
                {isAdmin && trimmedSearch.length > 0 && trimmedSearch.length < 2
                  ? "Type at least 2 characters to add a guest."
                  : isAdmin
                    ? "Search for someone to add them as a guest."
                    : "Try another search."}
              </p>
            </div>
          ) : null}
        </div>
      </PlayerPickerSheet>

      <GuestDefinitionModal
        open={guestModalOpen}
        name={guestName}
        initialElo={guestInitialElo}
        gender={guestGender}
        mixedSideOverride={guestMixedSideOverride}
        pool={rosterPool}
        representingClubId={guestRepresentingClubId}
        isMixed={isMixicano}
        poolsEnabled={poolsEnabled}
        isInterclub={isInterclub}
        interclubClubOptions={interclubClubOptions}
        submitting={addingGuest}
        error={guestFormError}
        onNameChange={onGuestNameChange}
        onInitialEloChange={onGuestInitialEloChange}
        onGenderChange={onGuestGenderChange}
        onMixedSideOverrideChange={onGuestMixedSideOverrideChange}
        onPoolChange={onRosterPoolChange}
        onRepresentingClubChange={onGuestRepresentingClubChange}
        onClose={closeGuestModal}
        onSubmit={() => void submitGuest()}
      />
    </>
  );
}
