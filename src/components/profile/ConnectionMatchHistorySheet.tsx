"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { PlayerProfileMatchHistoryEntry } from "@/lib/profileStats";
import { profileConnectionMatches, type ProfileConnectionSelection } from "@/lib/profileConnectionHistory";
import { Sheet } from "@/components/prototype/Primitives";
import styles from "./ProfileMatchList.module.css";

type Props = {
  connection: ProfileConnectionSelection | null;
  matches: PlayerProfileMatchHistoryEntry[];
  onClose: () => void;
  renderMatches: (matches: PlayerProfileMatchHistoryEntry[]) => ReactNode;
};

function HistoryContents({ connection, matches, renderMatches }: Pick<Props, "matches" | "renderMatches"> & { connection: ProfileConnectionSelection }) {
  const [limit, setLimit] = useState(10);
  const filtered = useMemo(() => profileConnectionMatches(matches, connection), [matches, connection]);
  const wins = filtered.filter(match => match.result === "WIN").length;
  const losses = filtered.length - wins;
  return <div className={styles.connectionHistory}>
    {filtered.length > 0 && <p className={styles.record}><strong>{filtered.length}</strong> {filtered.length === 1 ? "match" : "matches"} · <strong>{wins}</strong> {wins === 1 ? "win" : "wins"} · <strong>{losses}</strong> {losses === 1 ? "loss" : "losses"}</p>}
    {filtered.length ? renderMatches(filtered.slice(0, limit)) : <p className="profile-footnote">No matches found.</p>}
    {limit < filtered.length && <button type="button" className="secondary full" onClick={() => setLimit(value => value + 10)}>Load more</button>}
  </div>;
}

export function ConnectionMatchHistorySheet(props: Props) {
  const { connection, onClose } = props;
  const title = connection ? `${connection.role === "partner" ? "With" : "Against"} ${connection.name.trim().split(/\s+/)[0]}` : "Match history";
  return <Sheet open={!!connection} title={title} onClose={onClose}>
    {connection && <HistoryContents key={`${connection.role}:${connection.id}`} {...props} connection={connection} />}
  </Sheet>;
}
