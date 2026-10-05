import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { isQuickAccessSession } from "@/lib/quickAccess";
import { admissionTransaction, ClubAdmissionError } from "@/lib/clubAdmissions";
import { resolveAvatarUrl } from "@/lib/avatar";
import { activePlayerInvitation, continuationCookieName, exchangeInvitationSecret, invitationContext, managePlayerInvitation, PlayerInvitationError, redeemPlayerInvitation } from "@/lib/playerInvitations";

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const manageSchema = z.object({ action: z.enum(["CREATE", "REPLACE", "REVOKE"]), invitationId: idSchema.optional() }).strict();
const secretSchema = z.object({ secret: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
const confirmSchema = z.object({ confirm: z.literal(true) }).strict();
const privacyHeaders = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: privacyHeaders });
function errorResponse(error: unknown) {
  if (error instanceof PlayerInvitationError) return json({ error: error.message, code: error.code }, error.statusCode);
  if (error instanceof ClubAdmissionError) return json({ error: error.message, code: "IDENTITY_CONFLICT" }, error.statusCode);
  // Never log errors/Prisma arguments, request bodies, URLs or cookie capabilities.
  console.error("Player invitation operation failed", { code: "INVITATION_INTERNAL_ERROR" });
  return json({ error: "Unable to complete the invitation operation. Please try again." }, 500);
}
async function guard(request: Request, scope: string, mutation = false) {
  const limited = await rateLimit(request, `api:player-invitations:${scope}`, { limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  // Next's internal request URL can use localhost behind its dev server/proxy.
  // Host is the browser's destination authority; do not accept X-Forwarded-Host.
  const destination = new URL(request.url);
  destination.host = request.headers.get("host") ?? destination.host;
  if (mutation && (request.headers.get("origin") !== destination.origin || !request.headers.get("content-type")?.startsWith("application/json"))) return json({ error: "Same-origin JSON request required." }, 403);
}
async function accountPrincipal() {
  const session = await auth();
  if (!session?.user?.id) throw new PlayerInvitationError("Sign in with an account to continue.", "ACCOUNT_REQUIRED", 401);
  if (isQuickAccessSession(session)) throw new PlayerInvitationError("Quick access cannot claim or invite Players. Sign in with an account.", "ACCOUNT_REQUIRED", 403);
  return session.user.id;
}
function handleFromCookie(request: Request, id: string) {
  return new NextRequest(request.url, { headers: request.headers }).cookies.get(continuationCookieName(id))?.value;
}
type AdminContext = { params: Promise<{ id: string; userId: string }> };
type InviteContext = { params: Promise<{ invitationId: string }> };
export async function adminInvitationGet(request: Request, { params }: AdminContext) {
  try {
    const limited = await guard(request, "admin-read"); if (limited) return limited;
    const { id: clubId, userId: playerId } = await params;
    if (!idSchema.safeParse(clubId).success || !idSchema.safeParse(playerId).success) return json({ error: "Invalid Player or club." }, 400);
    const userId = await accountPrincipal();
    return json(await activePlayerInvitation(prisma, clubId, playerId, userId));
  } catch (error) { return errorResponse(error); }
}
export async function adminInvitationPost(request: Request, { params }: AdminContext) {
  try {
    const limited = await guard(request, "admin-write", true); if (limited) return limited;
    const { id: clubId, userId: playerId } = await params;
    const input = manageSchema.safeParse(await request.json().catch(() => null));
    if (!input.success || !idSchema.safeParse(clubId).success || !idSchema.safeParse(playerId).success) return json({ error: "Invalid invitation action." }, 400);
    const userId = await accountPrincipal();
    return json(await admissionTransaction(prisma, tx => managePlayerInvitation(tx, { ...input.data, clubId, playerId, userId })));
  } catch (error) { return errorResponse(error); }
}
export async function invitationExchangePost(request: Request, { params }: InviteContext) {
  try {
    const limited = await guard(request, "exchange", true); if (limited) return limited;
    const { invitationId } = await params;
    const input = secretSchema.safeParse(await request.json().catch(() => null));
    if (!input.success || !idSchema.safeParse(invitationId).success) return json({ error: "Invalid invitation." }, 400);
    const { handle, expiresAt } = await admissionTransaction(prisma, tx => exchangeInvitationSecret(tx, invitationId, input.data.secret));
    const response = json({ ready: true });
    response.cookies.set(continuationCookieName(invitationId), handle, { httpOnly: true, secure: process.env.NODE_ENV === "production" || new URL(request.url).protocol === "https:", sameSite: "lax", path: "/", expires: expiresAt });
    return response;
  } catch (error) { return errorResponse(error); }
}
export async function invitationContextGet(request: Request, { params }: InviteContext) {
  try {
    const limited = await guard(request, "context"); if (limited) return limited;
    const { invitationId } = await params;
    if (!idSchema.safeParse(invitationId).success) return json({ error: "Invalid invitation." }, 400);
    const context = await invitationContext(prisma, invitationId, handleFromCookie(request, invitationId));
    const { avatarKey, ...player } = context.player;
    return json({ ...context, player: { ...player, avatarUrl: resolveAvatarUrl(avatarKey) } });
  } catch (error) { return errorResponse(error); }
}
export async function invitationRedeemPost(request: Request, { params }: InviteContext) {
  try {
    const limited = await guard(request, "redeem", true); if (limited) return limited;
    const { invitationId } = await params;
    const input = confirmSchema.safeParse(await request.json().catch(() => null));
    if (!input.success || !idSchema.safeParse(invitationId).success) return json({ error: "Confirm the profile before claiming." }, 400);
    const userId = await accountPrincipal();
    return json(await admissionTransaction(prisma, tx => redeemPlayerInvitation(tx, invitationId, handleFromCookie(request, invitationId), userId)));
  } catch (error) { return errorResponse(error); }
}
