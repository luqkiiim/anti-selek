"use client";

import { useRef } from "react";
import { PlayerPickerSheet } from "@/components/ui/PlayerPickerSheet";
import { SearchField } from "@/components/ui/SearchField";
import type { CommunityPageMember } from "./communityTypes";
import { CommunityPlayerStatus, SessionPool } from "@/types/enums";

interface CommunityPlayersModalProps {
  open: boolean;
  selectedPlayerIds: string[];
  selectedPlayerPools: Record<string, SessionPool>;
  playerSearch: string;
  poolsEnabled: boolean;
  poolAName: string;
  poolBName: string;
  selectablePlayers: CommunityPageMember[];
  filteredSelectablePlayers: CommunityPageMember[];
  onPlayerSearchChange: (value: string) => void;
  onToggleAllPlayers: () => void;
  onTogglePlayerSelection: (playerId: string) => void;
  onChangePlayerPool: (playerId: string, pool: SessionPool) => void;
  onClose: () => void;
}

export function CommunityPlayersModal({
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
}: CommunityPlayersModalProps) {
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
                className={`app-touch-pan-y rounded-2xl border px-3 py-3 text-left transition ${
                  isSelected
                    ? "border-blue-200 bg-blue-50"
                    : "border-gray-200 bg-gray-50/70 hover:border-blue-200 hover:bg-white"
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
                  <div className="min-w-0 space-y-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {player.name}
                      </p>
                      {player.status === CommunityPlayerStatus.OCCASIONAL ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-700">
                          Occasional
                        </span>
                      ) : null}
                      {poolsEnabled && isSelected ? (
                        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-indigo-700">
                          {selectedPool === SessionPool.A ? poolAName : poolBName}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-gray-500">Rating {player.elo}</p>
                  </div>

                  <span
                    className={`inline-flex shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                      isSelected
                        ? "border-blue-200 bg-blue-50 text-blue-700"
                        : "border-gray-200 bg-white text-gray-500"
                    }`}
                  >
                    {isSelected ? "Selected" : "Add"}
                  </span>
                </button>

                {poolsEnabled && isSelected ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-blue-100 pt-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
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
                          className={`rounded-xl border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] transition ${
                            isActive
                              ? "border-indigo-200 bg-indigo-50 text-indigo-700"
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
