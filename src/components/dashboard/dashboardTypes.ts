"use client";

export interface DashboardClub {
  id: string;
  name: string;
  role: "ADMIN" | "STAFF" | "MEMBER";
  viewerIsOwner?: boolean;
  isPasswordProtected: boolean;
  isTutorial?: boolean;
  membersCount: number;
  sessionsCount: number;
}
