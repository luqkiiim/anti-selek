import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { PartnerPreference, PlayerGender } from "@/types/enums";

export const dynamic = "force-dynamic";

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

    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: id,
          userId: session.user.id,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const members = await prisma.communityMember.findMany({
      where: { communityId: id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            gender: true,
            partnerPreference: true,
            isActive: true,
            isClaimed: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const completedMatches = await prisma.match.findMany({
      where: {
        status: "COMPLETED",
        session: { communityId: id },
      },
      select: {
        winnerTeam: true,
        team1User1Id: true,
        team1User2Id: true,
        team2User1Id: true,
        team2User2Id: true,
      },
    });

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

    return NextResponse.json(
      members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        gender:
          [PlayerGender.MALE, PlayerGender.FEMALE].includes(m.user.gender as PlayerGender)
            ? m.user.gender
            : PlayerGender.MALE,
        partnerPreference: m.user.partnerPreference,
        elo: m.elo,
        isActive: m.user.isActive,
        isClaimed: m.user.isClaimed,
        createdAt: m.user.createdAt,
        wins: statsByUserId.get(m.user.id)?.wins ?? 0,
        losses: statsByUserId.get(m.user.id)?.losses ?? 0,
        role: m.role,
      }))
    );
  } catch (error) {
    console.error("List community members error:", error);
    return NextResponse.json({ error: "Failed to load community members" }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;

    const requesterMembership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId: id,
          userId: session.user.id,
        },
      },
      select: { role: true },
    });

    const canManage = requesterMembership?.role === "ADMIN" || session.user.isAdmin;
    if (!canManage) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { name, email, password, gender, partnerPreference } = body as {
      name?: unknown;
      email?: unknown;
      password?: unknown;
      gender?: unknown;
      partnerPreference?: unknown;
    };
    if (typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json({ error: "Player name must be at least 2 characters" }, { status: 400 });
    }
    if (email !== undefined && typeof email !== "string") {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    if (password !== undefined && typeof password !== "string") {
      return NextResponse.json({ error: "Invalid password" }, { status: 400 });
    }
    if (
      gender !== undefined &&
      (typeof gender !== "string" ||
        ![PlayerGender.MALE, PlayerGender.FEMALE, PlayerGender.UNSPECIFIED].includes(
          gender as PlayerGender
        ))
    ) {
      return NextResponse.json({ error: "Invalid gender" }, { status: 400 });
    }
    if (
      partnerPreference !== undefined &&
      (typeof partnerPreference !== "string" ||
        ![PartnerPreference.OPEN, PartnerPreference.FEMALE_FLEX].includes(
          partnerPreference as PartnerPreference
        ))
    ) {
      return NextResponse.json({ error: "Invalid partner preference" }, { status: 400 });
    }

    const normalizedName = name.trim();
    const normalizedEmail =
      typeof email === "string" && email.trim().length > 0 ? email.trim().toLowerCase() : null;
    const normalizedPassword =
      typeof password === "string" && password.length > 0 ? password : null;

    let user: {
      id: string;
      name: string;
      email: string | null;
      gender: string;
      partnerPreference: string;
      isActive: boolean;
      isClaimed: boolean;
      createdAt: Date;
    };
    let userWasCreated = false;
    if (normalizedEmail) {
      const existingUser = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          name: true,
          email: true,
          gender: true,
          partnerPreference: true,
          isActive: true,
          isClaimed: true,
          createdAt: true,
        },
      });

      if (existingUser) {
        user = existingUser;
      } else {
        const passwordHash = normalizedPassword ? await bcrypt.hash(normalizedPassword, 10) : null;
        user = await prisma.user.create({
          data: {
            name: normalizedName,
            email: normalizedEmail,
            passwordHash,
            isClaimed: !!passwordHash,
          },
          select: {
            id: true,
            name: true,
            email: true,
            gender: true,
            partnerPreference: true,
            isActive: true,
            isClaimed: true,
            createdAt: true,
          },
        });
        userWasCreated = true;
      }
    } else {
      const existingUnclaimed = await prisma.user.findFirst({
        where: { name: normalizedName, isClaimed: false },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          gender: true,
          partnerPreference: true,
          isActive: true,
          isClaimed: true,
          createdAt: true,
        },
      });

      if (existingUnclaimed) {
        user = existingUnclaimed;
      } else {
        user = await prisma.user.create({
          data: {
            name: normalizedName,
            email: null,
            passwordHash: null,
            isClaimed: false,
          },
          select: {
            id: true,
            name: true,
            email: true,
            gender: true,
            partnerPreference: true,
            isActive: true,
            isClaimed: true,
            createdAt: true,
          },
        });
        userWasCreated = true;
      }
    }

    const requestedGender =
      gender === PlayerGender.MALE || gender === PlayerGender.FEMALE
        ? (gender as PlayerGender)
        : undefined;
    const resolvedGender =
      requestedGender ??
      ([PlayerGender.MALE, PlayerGender.FEMALE].includes(user.gender as PlayerGender)
        ? (user.gender as PlayerGender)
        : PlayerGender.MALE);

    const resolvedPartnerPreference =
      typeof partnerPreference === "string"
        ? (partnerPreference as PartnerPreference)
        : (requestedGender === PlayerGender.FEMALE ||
            (userWasCreated && resolvedGender === PlayerGender.FEMALE))
          ? PartnerPreference.FEMALE_FLEX
          : (user.partnerPreference as PartnerPreference);

    if (
      resolvedGender !== user.gender ||
      resolvedPartnerPreference !== user.partnerPreference
    ) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          gender: resolvedGender,
          partnerPreference: resolvedPartnerPreference,
        },
      });
    }

    const membership = await prisma.communityMember.upsert({
      where: {
        communityId_userId: {
          communityId: id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        communityId: id,
        userId: user.id,
        role: "MEMBER",
      },
      select: {
        role: true,
        elo: true,
      },
    });

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      gender: resolvedGender,
      partnerPreference: resolvedPartnerPreference,
      elo: membership.elo,
      isActive: user.isActive,
      isClaimed: user.isClaimed,
      createdAt: user.createdAt,
      role: membership.role,
    });
  } catch (error) {
    console.error("Add community member error:", error);
    return NextResponse.json({ error: "Failed to add player to community" }, { status: 500 });
  }
}
