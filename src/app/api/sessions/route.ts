import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: "Unauthorized: Admin only" }, { status: 403 });
    }

    const body = await request.json();
    const { name, playerIds = [] } = body;

    if (!name) {
      return NextResponse.json({ error: "Session name required" }, { status: 400 });
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
    const uniquePlayerIds = Array.from(new Set([...(Array.isArray(playerIds) ? playerIds : []), session.user.id]));

    console.log("Creating session with players:", uniquePlayerIds);

    const newSession = await prisma.session.create({
      data: {
        code,
        name,
        courts: {
          create: [
            { courtNumber: 1 },
            { courtNumber: 2 },
            { courtNumber: 3 },
          ],
        },
        players: {
          create: uniquePlayerIds.map((pid) => ({
            userId: pid,
            sessionPoints: 0,
          })),
        },
      },
      include: {
        courts: true,
        players: {
          include: { user: { select: { id: true, name: true, email: true, elo: true } } },
        },
      },
    });

    return NextResponse.json(newSession);
  } catch (error: any) {
    console.error("Session creation error details:", error);
    return NextResponse.json({ error: `Failed to create session: ${error.message || 'Unknown error'}` }, { status: 500 });
  }
}

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const where = session.user.isAdmin 
    ? {} 
    : { players: { some: { userId: session.user.id } } };

  const sessions = await prisma.session.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      courts: true,
      players: {
        include: { user: { select: { id: true, name: true, elo: true } } },
      },
    },
  });

  return NextResponse.json(sessions);
}
