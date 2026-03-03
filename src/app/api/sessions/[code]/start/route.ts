import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { code } = await params;
  const sessionData = await prisma.session.findUnique({
    where: { code },
    include: { players: true },
  });

  if (!sessionData) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Check admin
  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  const adminEmails = process.env.ADMIN_EMAILS?.split(",").map(e => e.trim()) || [];
  if (!user || !adminEmails.includes(user.email)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  if (sessionData.status !== "WAITING") {
    return NextResponse.json({ error: "Session already started" }, { status: 400 });
  }

  const updated = await prisma.session.update({
    where: { code },
    data: { status: "ACTIVE" },
    include: {
      courts: { include: { currentMatch: true } },
      players: {
        include: { user: { select: { id: true, name: true, elo: true } } },
      },
    },
  });

  return NextResponse.json(updated);
}
