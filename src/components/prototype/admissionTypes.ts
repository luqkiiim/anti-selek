import type { RecoveryEligibility } from "@/types/playerRecovery";
export type AdmissionKind = "EXISTING_PLAYER" | "OWNED_PLAYER" | "NEW_PLAYER";
export type AdmissionStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type AdmissionCandidate = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  elo?: number;
  matchesPlayed?: number;
  lastPlayedAt?: string | null;
};

export type AdmissionRequest = {
  id: string;
  clubId: string;
  originInvitationId?: string | null;
  recovery?: RecoveryEligibility;
  recoveryReviewAuthorized?: boolean;
  kind: AdmissionKind;
  status: AdmissionStatus;
  revision: number;
  requestedPlayerId: string | null;
  proposedPlayerName: string | null;
  proposedGender: string | null;
  note: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  decision?: string | null;
  approvedPlayerId?: string | null;
  requester?: { id: string; name: string; email: string | null };
  requesterName?: string;
  requesterEmail?: string | null;
  name?: string;
  targetName?: string | null;
  history?: AdmissionCandidate | null;
  currentRating?: number | null;
  conflict?: string | null;
  ownedPlayers?: Array<{ id: string; name: string }>;
  possibleDuplicates?: Array<{ id: string; name: string; elo: number }>;
  events?: Array<{ id: string; action: string; revision: number; createdAt?: string }>;
  approvedPlayer?: { id: string; name: string } | null;
};

export type AdmissionRequestSummary = Pick<AdmissionRequest, "id" | "clubId" | "kind" | "status" | "revision" | "createdAt"> & Partial<AdmissionRequest>;

export type AdmissionDiscovery = {
  club: { id: string; name: string; allowJoinRequests: boolean };
  passwordProof: { status: "NOT_REQUIRED" | "PASSWORD_REQUIRED" | "VERIFIED"; expiresAt: string | null };
  players: AdmissionCandidate[];
  ownedPlayers: Array<{ id: string; name: string }>;
  identityReviewRequired: boolean;
  requests: AdmissionRequestSummary[];
  membership: { playerId: string } | null;
  access: { role: string; status: string } | null;
};

export type AdminAdmissionList = {
  allowJoinRequests: boolean;
  requests: AdmissionRequest[];
  candidates: AdmissionCandidate[];
};
