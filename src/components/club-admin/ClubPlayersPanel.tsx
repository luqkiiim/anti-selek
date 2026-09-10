"use client";
import Link from "next/link";
import { Plus, PencilSimple } from "@phosphor-icons/react";
import { PlayAvatar } from "@/components/play/PlayShell";
import { getClubRoleLabel } from "@/lib/clubRoles";
import type { ClubAdminPlayer } from "./clubAdminTypes";
interface ClubPlayersPanelProps {
  players: ClubAdminPlayer[];
  filteredPlayers: ClubAdminPlayer[];
  claimedPlayersCount: number;
  occasionalPlayersCount: number;
  clubId: string;
  playerSearch: string;
  onPlayerSearchChange: (value: string) => void;
  onOpenCreatePlayer: () => void;
  onOpenPlayerEditor: (player: ClubAdminPlayer) => void;
}

export function ClubPlayersPanel({
  players,
  filteredPlayers,
  clubId,
  playerSearch,
  onPlayerSearchChange,
  onOpenCreatePlayer,
  onOpenPlayerEditor,
}: ClubPlayersPanelProps) {
  return (
    <section data-owner-admin-panel="players">
      <div className="section-head">
        <h3>
          Players <small className="quiet">{players.length}</small>
        </h3>
        <button
          className="primary"
          onClick={onOpenCreatePlayer}
          data-tutorial-target="admin-onboarding-add-player"
        >
          <Plus size={19} />
          Add player
        </button>
      </div>
      <label className="form-stack">
        <span className="sr-only">Search players</span>
        <input
          type="search"
          className="field"
          placeholder="Find a player"
          value={playerSearch}
          onChange={(e) => onPlayerSearchChange(e.target.value)}
        />
      </label>
      <div className="roster">
        {filteredPlayers.map((p) => (
          <div className="admin-person" key={p.id}>
            <PlayAvatar name={p.name} url={p.avatarUrl} />
            <Link href={`/profile/${p.id}?clubId=${clubId}`}>
              <strong>{p.name}</strong>
              <small>
                {p.isOwner ? "Owner" : getClubRoleLabel(p.role)} · {p.elo}{" "}
                rating{!p.isClaimed ? " · Unclaimed" : ""}
                {p.status === "OCCASIONAL" ? " · Occasional" : ""}
                {!p.isActive ? " · Inactive" : ""}
                {p.offlineIdentityId ? " · Linked" : ""}
              </small>
            </Link>
            <button
              className="icon-button"
              aria-label={`Edit ${p.name}`}
              onClick={() => onOpenPlayerEditor(p)}
            >
              <PencilSimple size={20} />
            </button>
          </div>
        ))}
      </div>
      {!filteredPlayers.length && (
        <p className="quiet">
          {players.length
            ? "No players found. Try another name."
            : "Add your first player to get started."}
        </p>
      )}
    </section>
  );
}
