"use client";

import { useEffect, useMemo, useState } from "react";
import { ModalFrame } from "@/components/ui/chrome";
import { SearchField } from "@/components/ui/SearchField";
import type { Player } from "./sessionTypes";

type PlayerFilter = "all" | "active" | "paused";

interface SessionPlayersModalProps {
  open: boolean;
  players: Player[];
  currentUserId: string;
  canEditPreferences: boolean;
  togglingPausePlayerId: string | null;
  onRequestRenameGuest: (userId: string, currentName: string) => void;
  onClose: () => void;
  onTogglePause: (userId: string, isPaused: boolean) => void;
  onOpenPreferenceEditor: (userId: string, triggerEl: HTMLElement) => void;
}

function getPlayerFilterCounts(players: Player[]) {
  const paused = players.filter((player) => player.isPaused).length;
  return {
    all: players.length,
    active: players.length - paused,
    paused,
  };
}

export function SessionPlayersModal({
  open,
  players,
  currentUserId,
  canEditPreferences,
  togglingPausePlayerId,
  onRequestRenameGuest,
  onClose,
  onTogglePause,
  onOpenPreferenceEditor,
}: SessionPlayersModalProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PlayerFilter>("all");

  useEffect(() => {
    if (!open) {
      setSearch("");
      setFilter("all");
    }
  }, [open]);

  const counts = useMemo(() => getPlayerFilterCounts(players), [players]);

  const filteredPlayers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return players
      .slice()
      .sort((left, right) => left.user.name.localeCompare(right.user.name))
      .filter((player) => {
        if (filter === "active" && player.isPaused) {
          return false;
        }

        if (filter === "paused" && !player.isPaused) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        return player.user.name.toLowerCase().includes(normalizedSearch);
      });
  }, [filter, players, search]);

  if (!open) return null;

  return (
    <ModalFrame
      title="Players"
      subtitle="Search, pause, unpause, or edit player preferences."
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
      <div className="flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-5">
        <div className="shrink-0 space-y-4">
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search players..."
          />

          <div className="flex flex-wrap gap-2">
            {(
              [
                ["all", `All ${counts.all}`],
                ["active", `Active ${counts.active}`],
                ["paused", `Paused ${counts.paused}`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] transition ${
                  filter === value
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="app-modal-scroll-region mt-4 min-h-0 flex-1 pr-1 pb-2">
          {filteredPlayers.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50/70 px-4 py-10 text-center text-sm text-gray-500">
              No players match this view.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPlayers.map((player) => {
                const isUpdatingPause = togglingPausePlayerId === player.userId;

                return (
                  <div
                    key={player.userId}
                    className="app-touch-pan-y flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50/70 px-3 py-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-gray-900">
                          {player.user.name}
                        </p>
                        {player.userId === currentUserId ? (
                          <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-blue-700">
                            Me
                          </span>
                        ) : null}
                        {player.isGuest ? (
                          <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-gray-600">
                            Guest
                          </span>
                        ) : null}
                        {player.isPaused ? (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-800">
                            Paused
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-gray-500">
                        Rating {player.user.elo}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {canEditPreferences ? (
                        <>
                          {player.isGuest ? (
                            <button
                              type="button"
                              onClick={() =>
                                onRequestRenameGuest(
                                  player.userId,
                                  player.user.name
                                )
                              }
                              className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700 transition"
                            >
                              Rename
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={(event) =>
                              onOpenPreferenceEditor(
                                player.userId,
                                event.currentTarget
                              )
                            }
                            className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700 transition"
                          >
                            {player.isGuest ? "Edit" : "Prefs"}
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        onClick={() =>
                          onTogglePause(player.userId, player.isPaused)
                        }
                        disabled={togglingPausePlayerId !== null}
                        className={`rounded-xl px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          player.isPaused
                            ? "bg-amber-500"
                            : "bg-gray-900"
                        }`}
                      >
                        {isUpdatingPause
                          ? "Saving..."
                          : player.isPaused
                            ? "Unpause"
                            : "Pause"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </ModalFrame>
  );
}
