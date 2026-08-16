import { SessionStatus } from "@/types/enums";

export function getSessionStatusLabel(status: string | null | undefined) {
  switch (status) {
    case SessionStatus.WAITING:
      return "Waiting";
    case SessionStatus.ACTIVE:
      return "Live";
    case SessionStatus.COMPLETED:
      return "Completed";
    default:
      return "Unknown";
  }
}
