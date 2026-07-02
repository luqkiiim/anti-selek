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

export function canQuickAccessClub(
  session: Session | null | undefined,
  clubId: string | null | undefined
): boolean {
  if (!isQuickAccessSession(session)) {
    return true;
  }

  return (
    !!clubId && session?.user?.quickAccessClubId === clubId
  );
}

export function canQuickAccessSessionRead(
  session: Session | null | undefined,
  sessionData: {
    clubId?: string | null;
    sessionClubs?: Array<{
      clubId: string;
      status: string;
    }>;
  }
): boolean {
  if (!isQuickAccessSession(session)) {
    return true;
  }

  const quickAccessClubId = session?.user?.quickAccessClubId;
  if (!quickAccessClubId) {
    return false;
  }

  if (sessionData.clubId === quickAccessClubId) {
    return true;
  }

  return (
    sessionData.sessionClubs?.some(
      (link) =>
        link.clubId === quickAccessClubId && link.status === "ACCEPTED"
    ) ?? false
  );
}

export function getQuickAccessDeniedMessage(): string {
  return "Sign up or log in with a full account to use this feature";
}
