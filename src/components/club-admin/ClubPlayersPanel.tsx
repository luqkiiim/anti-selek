"use client";

import Link from "next/link";
import { ChevronRight, Plus, Search } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { EmptyState } from "@/components/ui/chrome";
import { getClubRoleLabel } from "@/lib/clubRoles";
import { ClubPlayerStatus } from "@/types/enums";
import styles from "@/features/club-admin-page/ClubAdminPage.module.css";
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
  claimedPlayersCount,
  occasionalPlayersCount,
  clubId,
  playerSearch,
  onPlayerSearchChange,
  onOpenCreatePlayer,
  onOpenPlayerEditor,
}: ClubPlayersPanelProps) {
  return (
    <section
      className={styles.playersPanel}
      aria-labelledby="club-players-heading"
      data-owner-admin-panel="players"
    >
      <div className={styles.playersActionCard}>
        <div className={styles.playersActionCopy}>
          <p>{players.length} members</p>
          <h3 id="club-players-heading">Players and roles</h3>
          <span>Manage roster access, roles, and player details.</span>
        </div>
        <button
          type="button"
          onClick={onOpenCreatePlayer}
          className={styles.primaryAction}
          data-tutorial-target="admin-onboarding-add-player"
        >
          <Plus aria-hidden="true" size={17} strokeWidth={2} />
          Add player
        </button>
      </div>

      <div className={styles.rosterTools}>
        <label className={styles.searchField}>
          <span className="sr-only">Search players</span>
          <Search aria-hidden="true" size={17} strokeWidth={1.8} />
          <input
            type="search"
            value={playerSearch}
            onChange={(event) => onPlayerSearchChange(event.target.value)}
            placeholder="Search players by name or email"
          />
        </label>
        <p className={styles.rosterSummary} aria-live="polite">
          {filteredPlayers.length} shown
          <span aria-hidden="true"> · </span>
          {players.length - claimedPlayersCount} placeholders
          <span aria-hidden="true"> · </span>
          {occasionalPlayersCount} occasional
        </p>
      </div>

      {filteredPlayers.length === 0 ? (
        <EmptyState
          className={styles.rosterEmpty}
          title={
            players.length === 0
              ? "No players in the club yet."
              : "No players match that search."
          }
          detail={
            players.length === 0
              ? "Create the first player profile to start building the club roster."
              : "Try another name or clear the search to see the full roster."
          }
          action={
            players.length === 0 ? (
              <button
                type="button"
                onClick={onOpenCreatePlayer}
                className={styles.primaryAction}
                data-tutorial-target="admin-onboarding-add-player"
              >
                <Plus aria-hidden="true" size={17} strokeWidth={2} />
                Create first player
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className={styles.playerList} role="list">
          {filteredPlayers.map((player) => {
            const roleLabel = player.isOwner
              ? "Owner"
              : getClubRoleLabel(player.role);
            const detailLabels = [
              roleLabel,
              player.status === ClubPlayerStatus.OCCASIONAL
                ? "Occasional"
                : null,
              !player.isClaimed ? "Placeholder" : null,
              !player.isActive ? "Inactive" : null,
              player.offlineIdentityId ? "Linked" : null,
              `${player.elo} rating`,
            ].filter(Boolean);

            return (
              <div
                key={player.id}
                className={styles.playerRow}
                role="listitem"
              >
                <Avatar
                  name={player.name}
                  avatarUrl={player.avatarUrl}
                  size="xs"
                  appearance="court"
                  className={styles.playerAvatar}
                />
                <div className={styles.playerIdentity}>
                  <Link href={`/profile/${player.id}?clubId=${clubId}`}>
                    <span>{player.name}</span>
                    <small>{detailLabels.join(" · ")}</small>
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenPlayerEditor(player)}
                  className={styles.playerRowAction}
                  aria-label={`Edit ${player.name}`}
                  title={`Edit ${player.name}`}
                >
                  <ChevronRight
                    aria-hidden="true"
                    size={18}
                    strokeWidth={1.8}
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
