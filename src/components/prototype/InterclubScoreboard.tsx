"use client";

import type { SessionData } from "@/components/session/sessionTypes";
import { getInterclubScore } from "@/lib/interclubScoreboard";
import { Avatar } from "./Primitives";

export default function InterclubScoreboard({ session }: { session: SessionData }) {
  const score = getInterclubScore(session);
  if (!score) return null;
  const [left, right] = score.clubs;
  const leader = score.clubs.find((club) => club.id === score.leaderId);

  return (
    <section className="interclub-scoreboard" aria-label="Interclub score">
      <div className="interclub-heading">
        <strong>Club score</strong>
        <span>{score.completed ? "Final" : "Live"}</span>
      </div>
      <div className="interclub-sides">
        {[left, right].map((club) => (
          <div className="interclub-side" key={club.id}>
            <Avatar name={club.name} url={club.avatarUrl} />
            <strong>{club.name}</strong>
          </div>
        ))}
        <div className="interclub-numbers" aria-label={`${left.name} ${left.wins}, ${right.name} ${right.wins}`}>
          <b>{left.wins}</b><span>–</span><b>{right.wins}</b>
        </div>
      </div>
      <p className="interclub-result">{leader ? `${leader.name} ${score.completed ? "wins" : "leads"}` : "Draw"}</p>
    </section>
  );
}
