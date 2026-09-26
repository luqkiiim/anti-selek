"use client";

export interface DashboardClub {
  id: string;
  name: string;
  avatarUrl?: string | null;
  role: "ADMIN" | "STAFF" | "MEMBER";
  viewerIsOwner?: boolean;
  isPasswordProtected: boolean;
  isTutorial?: boolean;
  membersCount: number;
  sessionsCount: number;
  sessionStatus?: "ACTIVE" | "WAITING" | null;
}

export type ClubFormField = "clubName" | "password";

export interface ClubFormError {
  error: string;
  field?: ClubFormField;
}
