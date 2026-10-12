import "server-only";
import type { Session } from "next-auth";
import { normalizeAuthEmail } from "@/lib/globalAdmin";
import { prisma } from "@/lib/prisma";

/** Read permission only; never use this capability to authorize mutations. */
export function isGlobalClubViewerEmail(email?: string | null): boolean {
  const normalized = normalizeAuthEmail(email);
  if (!normalized) return false;
  return (process.env.GLOBAL_CLUB_VIEWER_EMAILS ?? "")
    .split(",")
    .some((entry) => normalizeAuthEmail(entry) === normalized);
}

export function isGlobalClubView(request: Request): boolean {
  const values = new URL(request.url).searchParams.getAll("view");
  return values.includes("global");
}

/** Revalidate the account and allowlist rather than trusting a previously issued flag. */
export async function canBrowseAllClubs(session: Session | null | undefined): Promise<boolean> {
  if (!session?.user?.id || session.user.isQuickAccess || !session.user.canBrowseAllClubs) return false;
  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, isActive: true, passwordHash: true },
  });
  return !!account?.isActive && !!account.passwordHash && isGlobalClubViewerEmail(account.email);
}

export async function canReadClubGlobally(session: Session | null | undefined, clubId: string): Promise<boolean> {
  if (!clubId || !(await canBrowseAllClubs(session))) return false;
  const club = await prisma.club.findUnique({ where: { id: clubId }, select: { isTutorial: true } });
  return !!club && !club.isTutorial;
}

export async function canReadSessionGlobally(
  request: Request,
  session: Session | null | undefined,
  data: { clubId?: string | null; club?: { isTutorial: boolean } | null; sessionClubs?: Array<{ clubId: string; status: string }> },
): Promise<boolean> {
  const views = new URL(request.url).searchParams.getAll("view");
  if (views.length !== 1 || views[0] !== "global" || data.club?.isTutorial) return false;
  const ids = new URL(request.url).searchParams.getAll("clubId");
  const clubId = ids[0];
  if (ids.length !== 1 || !clubId || clubId.trim() !== clubId || clubId.length > 100) return false;
  const associated = data.clubId === clubId || data.sessionClubs?.some(link => link.clubId === clubId && link.status === "ACCEPTED");
  if (!associated || !(await canReadClubGlobally(session, clubId))) return false;
  if (data.clubId && data.clubId !== clubId) {
    const host = await prisma.club.findUnique({ where: { id: data.clubId }, select: { isTutorial: true } });
    if (!host || host.isTutorial) return false;
  }
  return true;
}
