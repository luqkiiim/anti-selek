import type { Prisma, PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { joinRequestAccess } from "@/lib/clubJoinRequests";
import { getClubAdminAccess } from "@/lib/clubAdminPermissions";
import { getOwnedClubPlayer } from "@/lib/playerIdentity";
import { ClubPlayerOwnershipError } from "@/lib/clubPlayerOwnership";
import { admissionInclude, admissionTransaction, ClubAdmissionError, reviewClubAdmission, submitClubAdmission } from "@/lib/clubAdmissions";
import { resolveAvatarUrl } from "@/lib/avatar";
import { normalizeClaimName } from "@/lib/clubClaimRules";
import { safeErrorResponse } from "@/lib/errors";
import { hasClubEntry, readClubEntryProof, sameOriginJsonGuard, clubEntryProofExpiresAt, ClubEntryUnavailableError } from "@/lib/clubJoinEntry";
import { z } from "zod";

const submitSchema = z.object({
  clubId: z.string().min(1).max(100), kind: z.enum(["EXISTING_PLAYER", "NEW_PLAYER"]),
  requestedPlayerId: z.string().min(1).max(100).nullable().optional(), proposedPlayerName: z.string().trim().min(1).max(100).nullable().optional(),
  proposedGender: z.enum(["MALE", "FEMALE"]).nullable().optional(), note: z.string().max(1000).nullable().optional(), idempotencyKey: z.string().min(1).max(100).optional(),
}).strict().refine(input => input.kind === "NEW_PLAYER" || !!input.requestedPlayerId, { message: "Select a Player" });
const reviewSchema = z.object({ action: z.enum(["APPROVE", "REJECT", "CANCEL"]), playerId: z.string().min(1).max(100).nullable().optional(), asNew: z.boolean().optional(), revision: z.number().int().nonnegative().optional(), reason: z.string().max(1000).optional(), confirmRestoreAccess: z.boolean().optional(), retireEmptyPlayerId: z.string().min(1).max(100).optional() }).strict();

export function admissionError(error: unknown) {
  if (error instanceof ClubEntryUnavailableError) return privateJson({ error: error.message, code: error.code }, error.statusCode);
  if (error instanceof ClubAdmissionError || error instanceof ClubPlayerOwnershipError) {
    const code = "code" in error ? error.code : undefined;
    return NextResponse.json({ error: error.message, ...(typeof code === "string" ? { code } : {}) }, { status: error.statusCode, headers: { "Cache-Control": "no-store, private" } });
  }
  console.error("Club admission operation failed", { code: "ADMISSION_INTERNAL_ERROR" });
  const response = safeErrorResponse(); response.headers.set("Cache-Control", "no-store, private"); return response;
}

function privateJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
}

function requestStatusSummary(request: {
  id: string;
  clubId: string;
  kind: string;
  status: string;
  revision: number;
  createdAt: Date;
  reviewedAt: Date | null;
}) {
  return {
    id: request.id,
    clubId: request.clubId,
    kind: request.kind,
    status: request.status,
    revision: request.revision,
    createdAt: request.createdAt,
    reviewedAt: request.reviewedAt,
  };
}

export async function submitAdmissionApi(request: Request, clubId?: string, legacyClaim = false) {
  try {
    const guard = sameOriginJsonGuard(request); if (guard) return guard;
    const access = await joinRequestAccess(request); if (access.response) return access.response;
    const account = await prisma.user.findUnique({ where: { id: access.userId }, select: { isActive: true } });
    if (!account?.isActive) return privateJson({ error: "An active account is required" }, 403);
    let body = await request.json().catch(() => null);
    if (legacyClaim && body && typeof body === "object") body = { clubId, kind: "EXISTING_PLAYER", requestedPlayerId: body.targetPlayerId ?? body.targetUserId, note: body.note };
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Choose an existing Player or enter a new Player's name and gender" }, { status: 400 });
    const entryProof = await readClubEntryProof(request, parsed.data.clubId);
    const result = await admissionTransaction(prisma, tx => submitClubAdmission(tx, { ...parsed.data, requesterUserId: access.userId }, entryProof));
    return privateJson(result);
  } catch (error) { return admissionError(error); }
}

export async function reviewAdmissionApi(request: Request, { params }: { params: Promise<{ id: string; requestId: string }> }) {
  try {
    const { id, requestId } = await params;
    const access = await joinRequestAccess(request); if (access.response) return access.response;
    const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid review action" }, { status: 400 });
    const destination = new URL(request.url); destination.host = request.headers.get("host") ?? destination.host;
    const requestOriginValid = request.headers.get("origin") === destination.origin && !!request.headers.get("content-type")?.startsWith("application/json");
    const result = await admissionTransaction(prisma, tx => reviewClubAdmission(tx, { ...parsed.data, clubId: id, requestId, reviewerUserId: access.userId, isGlobalAdmin: access.isGlobalAdmin, requestOriginValid }));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) { return admissionError(error); }
}

async function playerSummary(db: Prisma.TransactionClient | PrismaClient, clubId: string, player: { id: string; name: string; avatarKey: string | null }, elo: number) {
  const where = { status: "COMPLETED", OR: [{ team1Player1Id: player.id }, { team1Player2Id: player.id }, { team2Player1Id: player.id }, { team2Player2Id: player.id }], session: { isTest: false, OR: [{ clubId }, { sessionClubs: { some: { clubId, status: "ACCEPTED" } } }] } };
  const [matchesPlayed, last] = await Promise.all([db.match.count({ where }), db.match.findFirst({ where, orderBy: { completedAt: "desc" }, select: { completedAt: true } })]);
  return { id: player.id, name: player.name, avatarUrl: resolveAvatarUrl(player.avatarKey), elo, matchesPlayed, lastPlayedAt: last?.completedAt ?? null };
}

export async function admissionDiscoveryApi(request: Request, onlyClubId?: string) {
  try {
    const access = await joinRequestAccess(request); if (access.response) return access.response;
    return await prisma.$transaction(async tx => {
      const account = await tx.user.findUnique({ where: { id: access.userId } });
      if (!account?.isActive) return privateJson({ error: "An active account is required" }, 403);
      const url = new URL(request.url); const clubId = onlyClubId ?? url.searchParams.get("clubId");
      if (!clubId) {
        const summaries = await tx.clubAdmissionRequest.findMany({ where: { requesterUserId: access.userId },
          select: { id: true, clubId: true, kind: true, status: true, revision: true, createdAt: true, reviewedAt: true,
            club: { select: { id: true, isPasswordProtected: true, passwordHash: true } } }, orderBy: { createdAt: "desc" }, take: 50 });
        const visibleRequestIds = (await Promise.all(summaries.map(async entry => await hasClubEntry(tx, entry.club, account, await readClubEntryProof(request, entry.clubId)) ? entry.id : null))).filter((id): id is string => id !== null);
        const visibleRequests = visibleRequestIds.length ? await tx.clubAdmissionRequest.findMany({ where: { id: { in: visibleRequestIds } }, include: admissionInclude }) : [];
        const visibleById = new Map(visibleRequests.map(entry => [entry.id, entry]));
        return privateJson({ requests: summaries.map(entry => visibleById.get(entry.id) ?? requestStatusSummary(entry)) });
      }
      if (clubId.length > 100) return privateJson({ error: "Invalid club" }, 400);
      const club = await tx.club.findUnique({ where: { id: clubId }, select: { id: true, name: true, avatarKey: true, allowJoinRequests: true, isTutorial: true, isPasswordProtected: true, passwordHash: true } });
      if (!club || club.isTutorial) throw new ClubAdmissionError("Club not found", 404);
      const entryProof = await readClubEntryProof(request, clubId);
      const requiresJoinCode = !await hasClubEntry(tx, club, account, entryProof);
      const passwordProof = { status: !club.isPasswordProtected ? "NOT_REQUIRED" : requiresJoinCode ? "PASSWORD_REQUIRED" : "VERIFIED", expiresAt: requiresJoinCode ? null : clubEntryProofExpiresAt(entryProof) };
      const requests = requiresJoinCode ? await tx.clubAdmissionRequest.findMany({ where: { requesterUserId: access.userId, clubId }, select: { id: true, clubId: true, kind: true, status: true, revision: true, createdAt: true, reviewedAt: true }, orderBy: { createdAt: "desc" }, take: 50 }) : await tx.clubAdmissionRequest.findMany({ where: { requesterUserId: access.userId, clubId }, include: admissionInclude, orderBy: { createdAt: "desc" }, take: 50 });
      const [clubAccess, membership] = await Promise.all([
        tx.clubAccess.findUnique({ where: { clubId_userId: { clubId, userId: access.userId } } }),
        getOwnedClubPlayer(tx, { clubId, userId: access.userId }),
      ]);
      const identityReviewRequired = !!membership && (!!membership.archivedAt || !membership.player.isActive);
      const activeMembership = membership && !membership.archivedAt && membership.player.isActive ? { playerId: membership.playerId } : null;
      const clubSummary = { id: club.id, name: club.name, avatarUrl: resolveAvatarUrl(club.avatarKey), isPasswordProtected: club.isPasswordProtected, allowJoinRequests: club.allowJoinRequests };
      const accountAccess = clubAccess ? { role: clubAccess.role, status: clubAccess.status } : null;
      const ownedPlayers = membership?.player.isActive ? [{ id: membership.playerId, name: membership.player.name }] : [];
      const adminAccess = await getClubAdminAccess(tx, { clubId, userId: access.userId, isGlobalAdmin: access.isGlobalAdmin });
      if (requiresJoinCode || (!club.allowJoinRequests && !adminAccess?.canAdmin && clubAccess?.status !== "ACTIVE")) return privateJson({ club: clubSummary, requiresJoinCode, passwordProof, identityReviewRequired, players: [], ownedPlayers, requests, membership: activeMembership, access: accountAccess });
      const q = (url.searchParams.get("q") ?? "").trim();
      if (q.length > 64) throw new ClubAdmissionError("Search must be 64 characters or fewer");
      const members = await tx.clubMember.findMany({ where: { clubId, archivedAt: null, retiredByAdmissionEventId: null, ownerUserId: null, player: { isActive: true, ...(q ? { name: { contains: q } } : {}), clubMemberships: { none: { retiredByAdmissionEventId: null, ownerUserId: { not: null, notIn: [access.userId] } } } } }, include: { player: true }, orderBy: { player: { name: "asc" } }, take: 30 });
      const players = await Promise.all(members.map(m => playerSummary(tx, clubId, m.player, m.elo)));
      return privateJson({ club: clubSummary, requiresJoinCode, passwordProof, identityReviewRequired, players, ownedPlayers, requests, membership: activeMembership, access: accountAccess });
    });
  } catch (error) { return admissionError(error); }
}

export async function adminAdmissionListApi(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: clubId } = await params; const access = await joinRequestAccess(request, clubId); if (access.response) return access.response;
    const [club, entries, members] = await Promise.all([
      prisma.club.findUnique({ where: { id: clubId }, select: { allowJoinRequests: true } }),
      prisma.clubAdmissionRequest.findMany({ where: { clubId, status: "PENDING" }, include: { ...admissionInclude, events: { orderBy: { revision: "asc" } } }, orderBy: { createdAt: "asc" } }),
      prisma.clubMember.findMany({ where: { clubId, archivedAt: null, retiredByAdmissionEventId: null, ownerUserId: null, player: { isActive: true } }, include: { player: true }, take: 100 }),
    ]);
    const requests = await Promise.all(entries.map(async entry => {
      const member = entry.requestedPlayerId ? await prisma.clubMember.findUnique({ where: { clubId_playerId: { clubId, playerId: entry.requestedPlayerId } } }) : null;
      const summary = entry.requestedPlayer && member ? await playerSummary(prisma, clubId, entry.requestedPlayer, member.elo) : null;
      const owned = await prisma.clubMember.findMany({ where: { clubId, ownerUserId: entry.requesterUserId, retiredByAdmissionEventId: null }, include: { player: { select: { id: true, name: true } } } });
      const ownedConflict = owned.find(m => m.playerId !== entry.requestedPlayerId);
      const sharedConflict = entry.requestedPlayerId ? await prisma.clubMember.findFirst({ where: { playerId: entry.requestedPlayerId, retiredByAdmissionEventId: null, ownerUserId: { not: null, notIn: [entry.requesterUserId] } }, select: { id: true } }) : null;
      const conflict = (member?.ownerUserId && member.ownerUserId !== entry.requesterUserId) || sharedConflict ? "Player already belongs to another account" : ownedConflict ? "Remove and disconnect the account's other profile in this club first." : entry.kind === "OWNED_PLAYER" || entry.originInvitationId ? "This old request is no longer supported. Send a normal claim invitation or request a profile in this club." : null;
      const proposedName = entry.proposedPlayerName ?? entry.requester.name;
      return { ...entry, recoveryReviewAuthorized: false, name: entry.requester.name, requesterName: entry.requester.name, requesterEmail: entry.requester.email, targetName: entry.requestedPlayer?.name ?? null, history: summary, currentRating: member?.elo ?? null, conflict, ownedPlayers: [], possibleDuplicates: members.filter(m => normalizeClaimName(m.player.name) === normalizeClaimName(proposedName)).map(m => ({ id: m.playerId, name: m.player.name, elo: m.elo })) };
    }));
    return NextResponse.json({ allowJoinRequests: club?.allowJoinRequests ?? false, requests, candidates: members.map(m => ({ id: m.playerId, name: m.player.name, elo: m.elo })) }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) { return admissionError(error); }
}
