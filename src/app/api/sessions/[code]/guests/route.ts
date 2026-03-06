import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  PartnerPreference,
  PlayerGender,
  SessionMode,
  SessionStatus,
} from "@/types/enums";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { name, initialElo, gender, partnerPreference } = body as {
      name?: unknown;
      initialElo?: unknown;
      gender?: unknown;
      partnerPreference?: unknown;
    };
    if (typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json({ error: "Guest name must be at least 2 characters" }, { status: 400 });
    }

    let guestElo = 1000;
    if (typeof initialElo === "number") {
      if (!Number.isInteger(initialElo) || initialElo < 0 || initialElo > 5000) {
        return NextResponse.json({ error: "Invalid guest ELO" }, { status: 400 });
      }
      guestElo = initialElo;
    }

    const normalizedGender =
      typeof gender === "string" &&
      [PlayerGender.MALE, PlayerGender.FEMALE, PlayerGender.UNSPECIFIED].includes(
        gender as PlayerGender
      )
        ? (gender as PlayerGender)
        : PlayerGender.MALE;
    const normalizedPartnerPreference =
      typeof partnerPreference === "string" &&
      [PartnerPreference.OPEN, PartnerPreference.FEMALE_FLEX].includes(
        partnerPreference as PartnerPreference
      )
        ? (partnerPreference as PartnerPreference)
        : PartnerPreference.OPEN;

    const { code } = await params;
    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: { id: true, communityId: true, status: true, mode: true },
    });

    if (!sessionData) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (sessionData.status === SessionStatus.COMPLETED) {
      return NextResponse.json({ error: "Session already ended" }, { status: 400 });
    }
    if (
      sessionData.mode === SessionMode.MIXICANO &&
      ![PlayerGender.MALE, PlayerGender.FEMALE].includes(normalizedGender)
    ) {
      return NextResponse.json(
        { error: "MIXICANO requires guest gender (MALE/FEMALE)" },
        { status: 400 }
      );
    }

    let canManage = !!session.user.isAdmin;
    if (sessionData.communityId) {
      const membership = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: sessionData.communityId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      });
      canManage = canManage || membership?.role === "ADMIN";
    } else if (!canManage) {
      const isSessionPlayer = await prisma.sessionPlayer.findUnique({
        where: {
          sessionId_userId: {
            sessionId: sessionData.id,
            userId: session.user.id,
          },
        },
        select: { id: true },
      });
      canManage = !!isSessionPlayer;
    }

    if (!canManage) {
      return NextResponse.json({ error: "Only admins can add guests" }, { status: 403 });
    }

    const guestName = name.trim();

    const createdGuest = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: guestName,
          email: null,
          passwordHash: null,
          isClaimed: false,
          elo: guestElo,
          gender: normalizedGender,
          partnerPreference: normalizedPartnerPreference,
        },
        select: {
          id: true,
          name: true,
          elo: true,
          gender: true,
          partnerPreference: true,
        },
      });

      await tx.sessionPlayer.create({
        data: {
          sessionId: sessionData.id,
          userId: user.id,
          isGuest: true,
          gender: user.gender,
          partnerPreference: user.partnerPreference,
          sessionPoints: 0,
          joinedAt: new Date(),
          availableSince: new Date(),
        },
      });

      return user;
    });

    return NextResponse.json({
      id: createdGuest.id,
      name: createdGuest.name,
      elo: createdGuest.elo,
      isGuest: true,
      gender: createdGuest.gender,
      partnerPreference: createdGuest.partnerPreference,
    });
  } catch (error) {
    console.error("Create guest error:", error);
    return NextResponse.json({ error: "Failed to create guest" }, { status: 500 });
  }
}
