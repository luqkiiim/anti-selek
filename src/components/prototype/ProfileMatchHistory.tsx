"use client";
import { useState, type ReactNode } from "react";
import { CaretRight } from "@phosphor-icons/react";
import type { PlayerProfileMatchHistoryEntry } from "@/lib/profileStats";
import { formatProfileDate } from "./profileDate";
import { Sheet } from "./Primitives";

type Props = { controls?: ReactNode; title?: string; matches: PlayerProfileMatchHistoryEntry[]; onOpen: (match: PlayerProfileMatchHistoryEntry) => void };

function MatchRow({ match, onOpen, showSession }: { match: PlayerProfileMatchHistoryEntry; onOpen: Props["onOpen"]; showSession?: boolean }) {
  const win = match.result === "WIN";
  return <button className="profile-history-row" onClick={() => onOpen(match)}>
    <b className={`profile-match-result ${win ? "win" : "loss"}`}>{win ? "W" : "L"}</b>
    <span><strong>{match.score}</strong>{showSession && <small>{match.sessionName}</small>}<small>With {match.partner.name}</small><small>vs {match.opponents.map(player => player.name).join(" & ")}</small><small>{formatProfileDate(match.date)}{match.ratingMode === "UNRATED" ? " · Unrated" : ""}</small></span>
    <CaretRight size={16} />
  </button>;
}

export function ProfileMatchList({ matches, onOpen, showSession = false }: Pick<Props, "matches" | "onOpen"> & { showSession?: boolean }) {
  return <div className="profile-joined-list">{matches.map(match => <MatchRow key={match.id} match={match} onOpen={onOpen} showSession={showSession} />)}</div>;
}

export function ProfileMatchHistory({ matches, onOpen, controls, title = "Match history" }: Props) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(10);
  return <section className="profile-history profile-match-history">
    <div className="section-heading"><h2>{title}</h2>{matches.length > 0 && <button className="text-button" onClick={() => { setLimit(10); setOpen(true); }}>View history<CaretRight size={15} /></button>}</div>
    {controls}
    {matches.length ? <ProfileMatchList matches={matches.slice(0,3)} onOpen={onOpen} /> : <p className="profile-footnote">No completed matches yet.</p>}
    <Sheet open={open} title="Match history" onClose={() => setOpen(false)}>
      <div className="profile-match-history"><ProfileMatchList matches={matches.slice(0,limit)} onOpen={onOpen} />
        {limit < matches.length && <button className="secondary full" onClick={() => setLimit(value => value + 10)}>Load more</button>}
      </div>
    </Sheet>
  </section>;
}
