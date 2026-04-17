import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listSessionsForCommunity } from "@/app/api/sessions/listSessionsService";
import { logAuditEvent } from "@/lib/serverAudit";
import {
  ClaimRequestStatus,
  CommunityPlayerStatus,
  PartnerPreference,
  PlayerGender,
} from "@/types/enums";

function toClaimRequestResponse(request: {
  id: string;
  communityId: string;
  requesterUserId: string;
  targetUserId: string;
  status: string;
  note: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
  requester: { id: string; name: string; email: string | null };
  target: { id: string; name: string; email: string | null };
}) {
  return {
    id: request.id,
    communityId: request.communityId,
    requesterUserId: request.requesterUserId,
    requesterName: request.requester.name,
    requesterEmail: request.requester.email,
    targetUserId: request.targetUserId,
    targetName: request.target.name,
    targetEmail: request.target.email,
    status: request.status,
    note: request.note,
    createdAt: request.createdAt,
    reviewedAt: request.reviewedAt,
  };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;
    const viewerId = session.user.id;
    const viewerIsAdmin = !!session.user.isAdmin;

    const [viewer, membership, community] = await Promise.all([
      prisma.user.findUnique({
        where: { id: viewerId },
        select: {
          id: true,
          name: true,
          email: true,
          elo: true,
          gender: true,
          partnerPreference: true,
          mixedSideOverride: true,
        },
      }),
      prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: id,
            userId: viewerId,
          },
        },
        select: {
          role: true,
          elo: true,
        },
      }),
      prisma.community.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
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

    if (!community) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    if (!membership && !viewerIsAdmin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    if (!viewer) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const [members, completedMatches, sessions, claimRequests] = await Promise.all([
      prisma.communityMember.findMany({
        where: { communityId: id },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
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
          session: { communityId: id, isTest: false },
        },
        select: {
          winnerTeam: true,
          team1User1Id: true,
          team1User2Id: true,
          team2User1Id: true,
          team2User2Id: true,
        },
      }),
      listSessionsForCommunity({
        communityId: id,
        viewerId,
        viewerIsAdmin,
      }),
      prisma.claimRequest.findMany({
        where:
          membership?.role === "ADMIN" || viewerIsAdmin
            ? {
                communityId: id,
                status: ClaimRequestStatus.PENDING,
              }
            : {
                communityId: id,
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
    for (const member of members) {
      statsByUserId.set(member.user.id, { wins: 0, losses: 0 });
    }

    for (const match of completedMatches) {
      if (match.winnerTeam !== 1 && match.winnerTeam !== 2) {
        continue;
      }

      const team1Ids = [match.team1User1Id, match.team1User2Id];
      const team2Ids = [match.team2User1Id, match.team2User2Id];
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

    return NextResponse.json({
      viewer: {
        id: viewer.id,
        name: viewer.name,
        email: viewer.email,
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
      community: {
        id: community.id,
        name: community.name,
        role: viewerIsAdmin ? "ADMIN" : membership?.role ?? "MEMBER",
        isPasswordProtected: community.isPasswordProtected,
        membersCount: community._count.members,
        sessionsCount: community._count.sessions,
      },
      communityMembers: members.map((member) => ({
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        status:
          member.status === CommunityPlayerStatus.OCCASIONAL
            ? CommunityPlayerStatus.OCCASIONAL
            : CommunityPlayerStatus.CORE,
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
        role: member.role,
      })),
      sessions,
      claimRequests: claimRequests.map(toClaimRequestResponse),
    });
  } catch (error) {
    console.error("Get community snapshot error:", error);
    return NextResponse.json(
      { error: "Failed to load community" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: id,
          userId: session.user.id,
        },
      },
      select: { role: true },
    });

    if (!membership || (membership.role !== "ADMIN" && !session.user.isAdmin)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { name, password } = body as { name?: unknown; password?: unknown };
    const updates: {
      name?: string;
      isPasswordProtected?: boolean;
      passwordHash?: string | null;
    } = {};

    if (name !== undefined) {
      if (typeof name !== "string" || name.trim().length < 3) {
        return NextResponse.json(
          { error: "Community name must be at least 3 characters" },
          { status: 400 }
        );
      }
      updates.name = name.trim();
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
      if (password.length > 0) {
        updates.passwordHash = await bcrypt.hash(password, 10);
        updates.isPasswordProtected = true;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const existing = await prisma.community.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    const updatedCommunity = await prisma.community.update({
      where: { id },
      data: updates,
      select: {
        id: true,
        name: true,
        isPasswordProtected: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updatedCommunity);
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? (error as { code?: unknown }).code
        : undefined;
    if (code === "P2002") {
      return NextResponse.json({ error: "Community name already exists" }, { status: 409 });
    }
    console.error("Update community error:", error);
    return NextResponse.json({ error: "Failed to update community" }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: id,
          userId: session.user.id,
        },
      },
      select: { role: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    if (membership.role !== "ADMIN" && !session.user.isAdmin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const confirmation =
      body && typeof body === "object"
        ? (body as { confirmation?: unknown }).confirmation
        : undefined;
    if (confirmation !== "DELETE") {
      return NextResponse.json({ error: "Invalid confirmation text" }, { status: 400 });
    }

    const existing = await prisma.community.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Community not found" }, { status: 404 });
    }

    await prisma.community.delete({ where: { id } });

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
        communityId: id,
        route: "/api/communities/[id]",
      },
      target: {
        id,
        type: "community",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete community error:", error);
    return NextResponse.json({ error: "Failed to delete community" }, { status: 500 });
  }
}
