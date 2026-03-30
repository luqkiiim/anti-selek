import type { SessionData } from "@/components/session/sessionTypes";

export interface SessionQueuedMatchRecord {
  id: string;
  sessionId?: string;
  team1User1Id: string;
  team1User2Id: string;
  team2User1Id: string;
  team2User2Id: string;
  createdAt: Date | string;
}

export function getQueuedMatchUserIds(
  queuedMatch: SessionQueuedMatchRecord | SessionData["queuedMatch"] | null | undefined
) {
  if (!queuedMatch) {
    return [];
  }

  if ("team1User1Id" in queuedMatch) {
    return [
      queuedMatch.team1User1Id,
      queuedMatch.team1User2Id,
      queuedMatch.team2User1Id,
      queuedMatch.team2User2Id,
    ];
  }

  return [
    queuedMatch.team1User1.id,
    queuedMatch.team1User2.id,
    queuedMatch.team2User1.id,
    queuedMatch.team2User2.id,
  ];
}

export function hasQueuedMatchUser(
  queuedMatch: SessionQueuedMatchRecord | SessionData["queuedMatch"] | null | undefined,
  userId: string
) {
  return getQueuedMatchUserIds(queuedMatch).includes(userId);
}
