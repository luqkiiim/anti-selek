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
      return "Balanced";
    case SessionType.SOCIAL_MIX:
      return "Social";
    case SessionType.ELO:
      return "Balanced";
    case SessionType.LADDER:
      return "Ladder (legacy)";
    case SessionType.RACE:
      return "Level Match";
    default:
      return type;
  }
}
