"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Sheet } from "./Primitives";
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
  scoreLabel = "Points",
  onOpenMember,
}: LiveSessionStandingsProps) {
  const [filter, setFilter] = useState<GroupFilter>("ALL");
  const descriptionId = useId();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const pendingProfileId = useRef<string | null>(null);
  const visibleRows = useMemo(
    () =>
      groupsEnabled && filter !== "ALL"
        ? rows.filter((row) => row.group === filter)
        : rows,
    [filter, groupsEnabled, rows],
  );
  // Keep the sheet tied to the latest row data as live session updates arrive.
  const selectedRow = selectedUserId
    ? rows.find((row) => row.userId === selectedUserId) ?? null
    : null;

  useEffect(() => {
    if (selectedUserId !== null || !pendingProfileId.current) return;
    const userId = pendingProfileId.current;
    pendingProfileId.current = null;
    onOpenMember?.(userId);
  }, [onOpenMember, selectedUserId]);

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
        <>
          <div className={styles.listHeading}>
            <span>{scoreLabel}</span>
          </div>
          <ol className={styles.list} aria-label="Player standings">
            {visibleRows.map((row, index) => (
              <li className={styles.row} key={row.userId}>
                <button
                  className={styles.rowButton}
                  type="button"
                  aria-label={`View ${row.name}'s session stats`}
                  aria-describedby={`${descriptionId}-${index}`}
                  aria-haspopup="dialog"
                  onClick={() => setSelectedUserId(row.userId)}
                >
                  <span className={styles.rank} aria-label={`Rank ${index + 1}`}>{index + 1}</span>
                  {row.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.avatar} src={row.avatarUrl} alt="" />
                  ) : (
                    <span className={styles.avatarFallback} aria-hidden="true">
                      {getInitial(row.name)}
                    </span>
                  )}
                  <span className={styles.playerCopy}>
                    <span className={styles.memberLine}>
                      <span className={styles.memberName}>{row.name}</span>
                      {row.isCurrentUser ? <span className={styles.you}>You</span> : null}
                    </span>
                    <span className={styles.record}>{row.wins}W · {row.losses}L</span>
                  </span>
                  <strong className={styles.score}>{row.score}</strong>
                  <span className={styles.srOnly} id={`${descriptionId}-${index}`}>
                    Rank {index + 1}. {row.score} {scoreLabel}. {row.wins} wins and {row.losses} losses.
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p className={styles.empty} role="status">No players in this group yet.</p>
      )}

      <Sheet
        open={!!selectedRow}
        title={selectedRow?.name ?? "Player stats"}
        onClose={() => setSelectedUserId(null)}
      >
        {selectedRow ? (
          <div className={styles.detail}>
            <div className={styles.detailScore}>
              <span>Score</span>
              <strong>{selectedRow.score}</strong>
            </div>
            <dl className={styles.detailStats}>
              <div>
                <dt>Matches played</dt>
                <dd>{selectedRow.matchesPlayed}</dd>
              </div>
              <div>
                <dt>Record</dt>
                <dd>{selectedRow.wins}W · {selectedRow.losses}L</dd>
              </div>
              <div>
                <dt>Point difference</dt>
                <dd className={selectedRow.pointDiff > 0 ? styles.positive : selectedRow.pointDiff < 0 ? styles.negative : ""}>
                  {formatPointDiff(selectedRow.pointDiff)}
                </dd>
              </div>
            </dl>
            {onOpenMember && selectedRow.canOpenMember !== false ? (
              <button
                className={styles.profileButton}
                type="button"
                onClick={() => {
                  const userId = selectedRow.userId;
                  pendingProfileId.current = userId;
                  setSelectedUserId(null);
                }}
              >
                View profile
              </button>
            ) : null}
          </div>
        ) : null}
      </Sheet>
    </section>
  );
}
