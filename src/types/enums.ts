export enum SessionType {
  POINTS = "POINTS",
  SOCIAL_MIX = "SOCIAL_MIX",
  ELO = "ELO",
  LADDER = "LADDER",
  RACE = "RACE",
}

export enum SessionMode {
  MEXICANO = "MEXICANO",
  MIXICANO = "MIXICANO",
}

export enum SessionScoringType {
  POINTS = "POINTS",
}

export enum SessionMatchmakingStyle {
  BALANCED = "BALANCED",
  SOCIAL = "SOCIAL",
  LEVEL_MATCH = "LEVEL_MATCH",
}

export enum SessionBalanceMetric {
  SESSION_POINTS = "SESSION_POINTS",
  RATING = "RATING",
}

export enum SessionPairingMode {
  OPEN = "OPEN",
  MIXED = "MIXED",
}

export enum SessionStatus {
  WAITING = "WAITING",
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
}

export enum MatchStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  PENDING_APPROVAL = "PENDING_APPROVAL",
  COMPLETED = "COMPLETED",
}

export enum PlayerGender {
  MALE = "MALE",
  FEMALE = "FEMALE",
  UNSPECIFIED = "UNSPECIFIED",
}

export enum MixedSide {
  UPPER = "UPPER",
  LOWER = "LOWER",
}

export enum PartnerPreference {
  OPEN = "OPEN",
  FEMALE_FLEX = "FEMALE_FLEX",
}

export enum SessionPool {
  A = "A",
  B = "B",
}

export enum ClubPlayerStatus {
  CORE = "CORE",
  OCCASIONAL = "OCCASIONAL",
}

export enum ClubRole {
  MEMBER = "MEMBER",
  STAFF = "STAFF",
  ADMIN = "ADMIN",
}

export enum ClaimRequestStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}

export enum SessionClubRole {
  HOST = "HOST",
  PARTNER = "PARTNER",
}

export enum SessionClubStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
}

export enum OfflineIdentityLinkStatus {
  PENDING = "PENDING",
  ACCEPTED = "ACCEPTED",
  REJECTED = "REJECTED",
}
