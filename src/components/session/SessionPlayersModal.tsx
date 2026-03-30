"use client";

import { useEffect, useMemo, useState } from "react";
import { ModalFrame } from "@/components/ui/chrome";
import type { Player } from "./sessionTypes";

type PlayerFilter = "all" | "active" | "paused";

interface SessionPlayersModalProps {
  open: boolean;
  players: Player[];
  currentUserId: string;
  onClose: () => void;
  onTogglePause: (userId: string, isPaused: boolean) => void;
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
  onClose,
  onTogglePause,
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
      subtitle="Search, pause, or unpause players."
      onClose={onClose}
      footer={
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className="app-button-primary">
            Done
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-4 py-4 sm:px-5">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search players..."
          className="field w-full px-3 py-2.5 text-sm"
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

        <div className="space-y-2">
          {filteredPlayers.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-gray-50/70 px-4 py-10 text-center text-sm text-gray-500">
              No players match this view.
            </div>
          ) : (
            filteredPlayers.map((player) => (
              <div
                key={player.userId}
                className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50/70 px-3 py-3"
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
                  <p className="text-xs text-gray-500">Rating {player.user.elo}</p>
                </div>

                <button
                  type="button"
                  onClick={() => onTogglePause(player.userId, player.isPaused)}
                  className={`shrink-0 rounded-xl px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] transition ${
                    player.isPaused
                      ? "bg-amber-500 text-white"
                      : "bg-gray-900 text-white"
                  }`}
                >
                  {player.isPaused ? "Unpause" : "Pause"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </ModalFrame>
  );
}
