import { CaretRight } from "@phosphor-icons/react";
import type { PlayerProfileSessionSummary } from "@/lib/profileStats";
import { formatProfileDate } from "./profileDate";

export function SessionUpdate({ session, onOpen }: {
  session: PlayerProfileSessionSummary;
  onOpen: () => void;
}) {
  if (!session.matches) return null;
  const date = formatProfileDate(session.date);
  const result = `${session.wins} ${session.wins === 1 ? "win" : "wins"} · ${session.losses} ${session.losses === 1 ? "loss" : "losses"}`;
  const rating = session.ratingMode === "UNRATED" ? "Unrated" : `${session.ratingChange > 0 ? "+" : ""}${session.ratingChange} rating`;
  return <button type="button" className="session-update" onClick={onOpen}
    aria-label={`Last session, ${session.name}, ${date}. ${result}. ${rating}. View recap`}>
    <span className="session-update-heading">
      <span className="session-update-label">Last session <span>· {date}</span></span>
      <span className="session-update-link">View recap <CaretRight size={15} aria-hidden="true" /></span>
    </span>
    <span className="session-update-record"><strong>{result}</strong><span> · {rating}</span></span>
  </button>;
}
