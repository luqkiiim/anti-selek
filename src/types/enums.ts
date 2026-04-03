export enum SessionType {
  POINTS = "POINTS",
  ELO = "ELO",
  LADDER = "LADDER",
  RACE = "RACE",
}

export enum SessionMode {
  MEXICANO = "MEXICANO",
  MIXICANO = "MIXICANO",
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

export enum CommunityPlayerStatus {
  CORE = "CORE",
  OCCASIONAL = "OCCASIONAL",
}

export enum ClaimRequestStatus {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
}
