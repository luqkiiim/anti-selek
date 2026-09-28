import type { Match, SessionData } from "@/components/session/sessionTypes";
import {
  buildSessionPairingDetails,
  type PairingDetailsPair,
  type PairingDetailsPlayer,
} from "@/lib/sessionPairingDetails";
import styles from "./CourtPairingDetails.module.css";

function number(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function RepeatRows({ title, pairs }: { title: string; pairs: PairingDetailsPair[] }) {
  return (
    <section className={styles.section} aria-label={title}>
      <h3>{title}</h3>
      <dl className={styles.rows}>
        {pairs.map(({ first, second, count }) => (
          <div key={`${first.id}:${second.id}`}>
            <dt>{first.name} · {second.name}</dt>
            <dd>{number(count)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function CourtPairingDetails({ match, session }: { match: Match; session: SessionData }) {
  const roster = new Map(session.players.map((player) => [player.userId, player.user]));
  const withRating = (player: Match["team1User1"]): PairingDetailsPlayer => ({
    ...player,
    elo: roster.get(player.id)?.elo ?? null,
  });
  const lineup = {
    ...match,
    createdAt: match.createdAt ?? "",
    team1User1: withRating(match.team1User1),
    team1User2: withRating(match.team1User2),
    team2User1: withRating(match.team2User1),
    team2User2: withRating(match.team2User2),
  };
  const historyPlayer = (id: string): PairingDetailsPlayer => ({ id, name: roster.get(id)?.name ?? id });
  const history = (session.matches ?? []).map((previous) => ({
    ...previous,
    createdAt: previous.createdAt ?? "",
    team1User1: historyPlayer(previous.team1User1Id),
    team1User2: historyPlayer(previous.team1User2Id),
    team2User1: historyPlayer(previous.team2User1Id),
    team2User2: historyPlayer(previous.team2User2Id),
  }));
  const details = buildSessionPairingDetails(lineup, history);
  const teams = [
    { players: [lineup.team1User1, lineup.team1User2], average: details.team1AverageRating },
    { players: [lineup.team2User1, lineup.team2User2], average: details.team2AverageRating },
  ];

  return (
    <div className={styles.details}>
      {teams.map((team, index) => (
        <section className={styles.section} key={index} aria-label={`Team ${index + 1}`}>
          <table className={styles.ratings}>
            <thead><tr><th scope="col">Team {index + 1}</th><th scope="col">Rating</th><th scope="col">Played</th></tr></thead>
            <tbody>
              {team.players.map((player) => (
                <tr key={player.id}>
                  <th scope="row">{player.name}</th>
                  <td>{number(player.elo)}</td>
                  <td>{number(details.gamesPlayedByPlayer[player.id])}</td>
                </tr>
              ))}
              <tr className={styles.average}><th scope="row">Average</th><td>{number(team.average)}</td><td /></tr>
            </tbody>
          </table>
        </section>
      ))}
      <dl className={`${styles.rows} ${styles.gap}`}><div><dt>Rating gap</dt><dd>{number(details.ratingGap)}</dd></div></dl>
      <RepeatRows title="Shared court repeats" pairs={details.sharedCourtPairs} />
      <RepeatRows title="Partner repeats" pairs={details.partnerPairs} />
      <RepeatRows title="Opponent repeats" pairs={details.opponentPairs} />
    </div>
  );
}
