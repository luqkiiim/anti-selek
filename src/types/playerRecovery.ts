export type InvitationAvailability = "ACTIVE" | "EXPIRED" | "REPLACED" | "REVOKED" | "REDEEMED" | "UNAVAILABLE";
export type UnavailableClaimInvitationContext = {
  purpose: "CLAIM";
  status: "CONTINUATION_REQUIRED" | "UNAVAILABLE";
  invitationAvailability: InvitationAvailability;
  message: string;
};
export type RecoveryEligibility = {
  invitationAvailability: InvitationAvailability;
  needsAccessRestore: boolean;
  duplicate: { id: string; memberId: string; name: string; eligible: boolean; blockers: string[] } | null;
  blockers: string[];
  canApprove: boolean;
};
export type RecoveryStatus = {
  request: {
    id: string; clubId: string; requestedPlayerId: string | null; originInvitationId: string | null;
    status: string; revision: number; targetName: string | null; clubName: string;
  } | null;
  recovery: RecoveryEligibility | null;
  destination?: string;
};

export type PlayerInvitationPurpose = "CLAIM" | "CORRECTION" | "ACCESS_RESTORE";
export type AuthorizedAccessAction = "PRESERVE_ACTIVE" | "GRANT_MEMBER" | "RESTORE_MEMBER";
export type IdentityAccountReference = {
  accountId: string;
  accountRef: string;
  displayName: string;
  maskedEmail: string | null;
  isActive: boolean;
};
export type IdentityAccessSnapshot = {
  accessId: string | null;
  status: "NONE" | "ACTIVE" | "REVOKED";
  role: "OWNER" | "ADMIN" | "STAFF" | "MEMBER" | null;
  revision: number | null;
};
export type IdentityMemberSnapshot = { memberId: string; archivedAt: string | null; retiredByAdmissionEventId: string | null };
export type IdentityInvitationSummary = {
  id: string;
  purpose: PlayerInvitationPurpose;
  status: "ACTIVE" | "EXPIRED" | "REVOKED" | "REDEEMED";
  expiresAt: string;
};
export type ExplicitMemberAccessAction = Exclude<AuthorizedAccessAction, "PRESERVE_ACTIVE">;
export type IdentityHistorySummary = {
  matchesPlayed: number;
  lastPlayedAt: string | null;
  blockers: string[];
};
export type CorrectionAccountCandidate = {
  account: IdentityAccountReference;
  source: {
    playerId: string;
    name: string;
    rating: number;
    isActive: boolean;
    memberId: string;
    archivedAt: string | null;
    clubAccess: IdentityAccessSnapshot;
    history: IdentityHistorySummary;
  };
  eligible: boolean;
  blockers: string[];
};
export type IdentityOptionsResponse = {
  purpose: "CORRECTION" | "ACCESS_RESTORE";
  target: {
    playerId: string;
    name: string;
    rating: number;
    isActive: boolean;
    ownerAccount: IdentityAccountReference | null;
    member: IdentityMemberSnapshot | null;
    clubAccess: IdentityAccessSnapshot | null;
    history: IdentityHistorySummary;
    activeInvitation: IdentityInvitationSummary | null;
    accessRestoreBlockers: string[];
  };
  correctionCandidates: CorrectionAccountCandidate[];
};
export type InvitationEffects = {
  accessOutcome: "PRESERVED_ACTIVE" | "GRANTED_MEMBER" | "RESTORED_MEMBER" | "UNCHANGED";
  accessBefore: IdentityAccessSnapshot;
  accessAfter: IdentityAccessSnapshot;
  rosterOutcome: "UNCHANGED" | "UNARCHIVED_EXISTING";
  sourceRetired: boolean;
};
export type CreateCorrectionInvitationInput = {
  recipientAccountId: string;
  sourcePlayerId: string;
  sourceMemberId: string;
  retireSourcePlayerId: string;
  reason: string;
  authorizedAccessAction?: AuthorizedAccessAction;
  restoreArchivedRoster: false;
  replaceInvitationId?: string;
};
export type CreateAccessRestoreInvitationInput = {
  recipientAccountId: string;
  authorizedAccessAction?: AuthorizedAccessAction;
  restoreArchivedRoster: boolean;
  reason: string;
  replaceInvitationId?: string;
};
export type InvitationExecutionReceipt = InvitationEffects & {
  requestId: string;
  purpose: Exclude<PlayerInvitationPurpose, "CLAIM">;
  actorAccountId: string;
  authorizedByAccountId: string;
  authorizedAt: string;
  confirmedAt: string;
  clubId: string;
  targetPlayerId: string;
  sourcePlayerId: string | null;
  destination: string;
  supersededRecoveryRequest: {
    requestId: string;
    previousRevision: number;
    cancelledRevision: number;
    cancellationEventId: string;
    originInvitationId: string;
  } | null;
};
export type SupersedableRecoveryRequest = {
  requestId: string;
  revision: number;
  originInvitationId: string;
  invitationAvailability: "EXPIRED" | "REPLACED" | "REVOKED";
};
export type SupersedeRecoveryRequestInput = { requestId: string; revision: number };
export type ConfirmAuthorizedInvitationInput = {
  confirm: true;
  supersedeRecoveryRequest?: SupersedeRecoveryRequestInput;
};
export type AuthorizedInvitationContext = {
  status: "MATCHED";
  invitationId: string;
  purpose: Exclude<PlayerInvitationPurpose, "CLAIM">;
  expiresAt: string;
  recipient: { accountId: string; accountRef: string; displayName: string };
  authorizedBy: { accountId: string; displayName: string; authorizedAt: string };
  club: { id: string; name: string };
  target: { playerId: string; name: string; rating: number; isActive: boolean; member: IdentityMemberSnapshot | null; history: IdentityHistorySummary };
  source: { playerId: string; name: string; rating: number; isActive: boolean; member: IdentityMemberSnapshot; clubAccess: IdentityAccessSnapshot; history: IdentityHistorySummary } | null;
  authorizedAccessAction: AuthorizedAccessAction;
  restoreArchivedRoster: boolean;
  reason: string;
  completedReceipt: InvitationExecutionReceipt | null;
  supersedableRecoveryRequest: SupersedableRecoveryRequest | null;
};
export type GenericInvitationContext = {
  status: "ACCOUNT_REQUIRED" | "WRONG_ACCOUNT" | "CONTINUATION_REQUIRED" | "UNAVAILABLE";
  message: string;
};
export type CreateAuthorizedInvitationResponse = {
  purpose: Exclude<PlayerInvitationPurpose, "CLAIM">;
  invitation: IdentityInvitationSummary | null;
  secret?: string;
  replacementRequired?: IdentityInvitationSummary;
  receipt?: InvitationExecutionReceipt;
};
