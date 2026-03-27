import { SessionMode, SessionType } from "@/types/enums";

export function getSessionModeLabel(mode: SessionMode | string): string {
  switch (mode) {
    case SessionMode.MEXICANO:
      return "Open";
    case SessionMode.MIXICANO:
      return "Mixed";
    default:
      return mode;
  }
}

export function getSessionTypeLabel(type: SessionType | string): string {
  switch (type) {
    case SessionType.POINTS:
      return "Points";
    case SessionType.ELO:
      return "Ratings";
    case SessionType.LADDER:
      return "Ladder";
    case SessionType.RACE:
      return "Race";
    default:
      return type;
  }
}
