import { getSideSpecificCourtCreateMixedSide } from "@/lib/courtCreate";
import { getEffectiveMixedSide } from "@/lib/mixedSide";
import { getQueuedMatchUserIds } from "@/lib/sessionQueue";
import type { SideSpecificCourtCreateType } from "@/lib/courtCreate";
import type { Court, Player, QueuedMatch } from "./sessionTypes";

export type CourtCreateActionKey =
  | "BEST"
  | SideSpecificCourtCreateType
  | "MANUAL";

export interface CourtCreateOptionState {
  key: CourtCreateActionKey;
  label: string;
  disabled: boolean;
  detail?: string;
}

function getBusyCourtPlayerIds(courts: Court[]) {
  return new Set(
    courts.flatMap((court) =>
      court.currentMatch
        ? [
            court.currentMatch.team1User1.id,
            court.currentMatch.team1User2.id,
            court.currentMatch.team2User1.id,
            court.currentMatch.team2User2.id,
          ]
        : []
    )
  );
}

function getAvailablePlayerCountByMatchType(
  players: Player[],
  matchType: SideSpecificCourtCreateType
) {
  const requestedSide = getSideSpecificCourtCreateMixedSide(matchType);

  return players.filter(
    (player) =>
      getEffectiveMixedSide({
        gender: player.gender,
        partnerPreference: player.partnerPreference,
        mixedSideOverride: player.mixedSideOverride,
      }) === requestedSide
  ).length;
}

function getAvailablePlayerDetail(count: number) {
  return `Only ${count} available`;
}

export function buildCourtCreateOptionStates({
  players,
  courts,
  queuedMatch,
}: {
  players: Player[];
  courts: Court[];
  queuedMatch: QueuedMatch | null;
}): CourtCreateOptionState[] {
  const busyCourtPlayerIds = getBusyCourtPlayerIds(courts);
  const queuedPlayerIds = new Set(getQueuedMatchUserIds(queuedMatch));
  const availablePlayers = players.filter(
    (player) =>
      !player.isPaused &&
      !busyCourtPlayerIds.has(player.userId) &&
      !queuedPlayerIds.has(player.userId)
  );
  const resolveQueueDetail = queuedMatch ? "Resolve queued match first" : undefined;
  const totalAvailableCount = availablePlayers.length;
  const mensAvailableCount = getAvailablePlayerCountByMatchType(
    availablePlayers,
    "MENS"
  );
  const womensAvailableCount = getAvailablePlayerCountByMatchType(
    availablePlayers,
    "WOMENS"
  );

  const options: CourtCreateOptionState[] = [
    {
      key: "BEST",
      label: "Best Match",
      disabled: !!resolveQueueDetail || totalAvailableCount < 4,
      detail: resolveQueueDetail ?? getAvailablePlayerDetail(totalAvailableCount),
    },
    {
      key: "MENS",
      label: "Men's Court",
      disabled: !!resolveQueueDetail || mensAvailableCount < 4,
      detail: resolveQueueDetail ?? getAvailablePlayerDetail(mensAvailableCount),
    },
    {
      key: "WOMENS",
      label: "Women's Court",
      disabled: !!resolveQueueDetail || womensAvailableCount < 4,
      detail: resolveQueueDetail ?? getAvailablePlayerDetail(womensAvailableCount),
    },
    {
      key: "MANUAL",
      label: "Manual",
      disabled: false,
    },
  ];

  return options.map((option) => ({
    ...option,
    detail:
      option.disabled && option.detail !== undefined ? option.detail : undefined,
  }));
}
