import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { serializeAvatarEntity } from "@/lib/avatar";
import { buildClubPulse } from "@/lib/clubPulse";
import {
  getClubStatUserResolver,
  getOfflineIdentityInfoByUserId,
} from "@/lib/offlineIdentities";
import { buildClubLeaderboardRankMovements } from "@/lib/profileClubRank";
import { prisma } from "@/lib/prisma";
import { listSessionsForClub } from "@/app/api/sessions/listSessionsService";
import { logAuditEvent } from "@/lib/serverAudit";
import { logError, safeErrorResponse } from "@/lib/errors";
import { withLegacyClubAliases } from "@/lib/clubContractAliases";
import {
  deleteTutorialPlayground,
  getTutorialClubDisplayName,
} from "@/lib/tutorialPlayground";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";
import {
  canQuickAccessClub,
  getQuickAccessDeniedMessage,
  isQuickAccessSession,
  normalizeNameLookupKey,
} from "@/lib/quickAccess";
import {
  ClaimRequestStatus,
  ClubRole,
  ClubPlayerStatus,
  PartnerPreference,
  PlayerGender,
  SessionStatus,
} from "@/types/enums";

function toClaimRequestResponse(request: {
  id: string;
  clubId: string;
  requesterUserId: string;
  targetUserId: string;
  status: string;
  note: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  requester: { id: string; name: string; email: string | null };
  target: { id: string; name: string; email: string | null };
  linkedClubNames?: string[];
}) {
  return withLegacyClubAliases({
    id: request.id,
    clubId: request.clubId,
    requesterUserId: request.requesterUserId,
    requesterName: request.requester.name,
    requesterEmail: request.requester.email,
    targetUserId: request.targetUserId,
    targetName: request.target.name,
    targetEmail: request.target.email,
    status: request.status,
    note: request.note,
    linkedClubNames: request.linkedClubNames ?? [],
    linkedCommunityNames: request.linkedClubNames ?? [],
    createdAt: request.createdAt,
    reviewedAt: request.reviewedAt,
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(request, "api:communities:id:get", { limit: 30, windowMs: 60_000 });
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    if (typeof id !== "string" || id.length === 0) {
      return NextResponse.json({ error: "Invalid request parameters" }, { status: 400 });
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(request, "api:communities:id");

    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;
    if (!canQuickAccessClub(session, id)) {
      return invalidTargetResponse(request, "api:communities:id");
    }

    const viewerId = session.user.id;
    const viewerIsQuickAccess = isQuickAccessSession(session);
    const viewerIsAdmin = !viewerIsQuickAccess && !!session.user.isAdmin;

    const [viewer, membership, club] = await Promise.all([
      prisma.user.findUnique({
        where: { id: viewerId },
        select: {
          id: true,
          name: true,
          email: true,
          avatarKey: true,
          elo: true,
          gender: true,
          partnerPreference: true,
          mixedSideOverride: true,
        },
      }),
      prisma.clubMember.findUnique({
        where: {
          clubId_userId: {
            clubId: id,
            userId: viewerId,
          },
        },
        select: {
          role: true,
          elo: true,
        },
      }),
      prisma.club.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          createdById: true,
          isTutorial: true,
          tutorialOwnerId: true,
          isPasswordProtected: true,
          _count: {
            select: {
              members: true,
              sessions: true,
            },
          },
        },
      }),
    ]);

    if (!club) {
      return invalidTargetResponse(request, "api:communities:id");
    }

    const viewerIsOwner = club.createdById === viewerId;
    const viewerCanAdminClub =
      viewerIsAdmin || viewerIsOwner || membership?.role === ClubRole.ADMIN;

    if (club.isTutorial && club.tutorialOwnerId !== viewerId) {
      return invalidTargetResponse(request, "api:communities:id");
    }

    if (!membership && !viewerIsAdmin && !viewerIsOwner) {
      return invalidTargetResponse(request, "api:communities:id");
    }

    if (!viewer) {
      return invalidTargetResponse(request, "api:communities:id");
    }

    const [members, completedMatches, sessions, claimRequests] = await Promise.all([
      prisma.clubMember.findMany({
        where: { clubId: id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              avatarKey: true,
              gender: true,
              partnerPreference: true,
              mixedSideOverride: true,
              isActive: true,
              isClaimed: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.match.findMany({
        where: {
          status: "COMPLETED",
          session: {
            isTest: false,
            OR: [
              { clubId: id },
              {
                sessionClubs: {
                  some: {
                    clubId: id,
                    status: "ACCEPTED",
                  },
                },
              },
            ],
          },
        },
        select: {
          id: true,
          completedAt: true,
          winnerTeam: true,
          team1User1Id: true,
          team1User2Id: true,
          team2User1Id: true,
          team2User2Id: true,
          team1Score: true,
          team2Score: true,
          team1EloChange: true,
          team2EloChange: true,
          team1User1: { select: { id: true, name: true, avatarKey: true } },
          team1User2: { select: { id: true, name: true, avatarKey: true } },
          team2User1: { select: { id: true, name: true, avatarKey: true } },
          team2User2: { select: { id: true, name: true, avatarKey: true } },
          session: {
            select: {
              id: true,
              code: true,
              name: true,
              type: true,
              createdAt: true,
              endedAt: true,
            },
          },
        },
      }),
      listSessionsForClub({
        clubId: id,
        viewerId,
        viewerIsAdmin: viewerCanAdminClub,
      }),
      prisma.claimRequest.findMany({
        where:
          viewerCanAdminClub
            ? {
                clubId: id,
                status: ClaimRequestStatus.PENDING,
              }
            : {
                clubId: id,
                requesterUserId: viewerId,
                status: ClaimRequestStatus.PENDING,
              },
        include: {
          requester: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          target: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const statsByUserId = new Map<string, { wins: number; losses: number }>();
    const offlineIdentityInfoByUserId = await getOfflineIdentityInfoByUserId(
      prisma,
      members.map((member) => member.user.id)
    );
    for (const member of members) {
      statsByUserId.set(member.user.id, { wins: 0, losses: 0 });
    }
    const resolveStatUserId = await getClubStatUserResolver(prisma, {
      clubId: id,
      memberUserIds: members.map((member) => member.user.id),
    });
    const latestCompletedSession = sessions
      .filter(
        (sessionItem) =>
          !sessionItem.isTest && sessionItem.status === SessionStatus.COMPLETED
      )
      .sort((left, right) => {
        const leftTime = new Date(left.endedAt ?? left.createdAt).getTime();
        const rightTime = new Date(right.endedAt ?? right.createdAt).getTime();
        return rightTime - leftTime;
      })[0];
    const latestCompletedSessionMatches = latestCompletedSession
      ? completedMatches.filter(
          (match) => match.session.id === latestCompletedSession.id
        )
      : [];
    const rankMovements = buildClubLeaderboardRankMovements({
      members: members.map((member) => ({
        userId: member.user.id,
        name: member.user.name,
        elo: member.elo,
        isLeaderboardEligible:
          member.status !== ClubPlayerStatus.OCCASIONAL,
      })),
      matchesSinceWindowStart: latestCompletedSessionMatches,
      resolveUserId: resolveStatUserId,
    });

    for (const match of completedMatches) {
      if (match.winnerTeam !== 1 && match.winnerTeam !== 2) {
        continue;
      }

      const team1Ids = [match.team1User1Id, match.team1User2Id].map(
        resolveStatUserId
      );
      const team2Ids = [match.team2User1Id, match.team2User2Id].map(
        resolveStatUserId
      );
      const winners = match.winnerTeam === 1 ? team1Ids : team2Ids;
      const losers = match.winnerTeam === 1 ? team2Ids : team1Ids;

      for (const winnerId of winners) {
        const stat = statsByUserId.get(winnerId);
        if (stat) stat.wins += 1;
      }

      for (const loserId of losers) {
        const stat = statsByUserId.get(loserId);
        if (stat) stat.losses += 1;
      }
    }

    const clubMembers = members.map((member) => {
      const offlineIdentityInfo = offlineIdentityInfoByUserId.get(member.user.id);
      const rankMovement = rankMovements.get(member.user.id);

      return {
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        avatarUrl: serializeAvatarEntity(member.user).avatarUrl,
        needsMoreRest: member.needsMoreRest,
        status:
          member.status === ClubPlayerStatus.OCCASIONAL
            ? ClubPlayerStatus.OCCASIONAL
            : ClubPlayerStatus.CORE,
        gender:
          [PlayerGender.MALE, PlayerGender.FEMALE].includes(
            member.user.gender as PlayerGender
          )
            ? member.user.gender
            : PlayerGender.MALE,
        partnerPreference: member.user.partnerPreference,
        mixedSideOverride:
          typeof member.user.mixedSideOverride === "string"
            ? member.user.mixedSideOverride
            : null,
        elo: member.elo,
        isActive: member.user.isActive,
        isClaimed: member.user.isClaimed,
        createdAt: member.user.createdAt,
        wins: statsByUserId.get(member.user.id)?.wins ?? 0,
        losses: statsByUserId.get(member.user.id)?.losses ?? 0,
        previousRank: rankMovement?.previousRank ?? null,
        rankDelta: rankMovement?.rankDelta ?? null,
        role: member.role,
        isOwner: member.user.id === club.createdById,
        offlineIdentityId: offlineIdentityInfo?.offlineIdentityId ?? null,
        linkedClubBadges: offlineIdentityInfo?.linkedClubBadges ?? [],
      };
    });
    const clubPulse = buildClubPulse({
      members: clubMembers.map((member) => ({
        id: member.id,
        name: member.name,
        avatarUrl: member.avatarUrl,
        elo: member.elo,
      })),
      sessions,
      completedMatches: completedMatches.map((match) => ({
        ...match,
        team1User1: serializeAvatarEntity(match.team1User1),
        team1User2: serializeAvatarEntity(match.team1User2),
        team2User1: serializeAvatarEntity(match.team2User1),
        team2User2: serializeAvatarEntity(match.team2User2),
      })),
    });

    const clubPayload = {
      id: club.id,
      name: getTutorialClubDisplayName(club),
      clubId: club.id,
      clubName: getTutorialClubDisplayName(club),
      isTutorial: club.isTutorial,
      tutorialOwnerId: club.tutorialOwnerId,
      viewerIsOwner,
      role: viewerIsQuickAccess
        ? ClubRole.MEMBER
        : viewerCanAdminClub
          ? ClubRole.ADMIN
          : membership?.role ?? "MEMBER",
      isPasswordProtected: club.isPasswordProtected,
      membersCount: club._count.members,
      sessionsCount: club._count.sessions,
    };
    return NextResponse.json({
      viewer: {
        id: viewer.id,
        name: viewer.name,
        email: viewer.email,
        avatarUrl: serializeAvatarEntity(viewer).avatarUrl,
        isAdmin: viewerIsAdmin,
        elo: membership?.elo ?? viewer.elo,
        gender:
          [PlayerGender.MALE, PlayerGender.FEMALE].includes(
            viewer.gender as PlayerGender
          )
            ? viewer.gender
            : PlayerGender.MALE,
        partnerPreference:
          typeof viewer.partnerPreference === "string"
            ? (viewer.partnerPreference as PartnerPreference)
            : PartnerPreference.OPEN,
        mixedSideOverride:
          typeof viewer.mixedSideOverride === "string"
            ? viewer.mixedSideOverride
            : null,
      },
      club: withLegacyClubAliases(clubPayload),
      community: withLegacyClubAliases(clubPayload),
      clubMembers,
      communityMembers: clubMembers,
      sessions,
      clubPulse: clubPulse,
      communityPulse: clubPulse,
      claimRequests: claimRequests.map((claimRequest) =>
        toClaimRequestResponse({
          ...claimRequest,
          linkedClubNames:
            offlineIdentityInfoByUserId
              .get(claimRequest.targetUserId)
              ?.linkedClubBadges.map((badge) => badge.name) ?? [],
        })
      ),
    });
  } catch (error) {
    logError("Get club snapshot error", error);
    return safeErrorResponse();
  }
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
      prisma.clubMember.findUnique({
        where: {
          clubId_userId: {
            clubId: id,
            userId: session.user.id,
          },
        },
        select: { role: true },
      }),
      prisma.club.findUnique({
        where: { id },
        select: {
          id: true,
          createdById: true,
          isPasswordProtected: true,
          isTutorial: true,
          tutorialOwnerId: true,
        },
      }),
    ]);

    if (!existing) {
      return invalidTargetResponse(request, "api:communities:id");
    }
    const viewerIsOwner = existing.createdById === session.user.id;
    if (
      !viewerIsOwner &&
      membership?.role !== ClubRole.ADMIN &&
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
      password,
      isPasswordProtected,
    } = body as {
      name?: unknown;
      password?: unknown;
      isPasswordProtected?: unknown;
    };
    const updates: {
      name?: string;
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
      prisma.clubMember.findUnique({
        where: {
          clubId_userId: {
            clubId: id,
            userId: session.user.id,
          },
        },
        select: { role: true },
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
    const viewerIsOwner = existing.createdById === session.user.id;
    if (
      !viewerIsOwner &&
      membership?.role !== ClubRole.ADMIN &&
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
