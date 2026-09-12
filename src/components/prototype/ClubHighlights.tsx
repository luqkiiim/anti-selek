import { CaretRight, Sparkle } from "@phosphor-icons/react";
import type { ClubPulseNewsItem, ClubPulseNewsType } from "@/lib/clubPulse";
import { Avatar } from "./Primitives";

const labels: Record<ClubPulseNewsType, string> = {
  RATING_JUMP: "Biggest rating climb", PERFECT_SESSION: "Perfect session",
  UPSET: "An upset worth a mention", STREAK_EXTENDED: "On a winning streak",
  BOUNCE_BACK: "A strong comeback", NEW_PEAK: "A new personal best",
};

export function ClubHighlights({ items, onOpen }: {
  items: ClubPulseNewsItem[]; onOpen: (code: string) => void;
}) {
  const seen = new Set<string>();
  const highlights = items.filter(item => {
    const players = item.featuredPlayers.length ? item.featuredPlayers : item.players;
    if (!players.length || players.some(player => seen.has(player.id))) return false;
    players.forEach(player => seen.add(player.id));
    return true;
  }).slice(0, 3);
  return <section className="club-highlights" aria-label="Club highlights">
    <div className="section-heading"><h3>Club highlights</h3><Sparkle size={21} weight="duotone" aria-hidden="true" /></div>
    {highlights.length ? <>
      <p className="highlights-context">From {highlights[0].session.name}</p>
      <ul className="highlights-list">{highlights.map(item => <li key={item.id}>
        <button className="highlight-row" onClick={() => onOpen(item.session.code)} aria-label={`${labels[item.type]}: ${item.title}, ${item.value}. View session`}>
          <span className="highlight-avatars" aria-hidden="true">{(item.featuredPlayers.length ? item.featuredPlayers : item.players).map(player => <Avatar key={player.id} name={player.name} url={player.avatarUrl} />)}</span>
          <span className="highlight-copy"><span className="highlight-label">{labels[item.type]}</span><strong>{item.title}</strong><span className="highlight-value">{item.value}</span></span>
          <CaretRight size={17} aria-hidden="true" />
        </button>
      </li>)}</ul>
    </> : <div className="highlights-empty"><Sparkle size={24} weight="duotone" aria-hidden="true" /><p>Club moments will appear here after a completed session.</p></div>}
  </section>;
}
