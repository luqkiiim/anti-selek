"use client";

export interface DashboardCommunity {
  id: string;
  name: string;
  role: "ADMIN" | "STAFF" | "MEMBER";
  viewerIsOwner?: boolean;
  isPasswordProtected: boolean;
  isTutorial?: boolean;
  membersCount: number;
  sessionsCount: number;
}
