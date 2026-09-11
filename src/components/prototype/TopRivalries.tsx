"use client";
import { useState } from "react";
import { Sword } from "@phosphor-icons/react";
import type { ClubPulseRivalry } from "@/lib/clubPulse";
import { Avatar, Sheet } from "./Primitives";

function RivalryCard({ rivalry, rank }: { rivalry: ClubPulseRivalry; rank: number }) {
  const [left, right] = rivalry.players;
  return <li className="rivalry-card">
    <div className="rivalry-caption"><span>#{rank}</span></div>
    <div className="rivalry-faceoff">
      <div className="rivalry-player"><Avatar name={left.name} url={left.avatarUrl} /><strong>{left.name}</strong></div>
      <div className="rivalry-score" aria-label={`${left.name}: ${rivalry.playerOneWins} wins. ${right.name}: ${rivalry.playerTwoWins} wins.`}>
        <div aria-hidden="true"><b>{rivalry.playerOneWins}</b><span>–</span><b>{rivalry.playerTwoWins}</b></div>
        <small>HEAD-TO-HEAD WINS</small>
      </div>
      <div className="rivalry-player"><Avatar name={right.name} url={right.avatarUrl} /><strong>{right.name}</strong></div>
    </div>
  </li>;
}

export function TopRivalries({ rivalries }: { rivalries: ClubPulseRivalry[] }) {
  const [open, setOpen] = useState(false);
  return <section className="rivalries-section" aria-label="Top rivalries">
    <div className="section-heading"><h3>Top rivalries</h3>{rivalries.length > 0 && <button className="text-button" onClick={() => setOpen(true)}>View all</button>}</div>
    {rivalries.length ? <ol className="rivalry-list">{rivalries.slice(0, 3).map((rivalry, i) => <RivalryCard key={rivalry.players.map(p => p.id).join(":")} rivalry={rivalry} rank={i + 1} />)}</ol>
      : <div className="rivalry-empty"><Sword size={26} weight="duotone" /><p>Keep facing off. Your club’s closest rivalries will appear here.</p></div>}
    <Sheet open={open} title="Top rivalries" onClose={() => setOpen(false)}>
      <ol className="rivalry-list rivalry-list-joined">{rivalries.map((rivalry, i) => <RivalryCard key={rivalry.players.map(p => p.id).join(":")} rivalry={rivalry} rank={i + 1} />)}</ol>
      <details className="chemistry-explanation"><summary>How rivalries work</summary><p>Close records over more games rank higher. Players need at least two games on opposing teams. Each player appears in one rivalry, and guests are excluded. These are head-to-head wins, not individual match scores.</p></details>
    </Sheet>
  </section>;
}
