import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { joinRequestAccess } from "@/lib/clubJoinRequests";
import { getClubAdminAccess } from "@/lib/clubAdminPermissions";
import { getOwnedClubPlayer, nonretiredPlayer } from "@/lib/playerIdentity";
import { admissionInclude, admissionTransaction, ClubAdmissionError, reviewClubAdmission, submitClubAdmission } from "@/lib/clubAdmissions";
import { resolveAvatarUrl } from "@/lib/avatar";
import { normalizeClaimName } from "@/lib/clubClaimRules";
import { logError, safeErrorResponse } from "@/lib/errors";
import { clubJoinProofState, ClubJoinProofRequiredError, ClubJoinProofUnavailableError, verifyClubJoinProof } from "@/lib/clubJoinProof";
import { z } from "zod";

const submitSchema = z.object({
  clubId: z.string().min(1).max(100), kind: z.enum(["EXISTING_PLAYER", "NEW_PLAYER", "OWNED_PLAYER"]),
  requestedPlayerId: z.string().min(1).max(100).nullable().optional(), proposedPlayerName: z.string().trim().min(1).max(100).nullable().optional(),
  proposedGender: z.enum(["MALE", "FEMALE"]).nullable().optional(), note: z.string().max(1000).nullable().optional(), idempotencyKey: z.string().min(1).max(100).optional(),
}).strict().refine(input => input.kind === "NEW_PLAYER" || !!input.requestedPlayerId, { message: "Select a Player" });
const reviewSchema = z.object({ action: z.enum(["APPROVE", "REJECT", "CANCEL"]), playerId: z.string().min(1).max(100).nullable().optional(), asNew: z.boolean().optional(), revision: z.number().int().nonnegative().optional(), reason: z.string().max(1000).optional(), confirmRestoreAccess: z.boolean().optional(), retireEmptyPlayerId: z.string().min(1).max(100).optional() }).strict();

export function admissionError(error: unknown) {
  if (error instanceof ClubJoinProofUnavailableError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode, headers: { "Cache-Control": "no-store, private" } });
  }
  if (error instanceof ClubJoinProofRequiredError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode, headers: { "Cache-Control": "no-store, private" } });
  }
  if (error instanceof ClubAdmissionError) {
    const code = "code" in error ? error.code : undefined;
    return NextResponse.json({ error: error.message, ...(typeof code === "string" ? { code } : {}) }, { status: error.statusCode, headers: { "Cache-Control": "no-store, private" } });
  }
  logError("Club admission", error); return safeErrorResponse();
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
    const access = await joinRequestAccess(request); if (access.response) return access.response;
    const account = await prisma.user.findUnique({ where: { id: access.userId }, select: { isActive: true } });
    if (!account?.isActive) return privateJson({ error: "An active account is required" }, 403);
    let body = await request.json().catch(() => null);
    if (legacyClaim && body && typeof body === "object") body = { clubId, kind: "EXISTING_PLAYER", requestedPlayerId: body.targetPlayerId ?? body.targetUserId, note: body.note };
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Choose an existing Player or enter a new Player's name and gender" }, { status: 400 });
    const destinationClubId = clubId ?? parsed.data.clubId;
    const result = await admissionTransaction(prisma, async tx => {
      const club = await tx.club.findUnique({ where: { id: destinationClubId }, select: { id: true, isTutorial: true, isPasswordProtected: true, passwordHash: true } });
      if (club && !club.isTutorial && club.isPasswordProtected && !verifyClubJoinProof(request, {
        userId: access.userId,
        clubId: club.id,
        passwordProtected: club.isPasswordProtected,
        passwordHash: club.passwordHash,
      })) throw new ClubJoinProofRequiredError();
      return submitClubAdmission(tx, { ...parsed.data, requesterUserId: access.userId });
    });
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

async function playerSummary(clubId: string, player: { id: string; name: string; avatarKey: string | null }, elo: number) {
  const where = { status: "COMPLETED", OR: [{ team1Player1Id: player.id }, { team1Player2Id: player.id }, { team2Player1Id: player.id }, { team2Player2Id: player.id }], session: { isTest: false, OR: [{ clubId }, { sessionClubs: { some: { clubId, status: "ACCEPTED" } } }] } };
  const [matchesPlayed, last] = await Promise.all([prisma.match.count({ where }), prisma.match.findFirst({ where, orderBy: { completedAt: "desc" }, select: { completedAt: true } })]);
  return { id: player.id, name: player.name, avatarUrl: resolveAvatarUrl(player.avatarKey), elo, matchesPlayed, lastPlayedAt: last?.completedAt ?? null };
}

export async function admissionDiscoveryApi(request: Request, onlyClubId?: string) {
  try {
    const access = await joinRequestAccess(request); if (access.response) return access.response;
    const account = await prisma.user.findUnique({ where: { id: access.userId }, select: { isActive: true } });
    if (!account?.isActive) return privateJson({ error: "An active account is required" }, 403);
    const url = new URL(request.url); const clubId = onlyClubId ?? url.searchParams.get("clubId");
    if (!clubId) {
      const summaries = await prisma.clubAdmissionRequest.findMany({
        where: { requesterUserId: access.userId },
        select: {
          id: true, clubId: true, kind: true, status: true, revision: true, createdAt: true, reviewedAt: true,
          club: { select: { id: true, isPasswordProtected: true, passwordHash: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      const visibleRequestIds = summaries.filter(entry => !entry.club.isPasswordProtected ||
        clubJoinProofState(request, {
          userId: access.userId,
          clubId: entry.club.id,
          passwordProtected: entry.club.isPasswordProtected,
          passwordHash: entry.club.passwordHash,
        }).status !== "PASSWORD_REQUIRED").map(entry => entry.id);
      const visibleRequests = visibleRequestIds.length
        ? await prisma.clubAdmissionRequest.findMany({ where: { id: { in: visibleRequestIds } }, include: admissionInclude })
        : [];
      const visibleById = new Map(visibleRequests.map(entry => [entry.id, entry]));
      const requests = summaries.map(entry => visibleById.get(entry.id) ?? requestStatusSummary(entry));
      return privateJson({ requests });
    }
    if (clubId.length > 100) return privateJson({ error: "Invalid club" }, 400);
    const club = await prisma.club.findUnique({ where: { id: clubId }, select: { id: true, name: true, allowJoinRequests: true, isTutorial: true, isPasswordProtected: true, passwordHash: true } });
    if (!club || club.isTutorial) throw new ClubAdmissionError("Club not found", 404);
    const passwordProof = clubJoinProofState(request, {
      userId: access.userId,
      clubId: club.id,
      passwordProtected: club.isPasswordProtected,
      passwordHash: club.passwordHash,
    });
    // NEW_PLAYER approval is blocked by any nonretired identity owned by this
    // account, even if that Player is inactive and therefore not selectable.
    // Return only a boolean so the UI can route the user to admin review without
    // disclosing an inactive profile as a reusable choice.
    const identityReviewRequired = !!await prisma.player.findFirst({
      where: { ownerUserId: access.userId, isActive: false, ...nonretiredPlayer },
      select: { id: true },
    });
    const requests = passwordProof.status === "PASSWORD_REQUIRED"
      ? await prisma.clubAdmissionRequest.findMany({
          where: { requesterUserId: access.userId, clubId },
          select: { id: true, clubId: true, kind: true, status: true, revision: true, createdAt: true, reviewedAt: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : await prisma.clubAdmissionRequest.findMany({ where: { requesterUserId: access.userId, clubId }, include: admissionInclude, orderBy: { createdAt: "desc" }, take: 50 });
    const [clubAccess, membership] = await Promise.all([
      prisma.clubAccess.findUnique({ where: { clubId_userId: { clubId, userId: access.userId } } }),
      getOwnedClubPlayer(prisma, { clubId, userId: access.userId }),
    ]);
    // Retained ownership still blocks duplicate identities, but an archived roster is not active admission.
    const activeMembership = membership && !membership.archivedAt && membership.player.isActive ? { playerId: membership.playerId } : null;
    const clubSummary = { id: club.id, name: club.name, allowJoinRequests: club.allowJoinRequests };
    const accountAccess = clubAccess ? { role: clubAccess.role, status: clubAccess.status } : null;
    if (passwordProof.status === "PASSWORD_REQUIRED") {
      return privateJson({ club: clubSummary, passwordProof, identityReviewRequired, players: [], ownedPlayers: [], requests, membership: activeMembership, access: accountAccess });
    }
    const adminAccess = await getClubAdminAccess(prisma, { clubId, userId: access.userId, isGlobalAdmin: access.isGlobalAdmin });
    if (!club.allowJoinRequests && !adminAccess?.canAdmin && clubAccess?.status !== "ACTIVE") {
      // The requester can still inspect their request status after the club disables admissions.
      const ownedPlayers = await prisma.player.findMany({ where: { ownerUserId: access.userId, isActive: true }, select: { id: true, name: true }, take: 50 });
      return privateJson({ club: { ...clubSummary, allowJoinRequests: false }, passwordProof, identityReviewRequired, players: [], ownedPlayers, requests, membership: activeMembership, access: accountAccess });
    }
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length > 64) throw new ClubAdmissionError("Search must be 64 characters or fewer");
    const [ownedPlayers, members] = await Promise.all([
      prisma.player.findMany({ where: { ownerUserId: access.userId, isActive: true }, select: { id: true, name: true }, take: 50 }),
      prisma.clubMember.findMany({ where: { clubId, archivedAt: null, player: { ownerUserId: null, isActive: true, ...(q ? { name: { contains: q } } : {}) } }, include: { player: true }, orderBy: { player: { name: "asc" } }, take: 30 }),
    ]);
    const players = await Promise.all(members.map(m => playerSummary(clubId, m.player, m.elo)));
    return privateJson({ club: clubSummary, passwordProof, identityReviewRequired, players, ownedPlayers, requests, membership: activeMembership, access: accountAccess });
  } catch (error) { return admissionError(error); }
}

export async function adminAdmissionListApi(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: clubId } = await params; const access = await joinRequestAccess(request, clubId); if (access.response) return access.response;
    const [club, entries, members] = await Promise.all([
      prisma.club.findUnique({ where: { id: clubId }, select: { allowJoinRequests: true } }),
      prisma.clubAdmissionRequest.findMany({ where: { clubId, status: "PENDING" }, include: { ...admissionInclude, events: { orderBy: { revision: "asc" } } }, orderBy: { createdAt: "asc" } }),
      prisma.clubMember.findMany({ where: { clubId, archivedAt: null, player: { ownerUserId: null, isActive: true } }, include: { player: true }, take: 100 }),
    ]);
    // The club page can display global administrators as ADMIN. Recovery controls
    // must instead reflect current local authority and active account status.
    const [reviewer, reviewerAccess] = entries.some(entry => entry.originInvitationId) ? await Promise.all([
      prisma.user.findUnique({ where: { id: access.userId }, select: { isActive: true } }),
      prisma.clubAccess.findUnique({ where: { clubId_userId: { clubId, userId: access.userId } } }),
    ]) : [null, null];
    const recoveryReviewAuthorized = !!reviewer?.isActive && reviewerAccess?.status === "ACTIVE" && ["ADMIN", "OWNER"].includes(reviewerAccess.role);
    const requests = await Promise.all(entries.map(async entry => {
      const member = entry.requestedPlayerId ? await prisma.clubMember.findUnique({ where: { clubId_playerId: { clubId, playerId: entry.requestedPlayerId } } }) : null;
      const summary = entry.requestedPlayer && member ? await playerSummary(clubId, entry.requestedPlayer, member.elo) : null;
      const owned = await prisma.player.findMany({ where: { ownerUserId: entry.requesterUserId, ...nonretiredPlayer }, select: { id: true, name: true, clubMemberships: { select: { clubId: true } } } });
      const targetClubs = entry.requestedPlayerId ? await prisma.clubMember.findMany({ where: { playerId: entry.requestedPlayerId }, select: { clubId: true } }) : [];
      const ownedConflict = owned.find(p => p.id !== entry.requestedPlayerId && p.clubMemberships.some(m => m.clubId === clubId || targetClubs.some(t => t.clubId === m.clubId)));
      const conflict = entry.requestedPlayer?.ownerUserId && entry.requestedPlayer.ownerUserId !== entry.requesterUserId ? "Player already belongs to another account" : ownedConflict ? "Account already owns another Player in one of this Player's clubs. Merging is unavailable." : null;
      const proposedName = entry.proposedPlayerName ?? entry.requester.name;
      const recovery = entry.originInvitationId ? await (await import("./playerInvitationRecovery")).recoveryEligibility(prisma, entry) : undefined;
      return { ...entry, ...(recovery ? { recovery, recoveryReviewAuthorized } : {}), name: entry.requester.name, requesterName: entry.requester.name, requesterEmail: entry.requester.email, targetName: entry.requestedPlayer?.name ?? null, history: summary, currentRating: member?.elo ?? null, conflict, ownedPlayers: owned.map(p => ({ id: p.id, name: p.name })), possibleDuplicates: members.filter(m => normalizeClaimName(m.player.name) === normalizeClaimName(proposedName)).map(m => ({ id: m.playerId, name: m.player.name, elo: m.elo })) };
    }));
    return NextResponse.json({ allowJoinRequests: club?.allowJoinRequests ?? false, requests, candidates: members.map(m => ({ id: m.playerId, name: m.player.name, elo: m.elo })) }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) { return admissionError(error); }
}
