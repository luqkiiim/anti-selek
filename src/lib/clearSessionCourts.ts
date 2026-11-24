import { MatchStatus } from "@/types/enums";
import { getQueuedMatchUserIds } from "./sessionQueue";

type CourtMatch = { courtId: string; matchId: string };
type NextUp = { id: string; playerIds: string[] };

export type ClearCourtsRequest = {
  courts: Array<CourtMatch & { scoreRevision: number }>;
  nextUp: NextUp | null;
};

export type ClearCourtsResponse = {
  clearedCourts: CourtMatch[];
  queuedMatch: null;
};

export function isClearableCourtMatch(status: string | undefined) {
  return status === MatchStatus.PENDING || status === MatchStatus.IN_PROGRESS;
}

export function getClearCourtsNextUp(queue: Parameters<typeof getQueuedMatchUserIds>[0]): NextUp | null {
  return queue ? { id: queue.id, playerIds: getQueuedMatchUserIds(queue) } : null;
}

export function matchesClearCourtsNextUp(expected: NextUp | null, current: NextUp | null) {
  if (!expected || !current) return expected === current;
  return expected.id === current.id && expected.playerIds.every((id, index) => id === current.playerIds[index]);
}

export function matchesClearCourtsTargets(expected: ClearCourtsRequest["courts"], current: ClearCourtsRequest["courts"]) {
  const byCourtId = new Map(current.map(court => [court.courtId, court]));
  return expected.length === current.length && expected.every(court => {
    const match = byCourtId.get(court.courtId);
    return match?.matchId === court.matchId && match.scoreRevision === court.scoreRevision;
  });
}
