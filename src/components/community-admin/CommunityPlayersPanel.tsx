"use client";

import Link from "next/link";
import { EmptyState, SectionCard } from "@/components/ui/chrome";
import {
  CommunityAdminClaimPill,
  CommunityAdminGenderPill,
  CommunityAdminRolePill,
} from "./communityAdminDisplay";
import type { CommunityAdminPlayer } from "./communityAdminTypes";

interface CommunityPlayersPanelProps {
  players: CommunityAdminPlayer[];
  filteredPlayers: CommunityAdminPlayer[];
  claimedPlayersCount: number;
  communityId: string;
  playerSearch: string;
  onPlayerSearchChange: (value: string) => void;
  onOpenCreatePlayer: () => void;
  onOpenPlayerEditor: (player: CommunityAdminPlayer) => void;
}

export function CommunityPlayersPanel({
  players,
  filteredPlayers,
  claimedPlayersCount,
  communityId,
  playerSearch,
  onPlayerSearchChange,
  onOpenCreatePlayer,
  onOpenPlayerEditor,
}: CommunityPlayersPanelProps) {
  return (
    <SectionCard
      eyebrow="Roster"
      title="Community players"
      description="A compact roster for quick review. Open a player when you need to edit details or admin access."
      action={
        <button
          type="button"
          onClick={onOpenCreatePlayer}
          className="app-button-primary px-4 py-2"
        >
          Add player
        </button>
      }
    >
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <label className="block w-full lg:max-w-sm">
          <span className="sr-only">Search players</span>
          <input
            type="search"
            value={playerSearch}
            onChange={(event) => onPlayerSearchChange(event.target.value)}
            className="field"
            placeholder="Search players by name or email"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <span className="app-chip app-chip-neutral">
            {filteredPlayers.length} shown
          </span>
          <span className="app-chip app-chip-neutral">
            {players.length - claimedPlayersCount} placeholders
          </span>
        </div>
      </div>

      {filteredPlayers.length === 0 ? (
        <EmptyState
          title={
            players.length === 0
              ? "No players in the community yet."
              : "No players match that search."
          }
          detail={
            players.length === 0
              ? "Create the first player profile to start building the community roster."
              : "Try another name or clear the search to see the full roster."
          }
          action={
            players.length === 0 ? (
              <button
                type="button"
                onClick={onOpenCreatePlayer}
                className="app-button-primary px-4 py-2"
              >
                Create first player
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {filteredPlayers.map((player) => {
            const initials = player.name
              .split(/\s+/)
              .filter(Boolean)
              .slice(0, 2)
              .map((part) => part[0]?.toUpperCase())
              .join("");

            return (
              <div
                key={player.id}
                className="rounded-[28px] border border-gray-100 bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(244,248,252,0.92))] px-4 py-4 shadow-sm transition hover:-translate-y-[1px] hover:border-blue-200 hover:shadow-md sm:px-5"
              >
                <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1.8fr)_120px_minmax(0,1.3fr)_auto] lg:items-center">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(22,119,242,0.16),rgba(25,154,97,0.14))] text-sm font-black text-blue-700">
                      {initials || player.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-base font-semibold text-gray-900">
                        {player.name}
                      </p>
                      <p className="truncate text-sm text-gray-600">
                        {player.email || "No email on file"}
                      </p>
                      <Link
                        href={`/profile/${player.id}?communityId=${communityId}`}
                        className="mt-1 inline-flex text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-600 hover:text-blue-700"
                      >
                        View profile
                      </Link>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-100 bg-white/85 px-3 py-2 lg:text-center">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-500">
                      Rating
                    </p>
                    <p className="mt-1 text-lg font-semibold leading-none text-gray-900">
                      {player.elo}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <CommunityAdminRolePill role={player.role} />
                    <CommunityAdminClaimPill isClaimed={player.isClaimed} />
                    <CommunityAdminGenderPill player={player} />
                  </div>

                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => onOpenPlayerEditor(player)}
                      className="app-button-secondary px-4 py-2"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
