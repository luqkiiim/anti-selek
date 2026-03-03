import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const { confirmation } = await request.json();

    if (confirmation !== "RESET") {
      return NextResponse.json({ error: "Invalid confirmation text" }, { status: 400 });
    }

    // Use a transaction to reset everything performance-related
    await prisma.$transaction([
      // 1. Reset all players ELO to 1000
      prisma.user.updateMany({
        data: { elo: 1000 }
      }),
      // 2. Delete all matches
      prisma.match.deleteMany({}),
      // 3. Delete all session players
      prisma.sessionPlayer.deleteMany({}),
      // 4. Delete all sessions
      prisma.session.deleteMany({}),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Community reset error:", error);
    return NextResponse.json({ error: `Failed to reset community: ${error.message}` }, { status: 500 });
  }
}
