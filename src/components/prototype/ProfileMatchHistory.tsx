"use client";
import { useState } from "react";
import { CaretRight } from "@phosphor-icons/react";
import type { PlayerProfileMatchHistoryEntry } from "@/lib/profileStats";
import { Sheet } from "./Primitives";

type Props = { matches: PlayerProfileMatchHistoryEntry[]; onOpen: (match: PlayerProfileMatchHistoryEntry) => void };

function MatchRow({ match, onOpen }: { match: PlayerProfileMatchHistoryEntry; onOpen: Props["onOpen"] }) {
  const win = match.result === "WIN";
  return <button className="profile-history-row" onClick={() => onOpen(match)}>
    <b className={`profile-match-result ${win ? "win" : "loss"}`}>{win ? "W" : "L"}</b>
    <span><strong>{match.score}</strong><small>With {match.partner.name}</small><small>{match.date ? new Date(match.date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Date unavailable"}</small></span>
    <CaretRight size={16} />
  </button>;
}

export function ProfileMatchHistory({ matches, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(10);
  return <section className="profile-history profile-match-history">
    <div className="section-heading"><h2>Match history</h2>{matches.length > 0 && <button className="text-button" onClick={() => { setLimit(10); setOpen(true); }}>View history<CaretRight size={15} /></button>}</div>
    {matches.length ? <div className="profile-joined-list">{matches.slice(0,3).map(match => <MatchRow key={match.id} match={match} onOpen={onOpen} />)}</div> : <p className="profile-footnote">No completed matches yet.</p>}
    <Sheet open={open} title="Match history" onClose={() => setOpen(false)}>
      <div className="profile-match-history"><div className="profile-joined-list">{matches.slice(0,limit).map(match => <MatchRow key={match.id} match={match} onOpen={onOpen} />)}</div>
        {limit < matches.length && <button className="secondary full" onClick={() => setLimit(value => value + 10)}>Load more</button>}
      </div>
    </Sheet>
  </section>;
}
