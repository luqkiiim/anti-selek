"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { PlayerProfileMatchHistoryEntry } from "@/lib/profileStats";
import { profileConnectionMatches, type ProfileConnectionSelection } from "@/lib/profileConnectionHistory";
import { Sheet } from "@/components/prototype/Primitives";

type Props = {
  connection: ProfileConnectionSelection | null;
  matches: PlayerProfileMatchHistoryEntry[];
  onClose: () => void;
  renderMatches: (matches: PlayerProfileMatchHistoryEntry[]) => ReactNode;
};

function HistoryContents({ connection, matches, renderMatches }: Pick<Props, "matches" | "renderMatches"> & { connection: ProfileConnectionSelection }) {
  const [limit, setLimit] = useState(10);
  const filtered = useMemo(() => profileConnectionMatches(matches, connection), [matches, connection]);
  return <div className="grid gap-4">
    {filtered.length ? renderMatches(filtered.slice(0, limit)) : <p className="profile-footnote">No matches found.</p>}
    {limit < filtered.length && <button type="button" className="secondary full" onClick={() => setLimit(value => value + 10)}>Load more</button>}
  </div>;
}

export function ConnectionMatchHistorySheet(props: Props) {
  const { connection, onClose } = props;
  const title = connection ? `Matches ${connection.role === "partner" ? "with" : "against"} ${connection.name}` : "Match history";
  return <Sheet open={!!connection} title={title} onClose={onClose}>
    {connection && <HistoryContents key={`${connection.role}:${connection.id}`} {...props} connection={connection} />}
  </Sheet>;
}
