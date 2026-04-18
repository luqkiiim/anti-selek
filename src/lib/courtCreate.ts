import { MixedSide } from "@/types/enums";

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

export function getSideSpecificCourtCreateMixedSide(
  matchType: SideSpecificCourtCreateType
) {
  return matchType === "MENS" ? MixedSide.UPPER : MixedSide.LOWER;
}

export function getSideSpecificCourtCreateShortageMessage(
  matchType: SideSpecificCourtCreateType,
  availableCount: number
) {
  return `Not enough available players for a ${getSideSpecificCourtCreateLabel(
    matchType
  )} (need 4, have ${availableCount}).`;
}
