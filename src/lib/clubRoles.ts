import { ClubRole } from "@/types/enums";

export type ClubRoleValue = `${ClubRole}`;

export const COMMUNITY_ROLES = [
  ClubRole.MEMBER,
  ClubRole.STAFF,
  ClubRole.ADMIN,
] as const;

export const COMMUNITY_OPERATOR_ROLES = [
  ClubRole.ADMIN,
  ClubRole.STAFF,
] as const;

const COMMUNITY_ROLE_RANK: Record<ClubRole, number> = {
  [ClubRole.MEMBER]: 0,
  [ClubRole.STAFF]: 1,
  [ClubRole.ADMIN]: 2,
};

export function normalizeClubRole(
  role: string | null | undefined
): ClubRole {
  if (role === ClubRole.ADMIN) return ClubRole.ADMIN;
  if (role === ClubRole.STAFF) return ClubRole.STAFF;
  return ClubRole.MEMBER;
}

export function isValidClubRole(role: unknown): role is ClubRole {
  return (
    role === ClubRole.MEMBER ||
    role === ClubRole.STAFF ||
    role === ClubRole.ADMIN
  );
}

export function isClubAdminRole(
  role: string | null | undefined
): boolean {
  return normalizeClubRole(role) === ClubRole.ADMIN;
}

export function isClubOperatorRole(
  role: string | null | undefined
): boolean {
  const normalizedRole = normalizeClubRole(role);
  return (
    normalizedRole === ClubRole.ADMIN ||
    normalizedRole === ClubRole.STAFF
  );
}

export function getHighestClubRole(
  left: string | null | undefined,
  right: string | null | undefined
): ClubRole {
  const leftRole = normalizeClubRole(left);
  const rightRole = normalizeClubRole(right);
  return COMMUNITY_ROLE_RANK[leftRole] >= COMMUNITY_ROLE_RANK[rightRole]
    ? leftRole
    : rightRole;
}

export function getClubRoleLabel(role: string | null | undefined) {
  switch (normalizeClubRole(role)) {
    case ClubRole.ADMIN:
      return "Admin";
    case ClubRole.STAFF:
      return "Staff";
    default:
      return "Member";
  }
}
