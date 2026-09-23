import type { SessionData } from "@/components/session/sessionTypes";
import { MatchStatus, SessionCollabFormat, SessionStatus } from "@/types/enums";

export type InterclubScore = {
  clubs: [
    { id: string; name: string; avatarUrl: string | null; wins: number; pointsFor: number; pointsAgainst: number },
    { id: string; name: string; avatarUrl: string | null; wins: number; pointsFor: number; pointsAgainst: number },
  ];
  leaderId: string | null;
  completed: boolean;
};

export function getInterclubScore(session: SessionData): InterclubScore | null {
  if (session.collabFormat !== SessionCollabFormat.INTERCLUB) return null;
  const accepted = session.clubs?.filter((club) => club.status === "ACCEPTED") ?? [];
  if (accepted.length !== 2) return null;

  const clubs = accepted.map((club) => ({
    id: club.id,
    name: club.name,
    avatarUrl: club.avatarUrl ?? null,
    wins: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  })) as InterclubScore["clubs"];
  const byId = new Map(clubs.map((club) => [club.id, club]));

  for (const match of session.matches ?? []) {
    if (
      match.status !== MatchStatus.COMPLETED ||
      !Number.isFinite(match.team1Score) ||
      !Number.isFinite(match.team2Score) ||
      !match.team1ClubId ||
      !match.team2ClubId ||
      match.team1ClubId === match.team2ClubId
    ) continue;
    const first = byId.get(match.team1ClubId);
    const second = byId.get(match.team2ClubId);
    if (!first || !second) continue;
    first.pointsFor += match.team1Score!;
    first.pointsAgainst += match.team2Score!;
    second.pointsFor += match.team2Score!;
    second.pointsAgainst += match.team1Score!;
    if (match.winnerTeam === 1) first.wins++;
    if (match.winnerTeam === 2) second.wins++;
  }

  const [first, second] = clubs;
  const firstDiff = first.pointsFor - first.pointsAgainst;
  const secondDiff = second.pointsFor - second.pointsAgainst;
  const leaderId = first.wins !== second.wins
    ? (first.wins > second.wins ? first.id : second.id)
    : firstDiff !== secondDiff
      ? (firstDiff > secondDiff ? first.id : second.id)
      : null;

  return { clubs, leaderId, completed: session.status === SessionStatus.COMPLETED };
}
