import { prisma } from "@/lib/prisma";
import { getSessionModeLabel } from "@/lib/sessionModeLabels";
import { SessionMode } from "@/types/enums";
import type { ManualMatchTeams } from "@/lib/matchmaking/manualMatch";

export const mixedModeLabel = getSessionModeLabel(SessionMode.MIXICANO);

export class GenerateMatchError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface ParsedGenerateMatchRequest {
  requestedCourtIds: string[];
  forceReshuffle: boolean;
  undoCurrentMatch: boolean;
  manualTeams?: unknown;
  excludedUserId?: string;
}

export async function loadSessionRecord(code: string) {
  return prisma.session.findUnique({
    where: { code },
    include: {
      players: {
        include: { user: { select: { id: true, name: true, elo: true } } },
      },
      matches: true,
      queuedMatch: true,
    },
  });
}

export async function loadCourtRecords(
  sessionId: string,
  requestedCourtIds: string[]
) {
  return prisma.court.findMany({
    where: {
      id: { in: requestedCourtIds },
      sessionId,
    },
    include: { currentMatch: true },
  });
}

export type GenerateMatchSession = NonNullable<
  Awaited<ReturnType<typeof loadSessionRecord>>
>;

export type GenerateMatchCourt = Awaited<
  ReturnType<typeof loadCourtRecords>
>[number];

export interface ReshuffleSource {
  ids: [string, string, string, string];
  partition: ManualMatchTeams;
}

export interface GenerateMatchContext {
  sessionData: GenerateMatchSession;
  orderedTargetCourts: GenerateMatchCourt[];
  targetCourt: GenerateMatchCourt;
  freedCourtIds: Set<string>;
  reshuffleSource: ReshuffleSource | null;
}
