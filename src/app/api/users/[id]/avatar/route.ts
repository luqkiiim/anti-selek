import { sportingJson } from "@/lib/sportingResponse";
import { auth } from "@/lib/auth";
import { buildAvatarObjectKey, getAvatarFileSignatureValidationError, getAvatarUploadValidationError, isAvatarStorageConfigured, resolveAvatarUrl } from "@/lib/avatar";
import { cleanupSupersededAvatar, rollbackUploadedAvatar, uploadAvatarObject } from "@/lib/avatarStorage";
import { logError, safeErrorResponse } from "@/lib/errors";
import { ClubContractAliasConflictError, readAliasedSearchParam } from "@/lib/clubContractAliases";
import { prisma } from "@/lib/prisma";
import { isClubAdminRole } from "@/lib/clubRoles";
import { getSessionAccountId } from "@/lib/quickAccess";
import { nonretiredPlayer } from "@/lib/playerIdentity";
import { checkInvalidTargetRateLimit, invalidTargetResponse, rateLimit } from "@/lib/rateLimit";
import { admissionTransaction } from "@/lib/clubAdmissions";
import { AccountProfileSyncError, syncAccountProfile } from "@/lib/accountProfileSync";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

async function authorizedTarget(tx: Prisma.TransactionClient, input: { clubId: string; playerId: string; userId: string; isAdmin: boolean }) {
  const member = await tx.clubMember.findFirst({ where: { clubId: input.clubId, playerId: input.playerId, retiredByAdmissionEventId: null, player: nonretiredPlayer }, include: { player: { include: { clubMemberships: { select: { ownerUserId: true, retiredByAdmissionEventId: true } } } } } });
  if (!member) throw new AccountProfileSyncError("Player unavailable", 404);
  if (member.ownerUserId === input.userId) return { member, owned: true };
  // Administrators may manage placeholder photos, never another person's canonical photo.
  if (member.player.clubMemberships.some(link => link.ownerUserId !== null && link.retiredByAdmissionEventId === null)) throw new AccountProfileSyncError("Only the connected account can manage this photo", 403);
  const access = await tx.clubAccess.findUnique({ where: { clubId_userId: { clubId: input.clubId, userId: input.userId } } });
  if (!input.isAdmin && !(access?.status === "ACTIVE" && isClubAdminRole(access.role))) throw new AccountProfileSyncError("Not authorized", 403);
  return { member, owned: false };
}

async function mutate(request: Request, params: Promise<{ id: string }>, remove: boolean) {
  let uploadedAvatarKey: string | null = null;
  try {
    const limited = await rateLimit(request, `api:users:id:avatar:${remove ? "delete" : "post"}`, { limit: 10, windowMs: 60000 }); if (limited) return limited;
    const session = await auth(); const userId = getSessionAccountId(session);
    if (!userId) return sportingJson({ error: "Not authenticated" }, { status: 401 });
    const { id: playerId } = await params;
    if (!playerId) return sportingJson({ error: "Invalid request parameters" }, { status: 400 });
    const invalidLimit = await checkInvalidTargetRateLimit(request, "api:users:id:avatar"); if (invalidLimit) return invalidLimit;
    const clubId = readAliasedSearchParam(new URL(request.url).searchParams, "clubId", "communityId", "club identifier", { canonicalRoute: "/api/users/[id]/avatar", request, surface: "api" });
    if (!clubId) return sportingJson({ error: "Choose a club profile" }, { status: 400 });
    const input = { clubId, playerId, userId, isAdmin: !!session?.user.isAdmin };
    // Authenticate before uploading; ownership is rechecked under reservation before saving.
    const initial = await admissionTransaction(prisma, tx => authorizedTarget(tx, input));
    if (!remove) {
      if (!isAvatarStorageConfigured()) return sportingJson({ error: "Avatar storage is not configured" }, { status: 503 });
      const file = (await request.formData()).get("avatar");
      if (!(file instanceof File)) return sportingJson({ error: "Choose an image file to upload" }, { status: 400 });
      const error = getAvatarUploadValidationError({ mimeType: file.type, size: file.size }) ?? getAvatarFileSignatureValidationError({ mimeType: file.type, bytes: new Uint8Array(await file.slice(0, 16).arrayBuffer()) });
      if (error) return sportingJson({ error }, { status: 400 });
      uploadedAvatarKey = await uploadAvatarObject({ avatarPathname: buildAvatarObjectKey({ userId: initial.owned ? `accounts/${userId}` : playerId, mimeType: file.type as "image/jpeg" | "image/png" | "image/webp" }), body: file, contentType: file.type });
    }
    const key = uploadedAvatarKey;
    const previousKeys = await admissionTransaction(prisma, async tx => {
      const current = await authorizedTarget(tx, input);
      if (current.member.player.avatarKey !== initial.member.player.avatarKey || current.member.ownerUserId !== initial.member.ownerUserId || current.member.ownershipRevision !== initial.member.ownershipRevision) throw new AccountProfileSyncError("Your profile changed. Refresh and try again");
      if (current.owned) {
        const result = await syncAccountProfile(tx, { userId, changes: { avatarKey: key } });
        return result.previousAvatarKeys;
      }
      await tx.player.update({ where: { id: playerId }, data: { avatarKey: key } });
      return [current.member.player.avatarKey];
    });
    for (const previousAvatarKey of previousKeys) await cleanupSupersededAvatar({ previousAvatarKey, nextAvatarKey: key });
    return sportingJson({ avatarUrl: resolveAvatarUrl(key) });
  } catch (error) {
    await rollbackUploadedAvatar({ uploadedAvatarKey });
    if (error instanceof ClubContractAliasConflictError) return sportingJson({ error: error.message }, { status: 400 });
    if (error instanceof AccountProfileSyncError) {
      if (error.statusCode === 403 || error.statusCode === 404) return invalidTargetResponse(request, "api:users:id:avatar");
      return sportingJson({ error: error.message }, { status: error.statusCode });
    }
    logError("Manage avatar error", error); return safeErrorResponse();
  }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { return mutate(request, params, false); }
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) { return mutate(request, params, true); }
