"use client";

import type { QueuedMatch, SessionData } from "@/components/session/sessionTypes";

export interface UseSessionMatchActionsDependencies {
  code: string;
  sessionData: SessionData | null;
  safeJson: (res: Response) => Promise<any>;
  patchSessionData: (updater: (current: SessionData) => SessionData) => void;
  scheduleSessionRefresh: (delay?: number) => void;
  setError: (message: string) => void;
}

export interface CourtActionDraft {
  action: "reshuffle" | "undo";
  courtId: string;
  courtNumber: number;
  courtLabel: string;
  team1Names: [string, string];
  team2Names: [string, string];
}

export interface QueuePromotionAnimation {
  id: string;
  sourceQueuedMatch: QueuedMatch;
  targetCourtId: string;
  replacementQueuedMatchId: string | null;
}
