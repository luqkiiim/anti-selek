"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { RotateCw, Share2, Sparkles } from "lucide-react";

import type { Player } from "@/components/session/sessionTypes";
import { Avatar } from "@/components/ui/Avatar";
import { SessionType } from "@/types/enums";
import styles from "./SessionFinishView.module.css";

interface PlayerStats {
  played: number;
  wins: number;
  losses: number;
}

export interface SessionFinishViewProps {
  sessionName: string;
  sessionType: string;
  /** Pass the already-ranked roster from the session view model. */
  players: Player[];
  pointDiffByUserId: Map<string, number>;
  playerStatsByUserId: Map<string, PlayerStats>;
  /** Pass the authorized session share handler; the image API checks access again. */
  onShareResults?: () => void;
  sharingResults?: boolean;
  /** Optional content such as the interclub scoreboard. */
  children?: ReactNode;
}

const EMPTY_PLAYER_STATS: PlayerStats = { played: 0, wins: 0, losses: 0 };

function formatPointDiff(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function getScore(sessionType: string, player: Player, stats: PlayerStats) {
  return sessionType === SessionType.LADDER
    ? `${stats.wins}-${stats.losses}`
    : `${player.sessionPoints}`;
}

function getRevealDelayMs(rank: number) {
  if (rank === 3) return 0;
  if (rank === 2) return 180;
  return 360;
}

export function SessionFinishView({
  sessionName,
  sessionType,
  players,
  pointDiffByUserId,
  playerStatsByUserId,
  onShareResults,
  sharingResults = false,
  children,
}: SessionFinishViewProps) {
  const [celebrationRunId, setCelebrationRunId] = useState(1);
  const topThree = players.slice(0, 3);
  const orderedPodium =
    topThree.length === 3
      ? [topThree[1], topThree[0], topThree[2]]
      : topThree.length === 2
        ? [topThree[1], topThree[0]]
        : topThree;
  const isLadderSession = sessionType === SessionType.LADDER;

  return (
    <section className={styles.finish} aria-labelledby="session-finish-title">
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>FINAL STANDINGS</span>
          <h1 id="session-finish-title">Session complete</h1>
          <p>{sessionName}</p>
        </div>
        <Sparkles
          className={styles.headerSparkle}
          size={23}
          strokeWidth={1.9}
          aria-hidden="true"
        />
      </header>

      {children ? <div className={styles.slot}>{children}</div> : null}

      {players.length > 0 ? (
        <>
          <div className={styles.actions}>
            {onShareResults ? (
              <button
                type="button"
                className={styles.shareButton}
                onClick={onShareResults}
                disabled={sharingResults}
              >
                <Share2 size={17} strokeWidth={2.3} aria-hidden="true" />
                {sharingResults ? "Preparing image…" : "Share standings"}
              </button>
            ) : null}
            <button
              type="button"
              className={styles.replayButton}
              onClick={() => setCelebrationRunId((current) => current + 1)}
              aria-label="Replay winner celebration"
              title="Replay winner celebration"
            >
              <RotateCw size={17} strokeWidth={2.2} aria-hidden="true" />
              <span>Replay</span>
            </button>
          </div>

          {topThree.length > 0 ? (
            <div
              key={celebrationRunId}
              className={styles.podium}
              role="group"
              aria-label="Top finishers"
            >
              {orderedPodium.map((player) => {
                const rank = players.findIndex(
                  (entry) => entry.userId === player.userId
                ) + 1;
                const stats =
                  playerStatsByUserId.get(player.userId) ?? EMPTY_PLAYER_STATS;
                const pointDiff = pointDiffByUserId.get(player.userId) ?? 0;

                return (
                  <article
                    key={`${player.userId}-${celebrationRunId}`}
                    className={`${styles.podiumPlace} ${styles[`place${rank}`] ?? ""}`}
                    style={
                      {
                        "--reveal-delay": `${getRevealDelayMs(rank)}ms`,
                      } as CSSProperties
                    }
                    aria-label={`${rank}${rank === 1 ? "st" : rank === 2 ? "nd" : "rd"} place: ${player.user.name}`}
                  >
                    <Avatar
                      name={player.user.name}
                      avatarUrl={player.user.avatarUrl}
                      size="lg"
                      className={styles.podiumAvatar}
                      imageLoading="eager"
                      imageFetchPriority="high"
                    />
                    <strong className={styles.podiumName} title={player.user.name}>
                      {player.user.name}
                    </strong>
                    {player.isGuest ? (
                      <span className={styles.guestTag}>Guest</span>
                    ) : null}
                    <div className={styles.podiumBlock}>
                      <span className={styles.rankMark}>{rank}</span>
                      <strong className={styles.podiumScore}>
                        {getScore(sessionType, player, stats)}
                      </strong>
                      <span className={styles.scoreLabel}>
                        {isLadderSession ? "Record" : "Points"}
                      </span>
                      <span className={styles.podiumDiff}>
                        {formatPointDiff(pointDiff)} diff
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}

          <section className={styles.standings} aria-labelledby="finish-standings-title">
            <div className={styles.standingsHeading}>
              <h2 id="finish-standings-title">Standings</h2>
              <span>{players.length} {players.length === 1 ? "player" : "players"}</span>
            </div>
            <ol className={styles.rows}>
              {players.map((player, index) => {
                const stats =
                  playerStatsByUserId.get(player.userId) ?? EMPTY_PLAYER_STATS;
                const pointDiff = pointDiffByUserId.get(player.userId) ?? 0;

                return (
                  <li className={styles.row} key={player.userId}>
                    <span
                      className={`${styles.rowRank} ${index === 0 ? styles.rowRankFirst : ""}`}
                    >
                      {index + 1}
                    </span>
                    <Avatar
                      name={player.user.name}
                      avatarUrl={player.user.avatarUrl}
                      size="xs"
                      className={styles.rowAvatar}
                    />
                    <span className={styles.identity}>
                      <strong title={player.user.name}>{player.user.name}</strong>
                      <small>
                        {player.isGuest ? "Guest · " : ""}
                        {stats.wins}W / {stats.losses}L
                        <span className={styles.matchesPlayed}> · {stats.played} MP</span>
                      </small>
                    </span>
                    <span className={styles.rowScore}>
                      <strong>{getScore(sessionType, player, stats)}</strong>
                      <small>{formatPointDiff(pointDiff)} diff</small>
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      ) : (
        <p className={styles.empty}>No final results have been recorded.</p>
      )}
    </section>
  );
}
