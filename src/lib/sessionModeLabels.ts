import { SessionMode } from "@/types/enums";

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
