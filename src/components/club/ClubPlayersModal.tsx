"use client";

import { useRef } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { PlayerPickerSheet } from "@/components/ui/PlayerPickerSheet";
import { SearchField } from "@/components/ui/SearchField";
import type { ClubPageMember } from "./clubTypes";
import { ClubPlayerStatus, SessionPool } from "@/types/enums";

interface ClubPlayersModalProps {
  open: boolean;
  selectedPlayerIds: string[];
  selectedPlayerPools: Record<string, SessionPool>;
  playerSearch: string;
  poolsEnabled: boolean;
  poolAName: string;
  poolBName: string;
  selectablePlayers: ClubPageMember[];
  filteredSelectablePlayers: ClubPageMember[];
  onPlayerSearchChange: (value: string) => void;
  onToggleAllPlayers: () => void;
  onTogglePlayerSelection: (playerId: string) => void;
  onChangePlayerPool: (playerId: string, pool: SessionPool) => void;
  onClose: () => void;
}

export function ClubPlayersModal({
  open,
  selectedPlayerIds,
  selectedPlayerPools,
  playerSearch,
  poolsEnabled,
  poolAName,
  poolBName,
  selectablePlayers,
  filteredSelectablePlayers,
  onPlayerSearchChange,
  onToggleAllPlayers,
  onTogglePlayerSelection,
  onChangePlayerPool,
  onClose,
}: ClubPlayersModalProps) {
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const shouldRestoreSearchFocusRef = useRef(false);

  if (!open) return null;

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
    <PlayerPickerSheet
      open={open}
      title="Add Players"
      subtitle={`${selectedPlayerIds.length} selected`}
      onClose={onClose}
      toolbar={
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchField
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
          <button type="button" onClick={onClose} className="app-button-primary">
            Done
          </button>
        </div>
      }
    >
      {filteredSelectablePlayers.length === 0 ? (
        <div className="app-empty px-4 py-10 text-center">
          <p className="text-sm font-semibold text-gray-900">No players found.</p>
          <p className="mt-2 text-sm text-gray-500">
            Try a different name or clear the search.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredSelectablePlayers.map((player) => {
            const isSelected = selectedPlayerIds.includes(player.id);
            const selectedPool = selectedPlayerPools[player.id] ?? SessionPool.A;

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
                        {player.needsMoreRest ? (
                          <span className="app-chip border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] text-sky-800">
                            More rest
                          </span>
                        ) : null}
                        {poolsEnabled && isSelected ? (
                          <span className="app-chip app-chip-accent px-2 py-0.5 text-[10px]">
                            {selectedPool === SessionPool.A ? poolAName : poolBName}
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
                      Pool
                    </span>
                    {[SessionPool.A, SessionPool.B].map((pool) => {
                      const isActive = selectedPool === pool;
                      const label = pool === SessionPool.A ? poolAName : poolBName;

                      return (
                        <button
                          key={pool}
                          type="button"
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
              </div>
            );
          })}
        </div>
      )}
    </PlayerPickerSheet>
  );
}
