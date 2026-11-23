import { MixedSide } from "@/types/enums";
import { getEffectiveMixedSide } from "./mixedSide";

export const sideSpecificCourtCreateTypes = ["MENS", "WOMENS"] as const;

export type SideSpecificCourtCreateType =
  (typeof sideSpecificCourtCreateTypes)[number];

export function isSideSpecificCourtCreateType(
  value: unknown
): value is SideSpecificCourtCreateType {
  return (
    typeof value === "string" &&
    sideSpecificCourtCreateTypes.includes(
      value as SideSpecificCourtCreateType
    )
  );
}

export function getSideSpecificCourtCreateLabel(
  matchType: SideSpecificCourtCreateType
) {
  return matchType === "MENS" ? "Men's Court" : "Women's Court";
}

export function getDoublesTypeLabel(matchType: SideSpecificCourtCreateType) {
  return matchType === "MENS" ? "Men's Doubles" : "Women's Doubles";
}

export function getSideSpecificCourtCreateMixedSide(
  matchType: SideSpecificCourtCreateType
) {
  return matchType === "MENS" ? MixedSide.UPPER : MixedSide.LOWER;
}

export function isEligibleForDoublesType(
  player: Parameters<typeof getEffectiveMixedSide>[0],
  matchType: SideSpecificCourtCreateType
) {
  return getEffectiveMixedSide(player) === getSideSpecificCourtCreateMixedSide(matchType);
}

export function getSideSpecificCourtCreateShortageMessage(
  matchType: SideSpecificCourtCreateType,
  availableCount: number
) {
  return `Not enough available players for a ${getSideSpecificCourtCreateLabel(
    matchType
  )} (need 4, have ${availableCount}).`;
}
