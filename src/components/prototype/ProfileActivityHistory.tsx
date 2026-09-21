"use client";
import { useState } from "react";
import type { MemberProfileData } from "@/lib/memberProfile";
import type { PlayerProfileSessionSummary, PlayerProfileMatchHistoryEntry } from "@/lib/profileStats";
import { ProfileHistory } from "./ProfileHistory";
import { ProfileMatchHistory } from "./ProfileMatchHistory";

type Props = {
  clubId: string; userId: string; history: MemberProfileData["history"];
  matches: PlayerProfileMatchHistoryEntry[];
  onOpen: (session: PlayerProfileSessionSummary) => void;
  onOpenMatch: (match: PlayerProfileMatchHistoryEntry) => void;
};
export function ProfileActivityHistory({ clubId, userId, history, matches, onOpen, onOpenMatch }: Props) {
  const [view, setView] = useState<"sessions" | "matches">("sessions");
  const controls = <div className="profile-chart-tabs" role="group" aria-label="History view">
    <button aria-pressed={view === "sessions"} onClick={() => setView("sessions")}>Sessions</button>
    <button aria-pressed={view === "matches"} onClick={() => setView("matches")}>Matches</button>
  </div>;
  return view === "sessions"
    ? <ProfileHistory clubId={clubId} userId={userId} history={history} onOpen={onOpen} title="History" controls={controls} />
    : <ProfileMatchHistory matches={matches} onOpen={onOpenMatch} title="History" controls={controls} />;
}
