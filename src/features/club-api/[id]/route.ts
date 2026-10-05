import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { serializeAvatarEntity } from "@/lib/avatar";
import { applyClubPulseNewsLikes, buildClubPulse } from "@/lib/clubPulse";
import { getClubStatUserResolver, getOfflineIdentityInfoByUserId } from "@/lib/offlineIdentities";
import { buildClubLeaderboardRankMovements } from "@/lib/profileClubRank";
import { prisma } from "@/lib/prisma";
import { getClubRoster } from "@/lib/clubRoster";
import { withLegacySportingAliases } from "@/lib/sportingIdentity";
import { listSessionsForClub } from "@/app/api/sessions/listSessionsService";
import { logAuditEvent } from "@/lib/serverAudit";
import { logError, safeErrorResponse } from "@/lib/errors";
import { withLegacyClubAliases } from "@/lib/clubContractAliases";
import { deleteTutorialPlayground, getTutorialClubDisplayName } from "@/lib/tutorialPlayground";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";
import { canQuickAccessClub, getQuickAccessDeniedMessage, isQuickAccessSession, normalizeNameLookupKey } from "@/lib/quickAccess";
import { ClubRole } from "@/types/enums";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const limited = await rateLimit(request, "api:communities:id:get", { limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    const { id } = await params;
    if (!canQuickAccessClub(session, id)) return invalidTargetResponse(request, "api:communities:id");
    const quick = isQuickAccessSession(session);
    const actorId = session.user.id;
    const [account, access, club, viewerMembership] = await Promise.all([
      quick ? Promise.resolve(null) : prisma.user.findUnique({ where: { id: actorId } }),
      quick ? Promise.resolve(null) : prisma.clubAccess.findUnique({ where: { clubId_userId: { clubId: id, userId: actorId } } }),
      prisma.club.findUnique({ where: { id }, include: { _count: { select: { members: true, sessions: true } } } }),
      prisma.clubMember.findFirst({ where: { clubId: id, archivedAt: null, ...(quick ? { playerId: session.user.guestPlayerId ?? "" } : { ownerUserId: actorId }) }, include: { player: true } }),
    ]);
    if (!club || (!quick && !account) || (club.isTutorial && club.tutorialOwnerId !== actorId)) return invalidTargetResponse(request, "api:communities:id");
    const isOwner = !quick && club.createdById === actorId && access?.status === "ACTIVE" && ["ADMIN", "OWNER"].includes(access.role);
    const canAdmin = !quick && (!!session.user.isAdmin || isOwner || (access?.status === "ACTIVE" && ["ADMIN", "OWNER"].includes(access.role)));
    if (quick ? !viewerMembership : !canAdmin && access?.status !== "ACTIVE") return invalidTargetResponse(request, "api:communities:id");
    const [roster, storedMatches, sessions, unreadCount] = await Promise.all([
      getClubRoster(prisma, id),
      prisma.match.findMany({ where: { status: "COMPLETED", session: { isTest: false, OR: [{ clubId: id }, { sessionClubs: { some: { clubId: id, status: "ACCEPTED" } } }] } }, include: { team1Player1: true, team1Player2: true, team2Player1: true, team2Player2: true, eloAdjustments: { where: { clubId: id } }, session: true } }),
      listSessionsForClub({ clubId: id, viewerId: actorId, viewerIsAdmin: canAdmin }),
      quick ? Promise.resolve(0) : prisma.clubNotification.count({ where: { clubId: id, recipientPlayer: { ownerUserId: actorId }, readAt: null } }),
    ]);
    const matches = withLegacySportingAliases(storedMatches);
    const resolve = await getClubStatUserResolver(prisma, { clubId: id, memberUserIds: roster.map(p => p.id) });
    const links = await getOfflineIdentityInfoByUserId(prisma, roster.map(p => p.id));
    const stats = new Map(roster.map(p => [p.id, { wins: 0, losses: 0, matches: 0 }]));
    for (const match of matches) {
      const team1 = [match.team1Player1Id, match.team1Player2Id].map(resolve);
      const team2 = [match.team2Player1Id, match.team2Player2Id].map(resolve);
      for (const playerId of new Set([...team1, ...team2])) { const stat = stats.get(playerId); if (stat) stat.matches++; }
      if (match.winnerTeam !== 1 && match.winnerTeam !== 2) continue;
      for (const playerId of match.winnerTeam === 1 ? team1 : team2) { const stat = stats.get(playerId); if (stat) stat.wins++; }
      for (const playerId of match.winnerTeam === 1 ? team2 : team1) { const stat = stats.get(playerId); if (stat) stat.losses++; }
    }
    const latest = [...sessions].filter(s => !s.isTest && s.status === "COMPLETED").sort((a, b) => new Date(b.endedAt ?? b.createdAt).getTime() - new Date(a.endedAt ?? a.createdAt).getTime())[0];
    const movements = buildClubLeaderboardRankMovements({ members: roster.map(p => ({ userId: p.id, name: p.name, elo: p.elo, isLeaderboardEligible: p.status !== "OCCASIONAL" && (stats.get(p.id)?.matches ?? 0) > 0 })), matchesSinceWindowStart: matches.filter(m => m.sessionId === latest?.id), resolveUserId: resolve });
    const members = roster.map(p => ({ ...p, wins: stats.get(p.id)?.wins ?? 0, losses: stats.get(p.id)?.losses ?? 0, matchesPlayed: stats.get(p.id)?.matches ?? 0, previousRank: movements.get(p.id)?.previousRank ?? null, rankDelta: movements.get(p.id)?.rankDelta ?? null, offlineIdentityId: links.get(p.id)?.offlineIdentityId ?? null, linkedClubBadges: links.get(p.id)?.linkedClubBadges ?? [] }));
    let pulse = buildClubPulse({ members, sessions: withLegacySportingAliases(sessions), completedMatches: matches.map(m => ({ ...m, team1User1: serializeAvatarEntity(m.team1Player1), team1User2: serializeAvatarEntity(m.team1Player2), team2User1: serializeAvatarEntity(m.team2Player1), team2User2: serializeAvatarEntity(m.team2Player2) })) });
    const likes = await prisma.clubNewsLike.findMany({ where: { clubId: id, newsItemId: { in: pulse.sessionNews.map(n => n.id) } }, select: { newsItemId: true, userId: true } });
    const likeState = new Map<string, { likeCount: number; likedByMe: boolean }>();
    for (const like of likes) { const state = likeState.get(like.newsItemId) ?? { likeCount: 0, likedByMe: false }; state.likeCount++; state.likedByMe ||= !quick && like.userId === actorId; likeState.set(like.newsItemId, state); }
    pulse = applyClubPulseNewsLikes(pulse, likeState);
    const player = viewerMembership?.player;
    const clubPayload = withLegacyClubAliases({ id: club.id, name: getTutorialClubDisplayName(club), rules: club.rules, avatarUrl: serializeAvatarEntity(club).avatarUrl, clubId: club.id, clubName: getTutorialClubDisplayName(club), isTutorial: club.isTutorial, tutorialOwnerId: club.tutorialOwnerId, viewerIsOwner: isOwner, role: canAdmin ? "ADMIN" : access?.role ?? "MEMBER", isPasswordProtected: club.isPasswordProtected, membersCount: members.length, sessionsCount: club._count.sessions });
    return NextResponse.json({
      viewer: { id: actorId, userId: quick ? null : actorId, playerId: player?.id ?? null, name: player?.name ?? account?.name ?? "Guest", email: account?.email ?? null, avatarUrl: serializeAvatarEntity(player ?? account ?? { avatarKey: null }).avatarUrl, isAdmin: !quick && !!session.user.isAdmin, isQuickAccess: quick, elo: viewerMembership?.elo ?? player?.elo ?? 1000, gender: player?.gender ?? "UNSPECIFIED", partnerPreference: player?.partnerPreference ?? "OPEN", mixedSideOverride: player?.mixedSideOverride ?? null },
      club: clubPayload, community: clubPayload, clubMembers: members, communityMembers: members, sessions: withLegacySportingAliases(sessions), clubPulse: pulse, communityPulse: pulse, notifications: { unreadCount }, claimRequests: [],
    });
  } catch (error) { logError("Get club", error); return safeErrorResponse(); }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:communities:id:patch", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return NextResponse.json(
        { error: getQuickAccessDeniedMessage() },
        { status: 403 }
      );
    }

    const { id } = await params;

    if (typeof id !== "string" || id.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:communities:id");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const [membership, existing] = await Promise.all([
      prisma.clubAccess.findUnique({
        where: {
          clubId_userId: {
            clubId: id,
            userId: session.user.id,
          },
        },
        select: { role: true, status: true },
      }),
      prisma.club.findUnique({
        where: { id },
        select: {
          id: true,
          createdById: true,
          rules: true,
          isPasswordProtected: true,
          isTutorial: true,
          tutorialOwnerId: true,
        },
      }),
    ]);

    if (!existing) {
      return invalidTargetResponse(request, "api:communities:id");
    }
    const viewerIsOwner = existing.createdById === session.user.id && membership?.status === "ACTIVE" && ["ADMIN", "OWNER"].includes(membership.role);
    if (
      !viewerIsOwner &&
      (membership?.status !== "ACTIVE" || !["ADMIN", "OWNER"].includes(membership.role)) &&
      !session.user.isAdmin
    ) {
      return invalidTargetResponse(request, "api:communities:id");
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const {
      name,
      rules,
      password,
      isPasswordProtected,
    } = body as {
      name?: unknown;
      rules?: unknown;
      password?: unknown;
      isPasswordProtected?: unknown;
    };
    const updates: {
      name?: string;
      rules?: string;
      isPasswordProtected?: boolean;
      passwordHash?: string | null;
    } = {};

    if (
      isPasswordProtected !== undefined &&
      typeof isPasswordProtected !== "boolean"
    ) {
      return NextResponse.json(
        { error: "Invalid password protection setting" },
        { status: 400 }
      );
    }

    if (existing.isTutorial) {
      if (existing.tutorialOwnerId !== session.user.id) {
        return invalidTargetResponse(request, "api:communities:id");
      }
      return NextResponse.json(
        { error: "Tutorial playground settings are managed by reset." },
        { status: 400 }
      );
    }

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 3) {
        return NextResponse.json(
          { error: "Club name must be at least 3 characters" },
          { status: 400 }
        );
      }
      const nextName = name.trim();
      const normalizedLookupName = normalizeNameLookupKey(nextName);
      if (!normalizedLookupName) {
        return NextResponse.json(
          { error: "Club name must include letters or numbers" },
          { status: 400 }
        );
      }

      const existingClubs = await prisma.club.findMany({
        where: { NOT: { id } },
        select: { name: true },
      });
      const normalizedNameExists = existingClubs.some(
        (club) =>
          normalizeNameLookupKey(club.name) === normalizedLookupName
      );
      if (normalizedNameExists) {
        return NextResponse.json(
          { error: "Club name already exists" },
          { status: 409 }
        );
      }

      updates.name = nextName;
    }

    if (rules !== undefined) {
      if (typeof rules !== "string" || rules.length > 3000) {
        return NextResponse.json(
          { error: "Club rules must be 3000 characters or fewer" },
          { status: 400 }
        );
      }
      updates.rules = rules;
    }

    if (password !== undefined) {
      if (typeof password !== "string") {
        return NextResponse.json({ error: "Invalid password" }, { status: 400 });
      }
      if (password.length > 0 && password.length < 4) {
        return NextResponse.json(
          { error: "Password must be at least 4 characters" },
          { status: 400 }
        );
      }
      if (password.length > 0 && isPasswordProtected !== false) {
        updates.passwordHash = await bcrypt.hash(password, 10);
        updates.isPasswordProtected = true;
      }
    }

    if (isPasswordProtected === false) {
      updates.isPasswordProtected = false;
      updates.passwordHash = null;
    }

    if (
      isPasswordProtected === true &&
      !existing.isPasswordProtected &&
      (typeof password !== "string" || password.length === 0)
    ) {
      return NextResponse.json(
        { error: "Password is required to protect the club" },
        { status: 400 }
      );
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updatedClub = await prisma.club.update({
      where: { id },
      data: updates,
      select: {
        id: true,
        name: true,
        rules: true,
        isPasswordProtected: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updatedClub);
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code === "P2002") {
      return NextResponse.json({ error: "Club name already exists" }, { status: 409 });
    }
    logError("Update club error", error);
    return safeErrorResponse();
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:communities:id:delete", { limit: 15, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return NextResponse.json(
        { error: getQuickAccessDeniedMessage() },
        { status: 403 }
      );
    }

    const { id } = await params;

    if (typeof id !== "string" || id.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:communities:id");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const [membership, existing] = await Promise.all([
      prisma.clubAccess.findUnique({
        where: {
          clubId_userId: {
            clubId: id,
            userId: session.user.id,
          },
        },
        select: { role: true, status: true },
      }),
      prisma.club.findUnique({
        where: { id },
        select: {
          id: true,
          createdById: true,
          isTutorial: true,
          tutorialOwnerId: true,
        },
      }),
    ]);

    if (!existing) {
      return invalidTargetResponse(request, "api:communities:id");
    }
    const viewerIsOwner = existing.createdById === session.user.id && membership?.status === "ACTIVE" && ["ADMIN", "OWNER"].includes(membership.role);
    if (
      !viewerIsOwner &&
      (membership?.status !== "ACTIVE" || !["ADMIN", "OWNER"].includes(membership.role)) &&
      !session.user.isAdmin
    ) {
      return invalidTargetResponse(request, "api:communities:id");
    }

    const body = await request.json().catch(() => null);
    const confirmation =
      body && typeof body === "object"
        ? (body as { confirmation?: unknown }).confirmation
        : undefined;
    if (confirmation !== "DELETE") {
      return NextResponse.json({ error: "Invalid confirmation text" }, { status: 400 });
    }

    if (existing.isTutorial) {
      if (existing.tutorialOwnerId !== session.user.id) {
        return invalidTargetResponse(request, "api:communities:id");
      }
      await deleteTutorialPlayground(session.user.id, id);
    } else {
      await prisma.club.delete({ where: { id } });
    }

    logAuditEvent({
      action: "community.delete",
      actor: {
        email: session.user.email ?? null,
        isGlobalAdmin: !!session.user.isAdmin,
        userId: session.user.id,
      },
      outcome: "success",
      request,
      scope: {
        clubId: id,
        route: "/api/clubs/[id]",
      },
      target: {
        id,
        type: "community",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("Delete club error", error);
    return safeErrorResponse();
  }
}
