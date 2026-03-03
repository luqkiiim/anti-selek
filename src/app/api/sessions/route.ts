import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function generateCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { name } = await request.json();

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
        create: {
          userId: session.user.id,
          sessionPoints: 0,
        },
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
}

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sessions = await prisma.session.findMany({
    where: {
      players: { some: { userId: session.user.id } },
    },
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
