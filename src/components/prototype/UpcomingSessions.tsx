import { CalendarBlank, CaretRight } from "@phosphor-icons/react";
import type { ClubPageSession } from "@/components/club/clubTypes";
import { Avatar } from "./Primitives";

export function UpcomingSessions({ sessions, canManage, onOpen, onViewAll }: {
  sessions: ClubPageSession[];
  canManage: boolean;
  onOpen: (code: string) => void;
  onViewAll?: () => void;
}) {
  if (!sessions.length) return null;
  const shown = onViewAll ? sessions.slice(0, 2) : sessions;
  return <section className="upcoming-sessions" aria-label="Upcoming sessions">
    <div className="section-heading"><h3>Upcoming</h3>{onViewAll && sessions.length > 2 && <button className="text-button" onClick={onViewAll}>View all ({sessions.length})</button>}</div>
    {shown.map(session => <div className="upcoming-session" key={session.id}>
      <div className="upcoming-session-title"><span className="upcoming-icon"><CalendarBlank size={23} weight="duotone" aria-hidden="true" /></span><h2>{session.name}</h2><span className="upcoming-status">Not started</span></div>
      <div className="upcoming-roster">
        {session.players.length > 0 && <span className="upcoming-avatars" aria-hidden="true">{session.players.slice(0, 4).map(player => <Avatar key={player.user.id} name={player.user.name} url={player.user.avatarUrl} />)}{session.players.length > 4 && <span className="upcoming-more">+{session.players.length - 4}</span>}</span>}
        <span>{session.players.length ? `${session.players.length} ${session.players.length === 1 ? "player" : "players"} on the roster` : "No players added yet"}</span>
      </div>
      <button className="secondary upcoming-open" onClick={() => onOpen(session.code)}>{canManage ? "Manage session" : "View session"}<CaretRight size={17} /></button>
    </div>)}
  </section>;
}
