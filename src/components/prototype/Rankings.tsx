import type { ClubPageMember } from "@/components/club/clubTypes";
import { CaretUp, CaretDown, Minus } from "@phosphor-icons/react";
import { Avatar } from "./Primitives";

function RankMovement({ delta, previousRank }: { delta?: number | null; previousRank?: number | null }) {
  if (delta == null || previousRank == null) return null;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "same";
  const places = Math.abs(delta);
  const label = delta === 0 ? "Rank unchanged after the latest completed session" : `${delta > 0 ? "Up" : "Down"} ${places} ${places === 1 ? "place" : "places"} from rank ${previousRank} after the latest completed session`;
  const Icon = delta > 0 ? CaretUp : delta < 0 ? CaretDown : Minus;
  return <span className={`rankings-movement rankings-movement--${direction}`} role="img" aria-label={label} title={label}>
    <Icon size={12} weight="bold" aria-hidden="true" />
    {delta !== 0 && <span aria-hidden="true">{places}</span>}
  </span>;
}

export function Rankings({ members, viewerId, clubName, hasCompletedSession }: { members: ClubPageMember[]; viewerId: string; clubName: string; hasCompletedSession: boolean }) {
  const ranked = members.filter(p => p.status !== "OCCASIONAL" && (p.matchesPlayed ?? 0) > 0)
    .sort((a, b) => b.elo - a.elo || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return <section aria-label="Club rankings" className="rankings-page">
    <h1>Rankings</h1><p className="muted rankings-context">{clubName}</p>
    {ranked.length ? <><div className="rankings-columns" aria-hidden="true"><span>Player</span><span>Rating</span></div>
      <ol className="rankings-list">{ranked.map((player, i) => <li key={player.id} className={`rankings-row${player.id === viewerId ? " rankings-you" : ""}`}>
        <span className="rankings-position">
          <span className="chemistry-rank" aria-label={`Rank ${i + 1}`}>{i + 1}</span>
          {hasCompletedSession && <RankMovement delta={player.rankDelta} previousRank={player.previousRank} />}
        </span>
        <Avatar name={player.name} url={player.avatarUrl} />
        <div className="rankings-name"><strong>{player.name}</strong>{player.id === viewerId && <small>You</small>}</div>
        <strong className="rankings-rating">{player.elo}</strong>
      </li>)}</ol></> : <div className="card"><h3>A fresh leaderboard.</h3><p className="muted">Rankings appear once core players have recorded a match.</p></div>}
    {!ranked.some(p => p.id === viewerId) && ranked.length > 0 && <p className="rankings-note">You’re not ranked in this club yet.</p>}
    <details className="chemistry-explanation"><summary>How rankings work</summary><p>Core players with a recorded match are ranked by club rating. Equal ratings are ordered by name. Arrows show places gained or lost after the latest completed session; a dash means no change. Session standings are separate.</p></details>
  </section>;
}
