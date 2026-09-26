"use client";

import { Settings2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import {
  getBalanceMetricLabel,
  getMatchmakingStyleLabel,
  getPairingModeLabel,
  getSessionSettings,
} from "@/lib/sessionSettings";
import { getCourtDisplayLabel } from "@/lib/courtLabels";
import type { SessionData } from "@/components/session/sessionTypes";
import styles from "./SessionStandbyView.module.css";

export interface SessionStandbyViewProps {
  session: SessionData;
  canManage: boolean;
  busy: boolean;
  onSettings: () => void;
  onManagePlayers: () => void;
  onStart: () => void;
  onOpenMember?: (memberId: string) => void;
  profileMemberIds?: ReadonlySet<string> | readonly string[];
}

function includesProfileMember(
  ids: SessionStandbyViewProps["profileMemberIds"],
  memberId: string
) {
  if (!ids) return false;
  return "has" in ids ? ids.has(memberId) : ids.includes(memberId);
}

export function SessionStandbyView({
  session,
  canManage,
  busy,
  onSettings,
  onManagePlayers,
  onStart,
  onOpenMember,
  profileMemberIds,
}: SessionStandbyViewProps) {
  const settings = getSessionSettings(session);
  const players = [...session.players].sort((left, right) =>
    left.user.name.localeCompare(right.user.name, undefined, {
      sensitivity: "base",
    })
  );
  const courts = [...session.courts].sort(
    (left, right) => left.courtNumber - right.courtNumber
  );

  return (
    <div className={styles.container}>
      <section className={styles.setupCard} aria-labelledby="standby-setup-title">
        <div className={styles.setupHeader}>
          <div className={styles.setupTitleGroup}>
            <span className={styles.status}>Not started</span>
            <h2 id="standby-setup-title" className={styles.setupTitle}>
              Session setup
            </h2>
          </div>
          {canManage ? (
            <button
              type="button"
              className={styles.iconButton}
              aria-label="Review session settings"
              title="Review session settings"
              onClick={onSettings}
              disabled={busy}
            >
              <Settings2 aria-hidden="true" size={20} strokeWidth={1.8} />
            </button>
          ) : null}
        </div>

        <div className={styles.settingsSummary} aria-label="Current session settings">
          <span>{getMatchmakingStyleLabel(settings.matchmakingStyle)}</span>
          <span className={styles.summaryDivider} aria-hidden="true">·</span>
          <span>{getBalanceMetricLabel(settings.balanceMetric)}</span>
          <span className={styles.summaryDivider} aria-hidden="true">·</span>
          <span>{getPairingModeLabel(settings.pairingMode)}</span>
          <span className={styles.summaryDivider} aria-hidden="true">·</span>
          <span>Player groups {session.poolsEnabled ? "on" : "off"}</span>
        </div>

        <div className={styles.courtsSummary}>
          <span className={styles.summaryLabel}>
            {courts.length} {courts.length === 1 ? "court" : "courts"}
          </span>
          {courts.length > 0 ? (
            <ul className={styles.courtList} aria-label="Session courts">
              {courts.map((court) => (
                <li key={court.id} className={styles.courtChip}>
                  {getCourtDisplayLabel(court)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      <section className={styles.rosterCard} aria-labelledby="standby-players-title">
        <div className={styles.rosterHeader}>
          <div className={styles.rosterHeading}>
            <h2 id="standby-players-title" className={styles.rosterTitle}>
              Players
            </h2>
            <span className={styles.playerCount}>
              {players.length} {players.length === 1 ? "player" : "players"}
            </span>
          </div>
          {canManage ? (
            <button
              type="button"
              className={styles.manageButton}
              onClick={onManagePlayers}
              disabled={busy}
            >
              Manage players
            </button>
          ) : null}
        </div>

        {players.length > 0 ? (
          <ul className={styles.playerList}>
            {players.map((player) => {
              const canOpenProfile =
                !player.isGuest &&
                !!onOpenMember &&
                includesProfileMember(profileMemberIds, player.userId);
              const details = [
                player.isGuest ? "Guest" : null,
                player.isPaused ? "Paused" : null,
              ].filter(Boolean);
              const summary = (
                <>
                  <Avatar
                    name={player.user.name}
                    avatarUrl={player.user.avatarUrl}
                    size="sm"
                    className={styles.avatar}
                    fallbackClassName={styles.avatarFallback}
                  />
                  <span className={styles.playerText}>
                    <span className={styles.playerName}>{player.user.name}</span>
                    {details.length > 0 ? (
                      <span className={styles.playerDetails}>
                        {details.map((detail) => (
                          <span
                            className={
                              detail === "Paused"
                                ? styles.pausedTag
                                : styles.guestTag
                            }
                            key={detail}
                          >
                            {detail}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                </>
              );

              return (
                <li className={styles.playerItem} key={player.userId}>
                  {canOpenProfile ? (
                    <button
                      type="button"
                      className={styles.playerProfileButton}
                      aria-label={`Open ${player.user.name}'s profile`}
                      onClick={() => onOpenMember?.(player.userId)}
                    >
                      {summary}
                    </button>
                  ) : (
                    <div className={styles.playerRow}>{summary}</div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.emptyRoster}>No players yet</p>
        )}
      </section>

      <div className={styles.startArea}>
        {canManage ? (
          <button
            type="button"
            className={styles.startButton}
            onClick={onStart}
            disabled={busy}
          >
            {busy ? "Starting…" : "Start session"}
          </button>
        ) : (
          <p className={styles.waitingMessage} role="status">
            Waiting for the host to start
          </p>
        )}
      </div>
    </div>
  );
}
