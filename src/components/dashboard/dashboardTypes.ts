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

export type ClubFormField = "clubName" | "password";

export interface ClubFormError {
  error: string;
  field?: ClubFormField;
}
