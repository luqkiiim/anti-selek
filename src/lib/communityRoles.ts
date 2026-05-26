import { CommunityRole } from "@/types/enums";

export type CommunityRoleValue = `${CommunityRole}`;

export const COMMUNITY_ROLES = [
  CommunityRole.MEMBER,
  CommunityRole.STAFF,
  CommunityRole.ADMIN,
] as const;

export const COMMUNITY_OPERATOR_ROLES = [
  CommunityRole.ADMIN,
  CommunityRole.STAFF,
] as const;

const COMMUNITY_ROLE_RANK: Record<CommunityRole, number> = {
  [CommunityRole.MEMBER]: 0,
  [CommunityRole.STAFF]: 1,
  [CommunityRole.ADMIN]: 2,
};

export function normalizeCommunityRole(
  role: string | null | undefined
): CommunityRole {
  if (role === CommunityRole.ADMIN) return CommunityRole.ADMIN;
  if (role === CommunityRole.STAFF) return CommunityRole.STAFF;
  return CommunityRole.MEMBER;
}

export function isValidCommunityRole(role: unknown): role is CommunityRole {
  return (
    role === CommunityRole.MEMBER ||
    role === CommunityRole.STAFF ||
    role === CommunityRole.ADMIN
  );
}

export function isCommunityAdminRole(
  role: string | null | undefined
): boolean {
  return normalizeCommunityRole(role) === CommunityRole.ADMIN;
}

export function isCommunityOperatorRole(
  role: string | null | undefined
): boolean {
  const normalizedRole = normalizeCommunityRole(role);
  return (
    normalizedRole === CommunityRole.ADMIN ||
    normalizedRole === CommunityRole.STAFF
  );
}

export function getHighestCommunityRole(
  left: string | null | undefined,
  right: string | null | undefined
): CommunityRole {
  const leftRole = normalizeCommunityRole(left);
  const rightRole = normalizeCommunityRole(right);
  return COMMUNITY_ROLE_RANK[leftRole] >= COMMUNITY_ROLE_RANK[rightRole]
    ? leftRole
    : rightRole;
}

export function getCommunityRoleLabel(role: string | null | undefined) {
  switch (normalizeCommunityRole(role)) {
    case CommunityRole.ADMIN:
      return "Admin";
    case CommunityRole.STAFF:
      return "Staff";
    default:
      return "Member";
  }
}
