import type { Session } from "next-auth";

export function normalizeNameLookupKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function isQuickAccessSession(
  session: Session | null | undefined
): boolean {
  return session?.user?.isQuickAccess === true;
}

export function canQuickAccessCommunity(
  session: Session | null | undefined,
  communityId: string | null | undefined
): boolean {
  if (!isQuickAccessSession(session)) {
    return true;
  }

  return (
    !!communityId && session?.user?.quickAccessCommunityId === communityId
  );
}

export function getQuickAccessDeniedMessage(): string {
  return "Sign up or log in with a full account to use this feature";
}
