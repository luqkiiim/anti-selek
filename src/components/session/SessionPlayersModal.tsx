"use client";

import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { PlayerPickerSheet } from "@/components/ui/PlayerPickerSheet";
import { SearchField } from "@/components/ui/SearchField";
import { SessionPool } from "@/types/enums";
import type { Player } from "./sessionTypes";

type PlayerFilter = "all" | "active" | "paused";

interface SessionPlayersModalProps {
  open: boolean;
  players: Player[];
  currentUserId: string;
  canEditPreferences: boolean;
  poolsEnabled: boolean;
  poolAName?: string | null;
  poolBName?: string | null;
  togglingPausePlayerId: string | null;
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
  poolsEnabled,
  poolAName,
  poolBName,
  togglingPausePlayerId,
  onClose,
  onTogglePause,
  onOpenPreferenceEditor,
}: SessionPlayersModalProps) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PlayerFilter>("all");
  const handleClose = () => {
    setSearch("");
    setFilter("all");
    onClose();
  };

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
    <PlayerPickerSheet
      open={open}
      title="Players"
      subtitle="Roster and preferences."
      onClose={handleClose}
      toolbar={
        <div className="space-y-4">
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
                className={`min-h-9 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  filter === value
                    ? "border-[rgba(15,118,110,0.24)] bg-[var(--accent-faint)] text-[var(--accent-strong)]"
                    : "border-gray-200 bg-white text-gray-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      }
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={handleClose} className="app-button-primary">
            Done
          </button>
        </div>
      }
    >
      {filteredPlayers.length === 0 ? (
        <div className="app-empty px-4 py-10 text-center text-sm text-gray-500">
          No players match this view.
        </div>
      ) : (
        <div className="space-y-2">
          {filteredPlayers.map((player) => {
            const isUpdatingPause = togglingPausePlayerId === player.userId;
            const poolLabel =
              player.pool === SessionPool.A
                ? (poolAName ?? "Open")
                : (poolBName ?? "Regular");
            const poolBadgeClass =
              player.pool === SessionPool.A
                ? "app-chip-accent"
                : "app-chip-success";

            return (
              <div
                key={player.userId}
                className="app-touch-pan-y flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-3"
              >
                <div className="min-w-0 flex items-center gap-3">
                  <Avatar
                    name={player.user.name}
                    avatarUrl={player.user.avatarUrl}
                    size="sm"
                  />
                  <div className="min-w-0 space-y-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {player.user.name}
                    </p>
                    {player.userId === currentUserId ? (
                      <span className="app-chip app-chip-accent px-2 py-0.5 text-[10px]">
                        Me
                      </span>
                    ) : null}
                    {player.isGuest ? (
                      <span className="app-chip app-chip-neutral px-2 py-0.5 text-[10px]">
                        Guest
                      </span>
                    ) : null}
                    {poolsEnabled ? (
                      <span
                        className={`app-chip px-2 py-0.5 text-[10px] ${poolBadgeClass}`}
                      >
                        {poolLabel}
                      </span>
                    ) : null}
                    {player.isPaused ? (
                      <span className="app-chip app-chip-warning px-2 py-0.5 text-[10px]">
                        Paused
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-gray-500">Rating {player.user.elo}</p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {canEditPreferences ? (
                    <button
                      type="button"
                      onClick={(event) =>
                        onOpenPreferenceEditor(player.userId, event.currentTarget)
                      }
                      className="app-button-secondary px-3 py-2 text-sm"
                    >
                      Edit
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onTogglePause(player.userId, player.isPaused)}
                    disabled={togglingPausePlayerId !== null}
                    className={`min-h-10 rounded-lg px-3 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      player.isPaused ? "bg-[var(--warning)]" : "bg-[var(--foreground)]"
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
    </PlayerPickerSheet>
  );
}
