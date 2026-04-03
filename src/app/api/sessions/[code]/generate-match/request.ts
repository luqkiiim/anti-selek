import type { ManualMatchTeams } from "@/lib/matchmaking/manualMatch";
import {
  GenerateMatchError,
  type ParsedGenerateMatchRequest,
} from "./shared";

export function parseGenerateMatchRequest(
  body: unknown
): ParsedGenerateMatchRequest {
  const {
    courtId,
    courtIds,
    forceReshuffle = false,
    undoCurrentMatch = false,
    manualTeams,
    excludedUserId,
  } = (typeof body === "object" && body !== null ? body : {}) as {
    courtId?: string;
    courtIds?: unknown;
    forceReshuffle?: boolean;
    undoCurrentMatch?: boolean;
    manualTeams?: unknown;
    excludedUserId?: unknown;
  };

  const requestedCourtIds = Array.isArray(courtIds)
    ? courtIds.filter((value): value is string => typeof value === "string")
    : typeof courtId === "string"
      ? [courtId]
      : [];

  if (requestedCourtIds.length === 0) {
    throw new GenerateMatchError(400, "Court ID required");
  }
  if (forceReshuffle && undoCurrentMatch) {
    throw new GenerateMatchError(
      400,
      "Choose either reshuffle or undo, not both."
    );
  }
  if (excludedUserId !== undefined && typeof excludedUserId !== "string") {
    throw new GenerateMatchError(400, "Invalid excluded player.");
  }
  if (excludedUserId && !forceReshuffle) {
    throw new GenerateMatchError(
      400,
      "Excluded-player reshuffle must be combined with reshuffle."
    );
  }
  if (manualTeams && (forceReshuffle || undoCurrentMatch || excludedUserId)) {
    throw new GenerateMatchError(
      400,
      "Manual match creation cannot be combined with reshuffle or undo."
    );
  }
  if (
    requestedCourtIds.length > 1 &&
    (forceReshuffle || undoCurrentMatch || manualTeams)
  ) {
    throw new GenerateMatchError(
      400,
      "Reshuffle, undo, and manual match creation are only supported for one court at a time."
    );
  }

  return {
    requestedCourtIds,
    forceReshuffle,
    undoCurrentMatch,
    manualTeams,
    excludedUserId,
  };
}

export function parseManualTeams(manualTeams: unknown): ManualMatchTeams {
  if (typeof manualTeams !== "object" || manualTeams === null) {
    throw new GenerateMatchError(400, "Invalid manual team selection.");
  }

  const candidate = manualTeams as {
    team1?: unknown;
    team2?: unknown;
  };
  if (
    !Array.isArray(candidate.team1) ||
    !Array.isArray(candidate.team2) ||
    candidate.team1.length !== 2 ||
    candidate.team2.length !== 2 ||
    candidate.team1.some((id) => typeof id !== "string") ||
    candidate.team2.some((id) => typeof id !== "string")
  ) {
    throw new GenerateMatchError(400, "Invalid manual team selection.");
  }

  return {
    team1: [candidate.team1[0], candidate.team1[1]],
    team2: [candidate.team2[0], candidate.team2[1]],
  } as ManualMatchTeams;
}
