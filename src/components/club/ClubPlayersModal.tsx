"use client";

import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { GuestDefinitionModal } from "@/components/ui/GuestDefinitionModal";
import { PlayerPickerSheet } from "@/components/ui/PlayerPickerSheet";
import { SearchField } from "@/components/ui/SearchField";
import { getPlayerGroupLabel } from "@/lib/playerGroups";
import type {
  ClubCollabCandidate,
  ClubGuestConfig,
  ClubPageMember,
} from "./clubTypes";
import {
  ClubPlayerStatus,
  MixedSide,
  PlayerGender,
  SessionCollabFormat,
  SessionPool,
} from "@/types/enums";

interface ClubPlayersModalProps {
  open: boolean;
  selectedPlayerIds: string[];
  selectedPlayerPools: Record<string, SessionPool>;
  playerSearch: string;
  poolsEnabled: boolean;
  canSavePreferredPools: boolean;
  savingPreferredPoolPlayerId: string | null;
  selectablePlayers: ClubPageMember[];
  filteredSelectablePlayers: ClubPageMember[];
  onPlayerSearchChange: (value: string) => void;
  onToggleAllPlayers: () => void;
  onTogglePlayerSelection: (playerId: string) => void;
  onChangePlayerPool: (playerId: string, pool: SessionPool) => void;
  onSavePlayerPreferredPool: (
    playerId: string,
    pool: SessionPool
  ) => Promise<void>;
  collabFormat: SessionCollabFormat;
  hostClubId: string;
  hostClubName: string;
  selectedPartnerClub: ClubCollabCandidate | null;
  selectedPlayerRepresentingClubs: Record<string, string | null>;
  guestConfigs: ClubGuestConfig[];
  guestNameInput: string;
  guestInitialEloInput: number;
  guestGenderInput: PlayerGender;
  guestMixedSideOverrideInput: MixedSide | null;
  guestPoolInput: SessionPool;
  guestRepresentingClubInput: string;
  guestFormError: string;
  isMixed: boolean;
  interclubClubOptions: Array<{ id: string; name: string }>;
  onChangePlayerRepresentingClub: (
    playerId: string,
    representingClubId: string | null
  ) => void;
  onGuestNameChange: (value: string) => void;
  onGuestInitialEloChange: (value: number) => void;
  onGuestGenderChange: (value: PlayerGender) => void;
  onGuestMixedSideOverrideChange: (value: MixedSide | null) => void;
  onGuestPoolChange: (value: SessionPool) => void;
  onGuestRepresentingClubChange: (value: string) => void;
  onAddGuest: () => boolean;
  onRemoveGuest: (name: string) => void;
  onResetGuestDraft: () => void;
  onClose: () => void;
}

export function ClubPlayersModal({
  open,
  selectedPlayerIds,
  selectedPlayerPools,
  playerSearch,
  poolsEnabled,
  canSavePreferredPools,
  savingPreferredPoolPlayerId,
  selectablePlayers,
  filteredSelectablePlayers,
  onPlayerSearchChange,
  onToggleAllPlayers,
  onTogglePlayerSelection,
  onChangePlayerPool,
  onSavePlayerPreferredPool,
  collabFormat,
  hostClubId,
  hostClubName,
  selectedPartnerClub,
  selectedPlayerRepresentingClubs,
  guestConfigs,
  guestNameInput,
  guestInitialEloInput,
  guestGenderInput,
  guestMixedSideOverrideInput,
  guestPoolInput,
  guestRepresentingClubInput,
  guestFormError,
  isMixed,
  interclubClubOptions,
  onChangePlayerRepresentingClub,
  onGuestNameChange,
  onGuestInitialEloChange,
  onGuestGenderChange,
  onGuestMixedSideOverrideChange,
  onGuestPoolChange,
  onGuestRepresentingClubChange,
  onAddGuest,
  onRemoveGuest,
  onResetGuestDraft,
  onClose,
}: ClubPlayersModalProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const shouldRestoreSearchFocusRef = useRef(false);
  const [guestModalOpen, setGuestModalOpen] = useState(false);

  if (!open) return null;

  const isInterclub =
    collabFormat === SessionCollabFormat.INTERCLUB && !!selectedPartnerClub;
  const trimmedSearch = playerSearch.trim();
  const normalizedSearch = trimmedSearch.toLowerCase();
  const hasExactMemberMatch = selectablePlayers.some(
    (player) => player.name.trim().toLowerCase() === normalizedSearch
  );
  const hasExactGuestMatch = guestConfigs.some(
    (guest) => guest.name.trim().toLowerCase() === normalizedSearch
  );
  const canAddGuest =
    trimmedSearch.length >= 2 && !hasExactMemberMatch && !hasExactGuestMatch;
  const visibleGuests = guestConfigs.filter((guest) =>
    normalizedSearch.length > 0
      ? guest.name.toLowerCase().includes(normalizedSearch)
      : true
  );

  function focusSearch() {
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }

  function openGuestModal() {
    onResetGuestDraft();
    onGuestNameChange(trimmedSearch);
    setGuestModalOpen(true);
  }

  function closeGuestModal() {
    setGuestModalOpen(false);
    onResetGuestDraft();
  }

  function submitGuest() {
    if (!onAddGuest()) return;
    setGuestModalOpen(false);
    onPlayerSearchChange("");
    focusSearch();
  }

  function closePicker() {
    setGuestModalOpen(false);
    onClose();
  }

  function getRepresentingClubOptions(player: ClubPageMember) {
    if (!selectedPartnerClub) {
      return [];
    }

    const labelsByClubId = new Map([
      [hostClubId, hostClubName],
      [selectedPartnerClub.id, selectedPartnerClub.name],
    ]);
    const validIds = new Set(labelsByClubId.keys());
    const badges = [
      ...(player.communityBadges ?? []),
      ...(player.linkedClubBadges ?? []),
    ];
    const eligibleIds = Array.from(
      new Set(
        badges
          .map((badge) => badge.id)
          .filter((clubId) => validIds.has(clubId))
      )
    );

    return eligibleIds.map((clubId) => ({
      id: clubId,
      name: labelsByClubId.get(clubId) ?? clubId,
    }));
  }

  function captureSearchFocusIntent() {
    shouldRestoreSearchFocusRef.current =
      document.activeElement === searchInputRef.current;
  }

  function restoreSearchFocusIfNeeded() {
    const shouldRestoreSearchFocus = shouldRestoreSearchFocusRef.current;
    shouldRestoreSearchFocusRef.current = false;

    if (!shouldRestoreSearchFocus) {
      return;
    }

    searchInputRef.current?.focus();
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });
  }

  return (
    <>
    <PlayerPickerSheet
      open={open}
      title="Add players"
      subtitle={`${selectedPlayerIds.length + guestConfigs.length} added`}
      onClose={closePicker}
      toolbar={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchField
            ariaLabel="Search club players"
            value={playerSearch}
            onChange={onPlayerSearchChange}
            placeholder="Search players..."
            className="flex-1"
            inputRef={searchInputRef}
          />
          <button
            type="button"
            onPointerDownCapture={captureSearchFocusIntent}
            onMouseDownCapture={captureSearchFocusIntent}
            onClick={() => {
              onToggleAllPlayers();
              restoreSearchFocusIfNeeded();
            }}
            className="app-button-secondary px-4 py-2.5"
          >
            {selectedPlayerIds.length === selectablePlayers.length
              ? "Deselect All"
              : "Select All"}
          </button>
        </div>
      }
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={closePicker} className="app-button-primary">
            Done
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {visibleGuests.length > 0 ? (
          <section aria-labelledby="added-guests-heading" className="space-y-2">
            <h3
              id="added-guests-heading"
              className="text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              Guests
            </h3>
            {visibleGuests.map((guest) => (
              <div
                key={guest.name}
                className="flex items-center justify-between gap-3 rounded-xl border border-[rgba(15,118,110,0.18)] bg-[var(--accent-faint)] px-3 py-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {guest.name}
                    </p>
                    <span className="app-chip app-chip-accent px-2 py-0.5 text-[10px]">
                      Guest
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    <span>Rating {guest.initialElo}</span>
                    {poolsEnabled ? (
                      <span>{getPlayerGroupLabel(guest.pool)}</span>
                    ) : null}
                    {isInterclub && guest.representingClubId ? (
                      <span>
                        {interclubClubOptions.find(
                          (option) => option.id === guest.representingClubId
                        )?.name ?? "Club"}
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveGuest(guest.name)}
                  className="app-button-danger shrink-0 px-3 py-2 text-xs"
                >
                  Remove
                </button>
              </div>
            ))}
          </section>
        ) : null}

        {filteredSelectablePlayers.length > 0 ? (
        <div className="space-y-2">
          {filteredSelectablePlayers.map((player) => {
            const isSelected = selectedPlayerIds.includes(player.id);
            const selectedPool =
              selectedPlayerPools[player.id] ??
              player.preferredPool ??
              SessionPool.B;
            const representingOptions = isInterclub
              ? getRepresentingClubOptions(player)
              : [];
            const hasHostClubMembership =
              !selectedPartnerClub ||
              (player.communityBadges ?? []).some(
                (badge) =>
                  badge.id === hostClubId &&
                  (!badge.userId || badge.userId === player.id)
              );
            const selectedRepresentingClubId =
              selectedPlayerRepresentingClubs[player.id] ??
              (representingOptions.length === 1
                ? representingOptions[0].id
                : null);

            return (
              <div
                key={player.id}
                className={`app-touch-pan-y rounded-xl border px-3 py-2 text-left transition ${
                  isSelected
                    ? "border-[rgba(15,118,110,0.24)] bg-[var(--accent-faint)]"
                    : "border-gray-200 bg-gray-50/70 hover:border-[rgba(15,118,110,0.2)] hover:bg-white"
                }`}
              >
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onPointerDownCapture={captureSearchFocusIntent}
                  onMouseDownCapture={captureSearchFocusIntent}
                  onClick={() => {
                    onTogglePlayerSelection(player.id);
                    restoreSearchFocusIfNeeded();
                  }}
                  className="flex w-full min-w-0 items-center justify-between gap-3 text-left"
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <Avatar name={player.name} avatarUrl={player.avatarUrl} size="md" />
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {player.name}
                        </p>
                        {player.status === ClubPlayerStatus.OCCASIONAL ? (
                          <span className="app-chip app-chip-success px-2 py-0.5 text-[10px]">
                            Occasional
                          </span>
                        ) : null}
                        {poolsEnabled && isSelected ? (
                          <span className="app-chip app-chip-accent px-2 py-0.5 text-[10px]">
                            {getPlayerGroupLabel(selectedPool)}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-gray-500">Rating {player.elo}</p>
                      {player.communityBadges && player.communityBadges.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {player.communityBadges.map((badge) => (
                            <span
                              key={badge.id}
                              className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-600"
                            >
                              {badge.name} {badge.elo}
                            </span>
                          ))}
                          {!player.isClaimed ? (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                              Unclaimed
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <span
                    className={`inline-flex min-h-9 shrink-0 items-center rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                      isSelected
                        ? "border-[rgba(15,118,110,0.24)] bg-[var(--accent-faint)] text-[var(--accent-strong)]"
                        : "border-gray-200 bg-white text-gray-500"
                    }`}
                  >
                    {isSelected ? "Selected" : "Add"}
                  </span>
                </button>

                {poolsEnabled && isSelected ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3">
                    <span className="text-xs font-semibold text-gray-500">
                      Game group
                    </span>
                    {[SessionPool.A, SessionPool.B].map((pool) => {
                      const isActive = selectedPool === pool;
                      const label = getPlayerGroupLabel(pool);

                      return (
                        <button
                          key={pool}
                          type="button"
                          aria-pressed={isActive}
                          onPointerDownCapture={captureSearchFocusIntent}
                          onMouseDownCapture={captureSearchFocusIntent}
                          onClick={() => {
                            onChangePlayerPool(player.id, pool);
                            restoreSearchFocusIfNeeded();
                          }}
                          className={`min-h-9 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                            isActive
                              ? "border-[rgba(15,118,110,0.24)] bg-[var(--accent-faint)] text-[var(--accent-strong)]"
                              : "border-gray-200 bg-white text-gray-500"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {canSavePreferredPools && hasHostClubMembership ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3">
                    <span className="text-xs font-semibold text-gray-500">
                      Saved club preference
                    </span>
                    {[SessionPool.A, SessionPool.B].map((pool) => {
                      const isSaved =
                        (player.preferredPool ?? SessionPool.B) === pool;
                      const isSaving =
                        savingPreferredPoolPlayerId === player.id;

                      return (
                        <button
                          key={pool}
                          type="button"
                          aria-pressed={isSaved}
                          disabled={
                            savingPreferredPoolPlayerId !== null
                          }
                          onPointerDownCapture={captureSearchFocusIntent}
                          onMouseDownCapture={captureSearchFocusIntent}
                          onClick={() => {
                            if (!isSaved) {
                              void onSavePlayerPreferredPool(player.id, pool);
                            }
                            restoreSearchFocusIfNeeded();
                          }}
                          className={`min-h-9 rounded-lg border px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            isSaved
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : "border-gray-200 bg-white text-gray-500"
                          }`}
                        >
                          {isSaving && !isSaved
                            ? "Saving..."
                            : getPlayerGroupLabel(pool)}
                        </button>
                      );
                    })}
                    <span className="basis-full text-[11px] leading-4 text-gray-500">
                      Used for future tournaments; session overrides stay separate.
                    </span>
                  </div>
                ) : null}

                {isInterclub && isSelected ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-3">
                    <span className="text-xs font-semibold text-gray-500">
                      Represents
                    </span>
                    {representingOptions.length > 0 ? (
                      representingOptions.map((option) => {
                        const isActive =
                          selectedRepresentingClubId === option.id;

                        return (
                          <button
                            key={option.id}
                            type="button"
                            aria-pressed={isActive}
                            onPointerDownCapture={captureSearchFocusIntent}
                            onMouseDownCapture={captureSearchFocusIntent}
                            onClick={() => {
                              onChangePlayerRepresentingClub(player.id, option.id);
                              restoreSearchFocusIfNeeded();
                            }}
                            className={`min-h-9 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                              isActive
                                ? "border-[rgba(15,118,110,0.24)] bg-[var(--accent-faint)] text-[var(--accent-strong)]"
                                : "border-gray-200 bg-white text-gray-500"
                            }`}
                          >
                            {option.name}
                          </button>
                        );
                      })
                    ) : (
                      <span className="text-xs font-semibold text-red-600">
                        No club side
                      </span>
                    )}
                  </div>
                ) : null}
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

        {filteredSelectablePlayers.length === 0 &&
        visibleGuests.length === 0 &&
        !canAddGuest ? (
          <div className="app-empty px-4 py-10 text-center">
            <p className="text-sm font-semibold text-gray-900">
              {hasExactGuestMatch
                ? "This guest is already added."
                : "No players found."}
            </p>
            <p className="mt-2 text-sm text-gray-500">
              {trimmedSearch.length > 0 && trimmedSearch.length < 2
                ? "Type at least 2 characters to add a guest."
                : "Try a different name or clear the search."}
            </p>
          </div>
        ) : null}
      </div>
    </PlayerPickerSheet>

    <GuestDefinitionModal
      open={guestModalOpen}
      name={guestNameInput}
      initialElo={guestInitialEloInput}
      gender={guestGenderInput}
      mixedSideOverride={guestMixedSideOverrideInput}
      pool={guestPoolInput}
      representingClubId={guestRepresentingClubInput}
      isMixed={isMixed}
      poolsEnabled={poolsEnabled}
      isInterclub={isInterclub}
      interclubClubOptions={interclubClubOptions}
      submitting={false}
      error={guestFormError}
      onNameChange={onGuestNameChange}
      onInitialEloChange={onGuestInitialEloChange}
      onGenderChange={onGuestGenderChange}
      onMixedSideOverrideChange={onGuestMixedSideOverrideChange}
      onPoolChange={onGuestPoolChange}
      onRepresentingClubChange={onGuestRepresentingClubChange}
      onClose={closeGuestModal}
      onSubmit={submitGuest}
    />
    </>
  );
}
