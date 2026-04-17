import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCommunityEloByUserId, withCommunityElo } from "@/lib/communityElo";
import { prisma } from "@/lib/prisma";
import { SessionPool, SessionStatus } from "@/types/enums";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { code } = await params;
    const sourceSession = await prisma.session.findUnique({
      where: { code },
      include: {
        courts: {
          select: {
            courtNumber: true,
            label: true,
          },
          orderBy: { courtNumber: "asc" },
        },
        players: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                elo: true,
              },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
      },
    });

    if (!sourceSession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    let isCommunityAdmin = false;
    if (sourceSession.communityId) {
      const membership = await prisma.communityMember.findUnique({
        where: {
          communityId_userId: {
            communityId: sourceSession.communityId,
            userId: session.user.id,
          },
        },
        select: { role: true },
      });
      isCommunityAdmin = membership?.role === "ADMIN";
    }

    if (!session.user.isAdmin && !isCommunityAdmin) {
      return NextResponse.json({ error: "Admin only" }, { status: 403 });
    }

    if (!sourceSession.isTest) {
      return NextResponse.json(
        { error: "Only test sessions can create a real session copy" },
        { status: 400 }
      );
    }

    if (sourceSession.players.length < 2) {
      return NextResponse.json(
        { error: "Need at least 2 players to create a real session" },
        { status: 400 }
      );
    }

    const createdAt = new Date();
    const nextSessionId = randomUUID();
    const createdSession = await prisma.$transaction(async (tx) => {
      const nextSession = await tx.session.create({
        data: {
          id: nextSessionId,
          code: nextSessionId,
          communityId: sourceSession.communityId,
          name: sourceSession.name,
          type: sourceSession.type,
          mode: sourceSession.mode,
          status: SessionStatus.WAITING,
          isTest: false,
          sourceSessionId: sourceSession.id,
          autoQueueEnabled: sourceSession.autoQueueEnabled,
          poolsEnabled: sourceSession.poolsEnabled,
          poolAName: sourceSession.poolAName,
          poolBName: sourceSession.poolBName,
          crossoverMissThreshold: sourceSession.crossoverMissThreshold,
          courts: {
            create: sourceSession.courts.map((court) => ({
              courtNumber: court.courtNumber,
              label: court.label ?? null,
            })),
          },
          players: {
            create: sourceSession.players
              .filter((player) => !player.isGuest)
              .map((player) => ({
                userId: player.userId,
                isGuest: false,
                gender: player.gender,
                partnerPreference: player.partnerPreference,
                mixedSideOverride: player.mixedSideOverride,
                pool: sourceSession.poolsEnabled ? player.pool : SessionPool.A,
                sessionPoints: 0,
                joinedAt: createdAt,
                availableSince: createdAt,
                ladderEntryAt: createdAt,
              })),
          },
        },
      });

      const guestPlayers = sourceSession.players.filter((player) => player.isGuest);
      if (guestPlayers.length > 0) {
        const createdGuests = await Promise.all(
          guestPlayers.map((guestPlayer) =>
            tx.user.create({
              data: {
                name: guestPlayer.user.name,
                email: null,
                passwordHash: null,
                isClaimed: false,
                elo: guestPlayer.user.elo,
                gender: guestPlayer.gender,
                partnerPreference: guestPlayer.partnerPreference,
                mixedSideOverride: guestPlayer.mixedSideOverride,
              },
              select: {
                id: true,
              },
            })
          )
        );

        await tx.sessionPlayer.createMany({
          data: createdGuests.map((guest, index) => ({
            sessionId: nextSession.id,
            userId: guest.id,
            isGuest: true,
            gender: guestPlayers[index].gender,
            partnerPreference: guestPlayers[index].partnerPreference,
            mixedSideOverride: guestPlayers[index].mixedSideOverride,
            pool: sourceSession.poolsEnabled
              ? guestPlayers[index].pool
              : SessionPool.A,
            sessionPoints: 0,
            joinedAt: createdAt,
            availableSince: createdAt,
            ladderEntryAt: createdAt,
          })),
        });
      }

      return tx.session.findUnique({
        where: { id: nextSession.id },
        include: {
          courts: true,
          players: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  elo: true,
                  gender: true,
                  partnerPreference: true,
                  mixedSideOverride: true,
                },
              },
            },
          },
        },
      });
    });

    if (!createdSession) {
      return NextResponse.json(
        { error: "Failed to create real session" },
        { status: 500 }
      );
    }

    const players =
      createdSession.communityId && createdSession.players.length > 0
        ? withCommunityElo(
            createdSession.players,
            await getCommunityEloByUserId(
              createdSession.communityId,
              createdSession.players.map((player) => player.userId)
            )
          )
        : createdSession.players;

    return NextResponse.json({
      ...createdSession,
      players,
    });
  } catch (error) {
    console.error("Create real session from test error:", error);
    return NextResponse.json(
      { error: "Failed to create real session from test setup" },
      { status: 500 }
    );
  }
}
