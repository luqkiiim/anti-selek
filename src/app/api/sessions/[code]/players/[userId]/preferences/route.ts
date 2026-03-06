import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PartnerPreference, PlayerGender, SessionMode, SessionStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string; userId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code, userId } = await params;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { gender, partnerPreference } = body as {
      gender?: unknown;
      partnerPreference?: unknown;
    };

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

    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: { id: true, communityId: true, mode: true, status: true },
    });
    if (!sessionData) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (sessionData.status === SessionStatus.COMPLETED) {
      return NextResponse.json({ error: "Session already completed" }, { status: 400 });
    }

    let isCommunityAdmin = false;
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
      isCommunityAdmin = membership?.role === "ADMIN";
    }

    if (!session.user.isAdmin && !isCommunityAdmin) {
      return NextResponse.json({ error: "Only admins can update preferences" }, { status: 403 });
    }

    const existing = await prisma.sessionPlayer.findUnique({
      where: {
        sessionId_userId: {
          sessionId: sessionData.id,
          userId,
        },
      },
      select: { gender: true, partnerPreference: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Player not found in session" }, { status: 404 });
    }

    const nextGender =
      typeof gender === "string"
        ? (gender as PlayerGender)
        : (existing.gender as PlayerGender | undefined) ?? PlayerGender.UNSPECIFIED;

    if (
      sessionData.mode === SessionMode.MIXICANO &&
      ![PlayerGender.MALE, PlayerGender.FEMALE].includes(nextGender)
    ) {
      return NextResponse.json(
        { error: "MIXICANO requires MALE/FEMALE gender for all players" },
        { status: 400 }
      );
    }

    const updated = await prisma.sessionPlayer.update({
      where: {
        sessionId_userId: {
          sessionId: sessionData.id,
          userId,
        },
      },
      data: {
        gender: typeof gender === "string" ? gender : undefined,
        partnerPreference: typeof partnerPreference === "string" ? partnerPreference : undefined,
      },
      include: {
        user: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update session preference error:", error);
    return NextResponse.json({ error: "Failed to update session preference" }, { status: 500 });
  }
}
