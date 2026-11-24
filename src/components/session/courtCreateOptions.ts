import {
  getDoublesTypeLabel,
  getSideSpecificCourtCreateLabel,
  isEligibleForDoublesType,
  sideSpecificCourtCreateTypes,
  type SideSpecificCourtCreateType,
} from "@/lib/courtCreate";
import { getQueuedMatchUserIds } from "@/lib/sessionQueue";
import type { Court, Player, QueuedMatch } from "./sessionTypes";

const automaticCourtOptions = ["BEST", ...sideSpecificCourtCreateTypes] as const;
export type AutomaticCourtOption = (typeof automaticCourtOptions)[number];
export type CourtCreateActionKey = AutomaticCourtOption | "MANUAL";

export interface CourtCreateOptionState {
  key: CourtCreateActionKey;
  label: string;
  disabled: boolean;
  detail?: string;
}

type CourtOptionRoster = {
  players: Player[];
  courts: Court[];
  queuedMatch: QueuedMatch | null;
};

function getAvailableCourtPlayers({ players, courts, queuedMatch }: CourtOptionRoster) {
  const occupiedIds = new Set(courts.flatMap(({ currentMatch: match }) =>
    match ? [match.team1User1.id, match.team1User2.id, match.team2User1.id, match.team2User2.id] : []
  ));
  const queuedIds = new Set(getQueuedMatchUserIds(queuedMatch));
  return players.filter(player => !player.isPaused && !occupiedIds.has(player.userId) && !queuedIds.has(player.userId));
}

function getSideCount(players: Player[], matchType: SideSpecificCourtCreateType) {
  return players.filter(player => isEligibleForDoublesType(player, matchType)).length;
}

export function buildCourtCreateOptionStates(roster: CourtOptionRoster): CourtCreateOptionState[] {
  const players = getAvailableCourtPlayers(roster);
  const options: CourtCreateOptionState[] = automaticCourtOptions.map(key => {
    const count = key === "BEST" ? players.length : getSideCount(players, key);
    return {
      key,
      label: key === "BEST" ? "Best Match" : getSideSpecificCourtCreateLabel(key),
      disabled: !!roster.queuedMatch || count < 4,
      detail: roster.queuedMatch ? "Resolve queued match first" : count < 4 ? `Only ${count} available` : undefined,
    };
  });
  return [...options, { key: "MANUAL", label: "Manual", disabled: false }];
}

export function buildCourtReshuffleOptions(roster: CourtOptionRoster, courtId: string) {
  const players = getAvailableCourtPlayers({
    ...roster,
    courts: roster.courts.filter(court => court.id !== courtId),
  }).filter(player => !player.skipNextMatchAt);

  return automaticCourtOptions.map(key => {
    const count = key === "BEST" ? players.length : getSideCount(players, key);
    return {
      key,
      label: key === "BEST" ? "Best Match" : getDoublesTypeLabel(key),
      disabled: count < 4,
      detail: count < 4 ? `Only ${count} eligible ${count === 1 ? "player" : "players"}` : undefined,
    };
  });
}
