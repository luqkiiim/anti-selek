import type { SideSpecificCourtCreateType } from "@/lib/courtCreate";

export type GenerateMatchRequestBody =
  | { courtId: string; matchType?: SideSpecificCourtCreateType }
  | { courtIds: string[] }
  | {
      courtId: string;
      manualTeams: { team1: [string, string]; team2: [string, string] };
    };

/** Match the session API's single court and multi-court request shapes. */
export function buildGenerateMatchesRequest(
  courtIds: string[]
): GenerateMatchRequestBody | null {
  if (courtIds.length === 0) return null;

  return courtIds.length === 1
    ? { courtId: courtIds[0] }
    : { courtIds: [...courtIds] };
}

/** Build the generate-match request sent after a host completes manual selection. */
export function buildManualGenerateMatchRequest(
  courtId: string,
  manualTeams: { team1: [string, string]; team2: [string, string] }
): GenerateMatchRequestBody {
  return { courtId, manualTeams };
}
