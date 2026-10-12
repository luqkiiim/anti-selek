import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { joinRequestAccess } from "@/lib/clubJoinRequests";
import { resolveAvatarUrl } from "@/lib/avatar";
import { admissionError } from "@/lib/clubAdmissionApi";
export async function GET(request: Request) {
  try {
    const access = await joinRequestAccess(request); if (access.response) return access.response;
    const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
    if (q.length > 64) return NextResponse.json({ error: "Search must be 64 characters or fewer" }, { status: 400, headers: { "Cache-Control": "no-store, private" } });
    // SQLite LIKE (Prisma contains) is case-insensitive for club names.
    const clubs = q.length < 2 ? [] : await prisma.club.findMany({
      where: { allowJoinRequests: true, isTutorial: false, name: { contains: q } },
      select: { id: true, name: true, avatarKey: true, isPasswordProtected: true }, orderBy: { name: "asc" }, take: 20,
    });
    return NextResponse.json({ clubs: clubs.map(({ avatarKey, ...club }) => ({ ...club, avatarUrl: resolveAvatarUrl(avatarKey) })) }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) { return admissionError(error); }
}
