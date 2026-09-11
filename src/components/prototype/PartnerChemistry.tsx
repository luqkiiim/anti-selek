"use client";
import { useState } from "react";
import { UsersThree } from "@phosphor-icons/react";
import type { ClubPulsePartnership } from "@/lib/clubPulse";
import { PREFERRED_CONNECTION_MIN_MATCHES } from "@/lib/connectionRanking";
import { Avatar, Sheet } from "./Primitives";

function PairRow({ pair, rank, detailed = false }: {
  pair: ClubPulsePartnership; rank: number; detailed?: boolean;
}) {
  return <li className="chemistry-pair">
    <span className="chemistry-rank" aria-label={`Rank ${rank}`}>{rank}</span>
    <span className="chemistry-avatars" aria-hidden="true">
      {pair.players.map(player => <Avatar key={player.id} name={player.name} url={player.avatarUrl} />)}
    </span>
    <div className="chemistry-names">
      <strong>{pair.players[0].name}<span className="chemistry-and"> &amp; </span>{pair.players[1].name}</strong>
      <small>{detailed ? `${pair.wins} wins · ${pair.losses} losses` : `${pair.matches} games together`}</small>
    </div>
    <div className="chemistry-rate"><strong>{Math.round(pair.winRate)}%</strong><small>win rate</small></div>
  </li>;
}

export function PartnerChemistry({ pairs }: { pairs: ClubPulsePartnership[] }) {
  const [open, setOpen] = useState(false);
  return <section className="chemistry-section" aria-label="Partner chemistry">
    <div className="section-heading"><h3>Partner chemistry</h3>
      {pairs.length > 0 && <button className="text-button" onClick={() => setOpen(true)}>View all</button>}
    </div>
    {pairs.length ? <ol className="chemistry-list chemistry-card">
      {pairs.slice(0, 3).map((pair, i) => <PairRow key={pair.players.map(p => p.id).join(":")} pair={pair} rank={i + 1} />)}
    </ol> : <div className="chemistry-empty"><UsersThree size={26} weight="duotone" /><p>Your strongest pairs will appear as you play more doubles together.</p></div>}
    <Sheet open={open} title="Partner chemistry" onClose={() => setOpen(false)}>
      <ol className="chemistry-list">
        {pairs.map((pair, i) => <PairRow key={pair.players.map(p => p.id).join(":")} pair={pair} rank={i + 1} detailed />)}
      </ol>
      <details className="chemistry-explanation"><summary>How chemistry works</summary><p>Ranked by results and games played together, so a strong record over more games carries more weight. Pairs need at least {PREFERRED_CONNECTION_MIN_MATCHES} games together. Each player appears in one pair; guest partnerships are excluded.</p></details>
    </Sheet>
  </section>;
}
