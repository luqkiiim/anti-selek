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

function getScoreHeading(scoreLabel: string) {
  return scoreLabel.toLocaleLowerCase().includes("net") ? "Ladder" : "Pts";
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
  const scoreHeading = getScoreHeading(scoreLabel);

  return (
    <section className={styles.panel} aria-labelledby="live-session-standings-title">
      <header className={styles.header}>
        <h2 id="live-session-standings-title">Standings</h2>
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
        <div className={styles.tableWrap}>
          <table className={styles.table} aria-label="Player standings">
            <colgroup>
              <col className={styles.rankColumn} />
              <col className={styles.playerColumn} />
              <col className={styles.scoreColumn} />
              <col className={styles.diffColumn} />
              <col className={styles.matchesColumn} />
              <col className={styles.recordColumn} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" aria-label="Rank" />
                <th scope="col">Player</th>
                <th scope="col" aria-label={scoreHeading === "Ladder" ? "Ladder score" : "Points"}>
                  {scoreHeading}
                </th>
                <th scope="col" aria-label="Point difference">Diff</th>
                <th scope="col" aria-label="Matches played">MP</th>
                <th scope="col" aria-label="Wins and losses">W / L</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => {
                const canOpenProfile = !!onOpenMember && row.canOpenMember !== false;
                const playerContent = (
                  <>
                    {row.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className={styles.avatar} src={row.avatarUrl} alt="" />
                    ) : (
                      <span className={styles.avatarFallback} aria-hidden="true">
                        {getInitial(row.name)}
                      </span>
                    )}
                    <span className={styles.playerName} title={row.name}>{row.name}</span>
                    {row.isCurrentUser ? <span className={styles.you}>You</span> : null}
                  </>
                );

                return (
                  <tr className={styles.row} key={row.userId}>
                    <td className={styles.rank} aria-label={`Rank ${index + 1}`}>{index + 1}</td>
                    <td className={styles.player}>
                      {canOpenProfile ? (
                        <button
                          className={styles.profileButton}
                          type="button"
                          aria-label={`View ${row.name}'s profile`}
                          onClick={() => onOpenMember?.(row.userId)}
                        >
                          {playerContent}
                        </button>
                      ) : (
                        <span className={styles.playerContent}>{playerContent}</span>
                      )}
                    </td>
                    <td className={styles.number} aria-label={`${row.score} ${scoreHeading}`}>
                      {row.score}
                    </td>
                    <td className={`${styles.number} ${row.pointDiff > 0 ? styles.positive : row.pointDiff < 0 ? styles.negative : ""}`}>
                      {formatPointDiff(row.pointDiff)}
                    </td>
                    <td className={styles.number}>{row.matchesPlayed}</td>
                    <td className={styles.number}>{row.wins} / {row.losses}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.empty} role="status">No players in this group yet.</p>
      )}
    </section>
  );
}
