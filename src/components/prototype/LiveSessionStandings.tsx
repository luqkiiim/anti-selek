"use client";

import { useMemo, useState } from "react";
import styles from "./LiveSessionStandings.module.css";

export type LiveSessionStandingGroup = "A" | "B";

/** Values are computed by the caller from the session's authoritative results. */
export interface LiveSessionStandingRow {
  userId: string;
  name: string;
  avatarUrl?: string | null;
  group: LiveSessionStandingGroup;
  score: number | string;
  matchesPlayed: number;
  wins: number;
  losses: number;
  pointDiff: number;
  /** Active session guests may not have a profile to open. */
  canOpenMember?: boolean;
  isCurrentUser?: boolean;
}

export interface LiveSessionStandingsProps {
  /** Keep rows in the leaderboard's authoritative order. */
  rows: readonly LiveSessionStandingRow[];
  groupsEnabled: boolean;
  groupAName?: string;
  groupBName?: string;
  scoreLabel?: string;
  onOpenMember?: (userId: string) => void;
}

type GroupFilter = "ALL" | LiveSessionStandingGroup;

function formatPointDiff(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function getInitial(name: string) {
  return name.trim().charAt(0).toLocaleUpperCase() || "?";
}

export function LiveSessionStandings({
  rows,
  groupsEnabled,
  groupAName = "Group A",
  groupBName = "Group B",
  scoreLabel = "points",
  onOpenMember,
}: LiveSessionStandingsProps) {
  const [filter, setFilter] = useState<GroupFilter>("ALL");
  const visibleRows = useMemo(
    () =>
      groupsEnabled && filter !== "ALL"
        ? rows.filter((row) => row.group === filter)
        : rows,
    [filter, groupsEnabled, rows],
  );

  return (
    <section className={styles.panel} aria-labelledby="live-session-standings-title">
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2 id="live-session-standings-title">Standings</h2>
        </div>
        {groupsEnabled ? (
          <div className={styles.filters} role="group" aria-label="Filter standings by group">
            <button
              className={filter === "ALL" ? styles.filterSelected : styles.filter}
              type="button"
              aria-pressed={filter === "ALL"}
              onClick={() => setFilter("ALL")}
            >
              All
            </button>
            <button
              className={filter === "A" ? styles.filterSelected : styles.filter}
              type="button"
              aria-pressed={filter === "A"}
              onClick={() => setFilter("A")}
            >
              {groupAName}
            </button>
            <button
              className={filter === "B" ? styles.filterSelected : styles.filter}
              type="button"
              aria-pressed={filter === "B"}
              onClick={() => setFilter("B")}
            >
              {groupBName}
            </button>
          </div>
        ) : null}
      </header>

      {visibleRows.length > 0 ? (
        <ol className={styles.list} aria-label="Player standings">
          {visibleRows.map((row, index) => (
            <li className={styles.row} key={row.userId}>
              <div className={styles.playerLine}>
                <span
                  className={`${styles.rank} ${index === 0 ? styles.topRank : ""}`}
                  aria-label={`Rank ${index + 1}`}
                >
                  {index + 1}
                </span>
                {(() => {
                  const identity = <>
                    {row.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className={styles.avatar} src={row.avatarUrl} alt="" />
                    ) : (
                      <span className={styles.avatarFallback} aria-hidden="true">{getInitial(row.name)}</span>
                    )}
                    <span className={styles.memberName}>{row.name}</span>
                    {row.isCurrentUser ? <span className={styles.you}>You</span> : null}
                  </>;
                  return onOpenMember && row.canOpenMember !== false ? (
                    <button className={`${styles.playerCopy} ${styles.memberButton}`} type="button"
                      onClick={() => onOpenMember(row.userId)} aria-label={`Open ${row.name}'s profile`}>
                      {identity}
                    </button>
                  ) : <div className={styles.playerCopy}>{identity}</div>;
                })()}
                <div className={styles.score}>
                  <strong>{row.score}</strong>
                  <span>{scoreLabel}</span>
                </div>
              </div>

              <dl className={styles.stats}>
                <div className={styles.stat}>
                  <dt>Record</dt>
                  <dd>{row.wins}–{row.losses}</dd>
                </div>
                <div className={styles.stat}>
                  <dt>Played</dt>
                  <dd>{row.matchesPlayed}</dd>
                </div>
                <div className={styles.stat}>
                  <dt>Point diff</dt>
                  <dd className={row.pointDiff > 0 ? styles.positive : row.pointDiff < 0 ? styles.negative : ""}>
                    {formatPointDiff(row.pointDiff)}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.empty} role="status">No players in this group yet.</p>
      )}
    </section>
  );
}
