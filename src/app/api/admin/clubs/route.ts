import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canBrowseAllClubs } from "@/lib/globalClubViewer";
import { prisma } from "@/lib/prisma";
import { resolveAvatarUrl } from "@/lib/avatar";
import { logError, safeErrorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;

function decodeCursor(value: string): { id: string; name: string } | null {
  try {
    if (value.length > 2048 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
    const cursor: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!cursor || typeof cursor !== "object") return null;
    const { id, name } = cursor as Record<string, unknown>;
    return typeof id === "string" && id.length > 0 && id.length <= 100 && typeof name === "string" && name.length <= 500 ? { id, name } : null;
  } catch { return null; }
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    if (!(await canBrowseAllClubs(session))) return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    const limited = await rateLimit(request, "api:admin:clubs:get", { limit: 60, windowMs: 60_000 });
    if (limited) return limited;
    const params = new URL(request.url).searchParams;
    const q = (params.get("q") ?? "").trim();
    const rawCursor = params.get("cursor");
    const cursor = rawCursor ? decodeCursor(rawCursor) : null;
    if (q.length > 200 || (rawCursor && !cursor) || params.getAll("cursor").length > 1 || params.getAll("q").length > 1) return NextResponse.json({ error: "Invalid search parameters" }, { status: 400 });
    const rows = await prisma.club.findMany({
      where: {
        isTutorial: false,
        ...(q ? { name: { contains: q } } : {}),
        ...(cursor ? { OR: [{ name: { gt: cursor.name } }, { name: cursor.name, id: { gt: cursor.id } }] } : {}),
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: PAGE_SIZE + 1,
      select: {
        id: true, name: true, avatarKey: true,
        _count: { select: { members: { where: { archivedAt: null, retiredByAdmissionEventId: null } }, sessions: true } },
      },
    });
    const page = rows.slice(0, PAGE_SIZE);
    const last = page.at(-1);
    return NextResponse.json({
      clubs: page.map(club => ({ id: club.id, name: club.name, avatarUrl: resolveAvatarUrl(club.avatarKey), membersCount: club._count.members, sessionsCount: club._count.sessions })),
      nextCursor: rows.length > PAGE_SIZE && last ? Buffer.from(JSON.stringify({ name: last.name, id: last.id })).toString("base64url") : null,
    }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    logError("Browse clubs", error);
    return safeErrorResponse();
  }
}
