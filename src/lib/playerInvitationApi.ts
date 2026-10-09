import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";
import { isQuickAccessSession } from "@/lib/quickAccess";
import { admissionTransaction, ClubAdmissionError } from "@/lib/clubAdmissions";
import { resolveAvatarUrl } from "@/lib/avatar";
import { activePlayerInvitation, continuationCookieName, exchangeInvitationSecret, invitationContext, managePlayerInvitation, PlayerInvitationError, redeemPlayerInvitation } from "@/lib/playerInvitations";
import { getInvitationRecoveryStatus, invitationAvailability, submitInvitationRecovery } from "@/lib/playerInvitationRecovery";
import { authorizedInvitationContext, confirmAuthorizedInvitation, createAuthorizedInvitation, identityOptions } from "@/lib/playerInvitationAuthorization";
import type { CreateAccessRestoreInvitationInput, CreateCorrectionInvitationInput, PlayerInvitationPurpose } from "@/types/playerRecovery";

const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const manageSchema = z.object({ action: z.enum(["CREATE", "REPLACE", "REVOKE"]), invitationId: idSchema.optional() }).strict();
const secretSchema = z.object({ secret: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
const confirmSchema = z.object({ confirm: z.literal(true) }).strict();
const authorizedConfirmSchema = z.object({
  confirm: z.literal(true),
  supersedeRecoveryRequest: z.object({ requestId: idSchema, revision: z.number().int().nonnegative() }).strict().optional(),
}).strict();
const recoverySchema = z.object({ idempotencyKey: z.string().min(1).max(100), note: z.string().max(1000).optional() }).strict();
const accessActionSchema = z.enum(["PRESERVE_ACTIVE", "GRANT_MEMBER", "RESTORE_MEMBER"]);
const correctionAuthorizationSchema = z.object({
  recipientAccountId: idSchema, sourcePlayerId: idSchema, sourceMemberId: idSchema,
  retireSourcePlayerId: idSchema, reason: z.string().trim().min(1).max(1000),
  authorizedAccessAction: accessActionSchema.optional(), restoreArchivedRoster: z.literal(false),
  replaceInvitationId: idSchema.optional(),
}).strict();
const accessRestoreAuthorizationSchema = z.object({
  recipientAccountId: idSchema, reason: z.string().trim().min(1).max(1000),
  authorizedAccessAction: accessActionSchema.optional(), restoreArchivedRoster: z.boolean(),
  replaceInvitationId: idSchema.optional(),
}).strict();
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
type IdentityContext = { params: Promise<{ id: string; playerId: string }> };
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
    const invite = await prisma.playerInvitation.findUnique({ where: { id: invitationId }, select: { purpose: true, status: true, expiresAt: true, revocationReason: true } });
    if (invite && invite.purpose !== "CLAIM") {
      const session = await auth();
      const userId = session?.user?.id && !isQuickAccessSession(session) ? session.user.id : null;
      return json(await authorizedInvitationContext(prisma, invitationId, handleFromCookie(request, invitationId), userId));
    }
    if (invite?.purpose === "CLAIM" && invitationAvailability(invite) !== "ACTIVE") {
      const availability = invitationAvailability(invite);
      return json({ purpose: "CLAIM", status: "UNAVAILABLE", invitationAvailability: availability, message: "This invitation is no longer available. You can still check your own pending request." });
    }
    try {
      const context = await invitationContext(prisma, invitationId, handleFromCookie(request, invitationId));
      const { avatarKey, ...player } = context.player;
      return json({ ...context, player: { ...player, avatarUrl: resolveAvatarUrl(avatarKey) } });
    } catch (error) {
      if (invite?.purpose === "CLAIM" && error instanceof PlayerInvitationError && error.code === "CONTINUATION_REQUIRED") {
        return json({ purpose: "CLAIM", status: "CONTINUATION_REQUIRED", invitationAvailability: "ACTIVE", message: error.message });
      }
      if (invite?.purpose === "CLAIM" && error instanceof PlayerInvitationError && error.code === "INVITATION_UNAVAILABLE") {
        return json({ purpose: "CLAIM", status: "UNAVAILABLE", invitationAvailability: "UNAVAILABLE", message: error.message });
      }
      throw error;
    }
  } catch (error) { return errorResponse(error); }
}

export async function identityOptionsGet(request: Request, { params }: IdentityContext) {
  try {
    const limited = await guard(request, "identity-options"); if (limited) return limited;
    const { id: clubId, playerId } = await params;
    if (!idSchema.safeParse(clubId).success || !idSchema.safeParse(playerId).success) return json({ error: "Invalid Player or club." }, 400);
    const purpose = new URL(request.url).searchParams.get("purpose");
    if (purpose !== "CORRECTION" && purpose !== "ACCESS_RESTORE") return json({ error: "Choose a valid identity action." }, 400);
    const issuerAccountId = await accountPrincipal();
    return json(await identityOptions(prisma, { clubId, targetPlayerId: playerId, issuerAccountId, purpose }));
  } catch (error) { return errorResponse(error); }
}

export async function correctionInvitationPost(request: Request, { params }: IdentityContext) {
  try {
    const limited = await guard(request, "correction-invitation", true); if (limited) return limited;
    const { id: clubId, playerId } = await params;
    const input = correctionAuthorizationSchema.safeParse(await request.json().catch(() => null));
    if (!input.success || !idSchema.safeParse(clubId).success || !idSchema.safeParse(playerId).success) return json({ error: "Invalid correction authorization." }, 400);
    const issuerAccountId = await accountPrincipal();
    return json(await admissionTransaction(prisma, tx => createAuthorizedInvitation(tx, "CORRECTION", { ...input.data, clubId, targetPlayerId: playerId, issuerAccountId } satisfies CreateCorrectionInvitationInput & { clubId: string; targetPlayerId: string; issuerAccountId: string })));
  } catch (error) { return errorResponse(error); }
}

export async function accessRestoreInvitationPost(request: Request, { params }: IdentityContext) {
  try {
    const limited = await guard(request, "access-restore-invitation", true); if (limited) return limited;
    const { id: clubId, playerId } = await params;
    const input = accessRestoreAuthorizationSchema.safeParse(await request.json().catch(() => null));
    if (!input.success || !idSchema.safeParse(clubId).success || !idSchema.safeParse(playerId).success) return json({ error: "Invalid access restore authorization." }, 400);
    const issuerAccountId = await accountPrincipal();
    return json(await admissionTransaction(prisma, tx => createAuthorizedInvitation(tx, "ACCESS_RESTORE", { ...input.data, clubId, targetPlayerId: playerId, issuerAccountId } satisfies CreateAccessRestoreInvitationInput & { clubId: string; targetPlayerId: string; issuerAccountId: string })));
  } catch (error) { return errorResponse(error); }
}

async function invitationConfirmFor(request: Request, { params }: InviteContext, purpose: Exclude<PlayerInvitationPurpose, "CLAIM">) {
  try {
    const limited = await guard(request, `confirm-${purpose.toLowerCase()}`, true); if (limited) return limited;
    const { invitationId } = await params;
    const input = authorizedConfirmSchema.safeParse(await request.json().catch(() => null));
    if (!input.success || !idSchema.safeParse(invitationId).success) return json({ error: "Confirm the authorized identity action before continuing." }, 400);
    const userId = await accountPrincipal();
    return json(await admissionTransaction(prisma, tx => confirmAuthorizedInvitation(tx, purpose, {
      invitationId, handle: handleFromCookie(request, invitationId), userId,
      supersedeRecoveryRequest: input.data.supersedeRecoveryRequest,
    })));
  } catch (error) { return errorResponse(error); }
}
export function invitationConfirmCorrectionPost(request: Request, context: InviteContext) { return invitationConfirmFor(request, context, "CORRECTION"); }
export function invitationConfirmAccessRestorePost(request: Request, context: InviteContext) { return invitationConfirmFor(request, context, "ACCESS_RESTORE"); }
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

export async function invitationRecoveryGet(request: Request, { params }: InviteContext) {
  try {
    const limited = await guard(request, "recovery-read"); if (limited) return limited;
    const { invitationId } = await params;
    if (!idSchema.safeParse(invitationId).success) return json({ error: "Invalid invitation." }, 400);
    const userId = await accountPrincipal();
    const purpose = await prisma.playerInvitation.findUnique({ where: { id: invitationId }, select: { purpose: true } });
    if (purpose && purpose.purpose !== "CLAIM") return json({ error: "This invitation uses its purpose-specific confirmation flow.", code: "PURPOSE_MISMATCH" }, 403);
    return json(await getInvitationRecoveryStatus(prisma, invitationId, userId));
  } catch (error) { return errorResponse(error); }
}
export async function invitationRecoveryPost(request: Request, { params }: InviteContext) {
  try {
    const limited = await guard(request, "recovery-write", true); if (limited) return limited;
    const { invitationId } = await params;
    const input = recoverySchema.safeParse(await request.json().catch(() => null));
    if (!input.success || !idSchema.safeParse(invitationId).success) return json({ error: "Invalid recovery request." }, 400);
    const userId = await accountPrincipal();
    const purpose = await prisma.playerInvitation.findUnique({ where: { id: invitationId }, select: { purpose: true } });
    if (purpose && purpose.purpose !== "CLAIM") return json({ error: "This invitation uses its purpose-specific confirmation flow.", code: "PURPOSE_MISMATCH" }, 403);
    return json(await admissionTransaction(prisma, tx => submitInvitationRecovery(tx, { ...input.data, invitationId, userId, handle: handleFromCookie(request, invitationId) })));
  } catch (error) { return errorResponse(error); }
}
