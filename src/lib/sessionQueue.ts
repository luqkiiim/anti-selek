import type { SessionData } from "@/components/session/sessionTypes";

export interface SessionQueuedMatchRecord {
  id: string;
  sessionId?: string;
  team1Player1Id: string;
  team1Player2Id: string;
  team2Player1Id: string;
  team2Player2Id: string;
  createdAt: Date | string;
}

export function getQueuedMatchUserIds(
  queuedMatch: SessionQueuedMatchRecord | SessionData["queuedMatch"] | null | undefined
) {
  if (!queuedMatch) {
    return [];
  }

  if ("team1Player1Id" in queuedMatch) {
    return [
      queuedMatch.team1Player1Id,
      queuedMatch.team1Player2Id,
      queuedMatch.team2Player1Id,
      queuedMatch.team2Player2Id,
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
  playerId: string
) {
  return getQueuedMatchUserIds(queuedMatch).includes(playerId);
}
