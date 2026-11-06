"use client";
import { useState, type ReactNode } from "react";
import { CaretRight } from "@phosphor-icons/react";
import type { PlayerProfileMatchHistoryEntry } from "@/lib/profileStats";
import { ProfileMatchList } from "@/components/profile/ProfileMatchList";
import { Sheet } from "./Primitives";

type Props = { controls?: ReactNode; title?: string; ownerName: string; matches: PlayerProfileMatchHistoryEntry[]; onOpen: (match: PlayerProfileMatchHistoryEntry) => void };

export function ProfileMatchHistory({ matches, ownerName, onOpen, controls, title = "Match history" }: Props) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(10);
  return <section className="profile-history profile-match-history">
    <div className="section-heading"><h2>{title}</h2>{matches.length > 0 && <button className="text-button" onClick={() => { setLimit(10); setOpen(true); }}>View history<CaretRight size={15} /></button>}</div>
    {controls}
    {matches.length ? <ProfileMatchList matches={matches.slice(0,3)} ownerName={ownerName} onOpen={onOpen} /> : <p className="profile-footnote">No completed matches yet.</p>}
    <Sheet open={open} title="Match history" onClose={() => setOpen(false)}>
      <div className="profile-match-history"><ProfileMatchList matches={matches.slice(0,limit)} ownerName={ownerName} onOpen={onOpen} />
        {limit < matches.length && <button className="secondary full" onClick={() => setLimit(value => value + 10)}>Load more</button>}
      </div>
    </Sheet>
  </section>;
}
