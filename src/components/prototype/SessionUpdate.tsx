import { ArrowUpRight, CaretRight, CheckCircle } from "@phosphor-icons/react";
import type { PlayerProfileSessionSummary } from "@/lib/profileStats";

export function SessionUpdate({ session, onOpen }: {
  session: PlayerProfileSessionSummary;
  onOpen: () => void;
}) {
  if (!session.matches) return null;
  const perfect = session.wins === session.matches && session.matches > 1;
  const gained = session.ratingChange > 0;
  const headline = perfect
    ? `You won all ${session.matches} games`
    : gained
      ? `You gained ${session.ratingChange} rating ${session.ratingChange === 1 ? "point" : "points"}`
      : `You played ${session.matches} ${session.matches === 1 ? "game" : "games"}`;
  return <button className="session-update" onClick={onOpen}>
    <span className="session-update-label">Since your last session</span>
    <span className="session-update-main">
      <span className="session-update-icon" aria-hidden="true">{perfect ? <CheckCircle size={24} weight="duotone" /> : <ArrowUpRight size={24} />}</span>
      <span>
        <strong>{headline}</strong>
        <span className="session-update-record">{session.wins} {session.wins === 1 ? "win" : "wins"} · {session.losses} {session.losses === 1 ? "loss" : "losses"}{(!gained || perfect) && ` · ${session.ratingChange > 0 ? "+" : ""}${session.ratingChange} rating`}</span>
      </span>
    </span>
    <span className="session-update-footer"><span>{session.name}</span><span>View session <CaretRight size={15} /></span></span>
  </button>;
}
