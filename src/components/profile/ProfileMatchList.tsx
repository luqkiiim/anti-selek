"use client";

import type { ReactNode } from "react";
import type { PlayerProfileMatchHistoryEntry } from "@/lib/profileStats";
import { Sheet } from "@/components/prototype/Primitives";
import { formatProfileDate } from "@/components/prototype/profileDate";
import styles from "./ProfileMatchList.module.css";

type Match = PlayerProfileMatchHistoryEntry;
type Props = {
  matches: Match[];
  ownerName: string;
  onOpen: (match: Match) => void;
  showSession?: boolean;
  highlightPlayerId?: string;
};

function firstName(name: string) {
  return name.trim().split(/\s+/)[0];
}

function MatchCard({ match, ownerName, onOpen, highlightPlayerId }: { match: Match } & Pick<Props, "ownerName" | "onOpen" | "highlightPlayerId">) {
  const win = match.result === "WIN";
  const scores = match.score.split(/\s*[-–]\s*/);
  const label = `${win ? "Win" : "Loss"}, ${ownerName} & ${match.partner.name} ${match.score} vs ${match.opponents.map(person => person.name).join(" & ")}, ${match.sessionName}, ${formatProfileDate(match.date)}`;
  return <button type="button" className={`${styles.card} ${win ? styles.win : styles.loss}`} data-profile-match={match.id} data-result={match.result} aria-label={label} onClick={() => onOpen(match)}>
    <span className={styles.team} data-team="owner">
      <span className={styles.player} title={ownerName}>{firstName(ownerName)}</span>
      <span className={`${styles.player} ${match.partner.id === highlightPlayerId ? styles.selected : ""}`} title={match.partner.name}>{firstName(match.partner.name)}</span>
    </span>
    <span className={styles.score} data-match-score>
      {scores.length === 2 ? <>
        <span className={`${styles.ownScore} ${win ? styles.winner : ""}`} data-score="owner" data-winner={win || undefined}>{scores[0]}</span>
        <span className={styles.dash}>–</span>
        <span className={win ? "" : styles.winner} data-score="opponent" data-winner={!win || undefined}>{scores[1]}</span>
      </> : match.score}
    </span>
    <span className={styles.team} data-team="opponents">{match.opponents.map(person => <span className={`${styles.player} ${person.id === highlightPlayerId ? styles.selected : ""}`} title={person.name} key={person.id}>{firstName(person.name)}</span>)}</span>
  </button>;
}

export function ProfileMatchList({ matches, ownerName, onOpen, showSession = true, highlightPlayerId }: Props) {
  const groups: Array<{ key: string; sessionId: string; date: string; first: Match; matches: Match[] }> = [];
  for (const match of matches) {
    const date = formatProfileDate(match.date);
    const last = groups.at(-1);
    if (last?.sessionId === match.sessionId && last.date === date) last.matches.push(match);
    else groups.push({ key: match.id, sessionId: match.sessionId, date, first: match, matches: [match] });
  }
  const cards = (items: Match[]) => <div className={styles.cards}>{items.map(match => <MatchCard key={match.id} match={match} ownerName={ownerName} onOpen={onOpen} highlightPlayerId={highlightPlayerId} />)}</div>;
  return <div className={styles.list}>
    {showSession ? groups.map(group => <section key={group.key}>
      <div className={styles.sessionHeading}>
        <h3 className={styles.sessionName}>{group.first.sessionName}{group.first.ratingMode === "UNRATED" && <span className={styles.unrated}> · Unrated</span>}</h3>
        <span className={styles.date}>{group.date}</span>
      </div>
      {cards(group.matches)}
    </section>) : cards(matches)}
  </div>;
}

export function ProfileMatchDetails({ match, ownerName, onClose, sessionAction, renderParticipant = person => person.name }: {
  match: Match | null;
  ownerName: string;
  onClose: () => void;
  sessionAction?: ReactNode;
  renderParticipant?: (person: Match["partner"]) => ReactNode;
}) {
  return <Sheet open={!!match} title="Match details" onClose={onClose}>{match && <div className={styles.details}>
    <span className={styles.detailSession}>{match.sessionName}</span>
    <h2>{match.result === "WIN" ? "Win" : "Loss"} · {match.score}</h2>
    <p className={styles.date}>{formatProfileDate(match.date)}</p>
    <h3>Partners</h3><p>{ownerName} &amp; {renderParticipant(match.partner)}</p>
    <h3>Opponents</h3><p>{match.opponents.map((person, index) => <span key={person.id}>{index > 0 && " & "}{renderParticipant(person)}</span>)}</p>
    <p className={styles.rating}>{match.ratingMode === "UNRATED" ? "Unrated" : match.eloChange === null ? "Rating change unavailable" : `${match.eloChange > 0 ? "+" : ""}${match.eloChange} rating`}</p>
    {sessionAction}
  </div>}</Sheet>;
}
