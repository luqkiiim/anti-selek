"use client";

import { useRef } from "react";
import { ModalFrame } from "@/components/ui/chrome";
import { SearchField } from "@/components/ui/SearchField";
import type { CommunityPageMember } from "./communityTypes";

interface CommunityPlayersModalProps {
  open: boolean;
  selectedPlayerIds: string[];
  playerSearch: string;
  selectablePlayers: CommunityPageMember[];
  filteredSelectablePlayers: CommunityPageMember[];
  onPlayerSearchChange: (value: string) => void;
  onToggleAllPlayers: () => void;
  onTogglePlayerSelection: (playerId: string) => void;
  onClose: () => void;
}

export function CommunityPlayersModal({
  open,
  selectedPlayerIds,
  playerSearch,
  selectablePlayers,
  filteredSelectablePlayers,
  onPlayerSearchChange,
  onToggleAllPlayers,
  onTogglePlayerSelection,
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
    <ModalFrame
      title="Add Players"
      subtitle={`${selectedPlayerIds.length} selected`}
      onClose={onClose}
      bodyScroll={false}
      fullscreenUntilDesktop
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="app-button-primary">
            Done
          </button>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5">
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
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

        <div className="app-modal-scroll-region mt-4 min-h-0 flex-1 pr-1 pb-2">
          {filteredSelectablePlayers.length === 0 ? (
            <div className="app-empty px-4 py-10 text-center">
              <p className="text-sm font-semibold text-gray-900">
                No players found.
              </p>
              <p className="mt-2 text-sm text-gray-500">
                Try a different name or clear the search.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredSelectablePlayers.map((player) => {
                const isSelected = selectedPlayerIds.includes(player.id);

                return (
                  <button
                    key={player.id}
                    type="button"
                    onPointerDownCapture={captureSearchFocusIntent}
                    onMouseDownCapture={captureSearchFocusIntent}
                    onClick={() => {
                      onTogglePlayerSelection(player.id);
                      restoreSearchFocusIfNeeded();
                    }}
                    className={`app-touch-pan-y flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                      isSelected
                        ? "border-blue-200 bg-blue-50"
                        : "border-gray-200 bg-gray-50/70 hover:border-blue-200 hover:bg-white"
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-semibold text-gray-900">
                        {player.name}
                      </p>
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
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ModalFrame>
  );
}
