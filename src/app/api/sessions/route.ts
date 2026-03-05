import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCommunityEloByUserId, withCommunityElo } from "@/lib/communityElo";
import { SessionStatus, SessionType } from "@/types/enums";

export const dynamic = "force-dynamic";

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const { name, type = SessionType.POINTS, playerIds = [], guestNames = [], communityId, courtCount = 3 } = body as {
      name?: unknown;
      type?: SessionType;
      playerIds?: unknown;
      guestNames?: unknown;
      communityId?: unknown;
      courtCount?: unknown;
    };

    if (typeof name !== "string" || !name.trim()) {
      return NextResponse.json({ error: "Session name required" }, { status: 400 });
    }
    if (typeof communityId !== "string" || !communityId) {
      return NextResponse.json({ error: "Community is required" }, { status: 400 });
    }
    if (!Number.isInteger(courtCount) || (courtCount as number) < 1 || (courtCount as number) > 10) {
      return NextResponse.json({ error: "Court count must be an integer between 1 and 10" }, { status: 400 });
    }

    const requesterMembership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: session.user.id,
        },
      },
    });

    if (!requesterMembership && !session.user.isAdmin) {
      return NextResponse.json({ error: "Not a community member" }, { status: 403 });
    }
    if (!session.user.isAdmin && requesterMembership?.role !== "ADMIN") {
      return NextResponse.json({ error: "Only community admins can create tournaments" }, { status: 403 });
    }

    // Create session with unique code
    let code = generateCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await prisma.session.findUnique({ where: { code } });
      if (!existing) break;
      code = generateCode();
      attempts++;
    }

    // Ensure unique player IDs and include creator
    const requestedPlayerIds = Array.isArray(playerIds)
      ? playerIds.filter((id): id is string => typeof id === "string")
      : [];
    const requestedGuestNames = Array.isArray(guestNames)
      ? guestNames.filter((guestName): guestName is string => typeof guestName === "string")
      : [];

    const guestNameByLower = new Map<string, string>();
    for (const guestName of requestedGuestNames) {
      const trimmed = guestName.trim();
      if (trimmed.length < 2) continue;
      const key = trimmed.toLowerCase();
      if (!guestNameByLower.has(key)) {
        guestNameByLower.set(key, trimmed);
      }
    }
    const normalizedGuestNames = Array.from(guestNameByLower.values());

    const memberRows = await prisma.communityMember.findMany({
      where: { communityId },
      select: { userId: true },
    });
    const memberSet = new Set(memberRows.map((m) => m.userId));

    const uniquePlayerIds = Array.from(
      new Set([...requestedPlayerIds, session.user.id])
    ).filter((id) => memberSet.has(id));

    if (uniquePlayerIds.length + normalizedGuestNames.length < 2) {
      return NextResponse.json(
        { error: "At least 2 total players (members and/or guests) are required to create a tournament" },
        { status: 400 }
      );
    }

    console.log("Creating session with players:", uniquePlayerIds);

    const normalizedCourtCount = courtCount as number;
    const newSession = await prisma.$transaction(async (tx) => {
      const createdSession = await tx.session.create({
        data: {
          code,
          communityId,
          name: name.trim(),
          type,
          status: SessionStatus.WAITING,
          courts: {
            create: Array.from({ length: normalizedCourtCount }, (_, i) => ({
              courtNumber: i + 1,
            })),
          },
          players: {
            create: uniquePlayerIds.map((pid) => ({
              userId: pid,
              isGuest: false,
              sessionPoints: 0,
            })),
          },
        },
      });

      if (normalizedGuestNames.length > 0) {
        const createdGuests = await Promise.all(
          normalizedGuestNames.map((guestName) =>
            tx.user.create({
              data: {
                name: guestName,
                email: null,
                passwordHash: null,
                isClaimed: false,
                elo: 1000,
              },
              select: { id: true },
            })
          )
        );

        await tx.sessionPlayer.createMany({
          data: createdGuests.map((guest) => ({
            sessionId: createdSession.id,
            userId: guest.id,
            isGuest: true,
            sessionPoints: 0,
            joinedAt: new Date(),
            availableSince: new Date(),
          })),
        });
      }

      return tx.session.findUnique({
        where: { id: createdSession.id },
        include: {
          courts: true,
          players: {
            include: { user: { select: { id: true, name: true, email: true, elo: true } } },
          },
        },
      });
    });

    if (!newSession) {
      return NextResponse.json({ error: "Failed to load created tournament" }, { status: 500 });
    }

    const players =
      newSession.communityId && newSession.players.length > 0
        ? withCommunityElo(
            newSession.players,
            await getCommunityEloByUserId(
              newSession.communityId,
              newSession.players.map((p) => p.userId)
            )
          )
        : newSession.players;

    return NextResponse.json({ ...newSession, players });
  } catch (error) {
    console.error("Session creation error details:", error);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const url = new URL(request.url);
    const communityId = url.searchParams.get("communityId");
    if (!communityId) {
      return NextResponse.json([]);
    }

    const membership = await prisma.communityMember.findUnique({
      where: {
        communityId_userId: {
          communityId,
          userId: session.user.id,
        },
      },
    });

    if (!membership && !session.user.isAdmin) {
      return NextResponse.json({ error: "Not authorized for this community" }, { status: 403 });
    }

    const sessions = await prisma.session.findMany({
      where: { communityId },
      orderBy: { createdAt: "desc" },
      include: {
        courts: true,
        players: {
          include: { user: { select: { id: true, name: true, elo: true } } },
        },
      },
    });

    if (sessions.length === 0) {
      return NextResponse.json(sessions);
    }

    const userIds = Array.from(new Set(sessions.flatMap((s) => s.players.map((p) => p.userId))));
    const communityEloByUserId = await getCommunityEloByUserId(communityId, userIds);
    const sessionsWithCommunityElo = sessions.map((s) => ({
      ...s,
      players: withCommunityElo(s.players, communityEloByUserId),
    }));

    return NextResponse.json(sessionsWithCommunityElo);
  } catch (error) {
    console.error("Session list error:", error);
    return NextResponse.json({ error: "Failed to load tournaments" }, { status: 500 });
  }
}
