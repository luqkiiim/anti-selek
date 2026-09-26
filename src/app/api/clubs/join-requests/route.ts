import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { joinRequestAccess } from "@/lib/clubJoinRequests";
import { safeErrorResponse, logError } from "@/lib/errors";
export async function POST(request: Request) {
  try {
    const access = await joinRequestAccess(request);
    if (access.response) return access.response;
    const body = await request.json().catch(() => null);
    if (typeof body?.clubId !== "string")
      return NextResponse.json(
        { error: "Use a valid club invite link." },
        { status: 400 },
      );
    const result = await prisma.$transaction(async (tx) => {
      const club = await tx.club.findUnique({
        where: { id: body.clubId },
        select: { id: true, allowJoinRequests: true, isTutorial: true },
      });
      if (!club || club.isTutorial)
        return { error: "Club not found.", status: 404 };
      const membership = await tx.clubMember.findUnique({
        where: { clubId_userId: { clubId: club.id, userId: access.userId } },
      });
      if (membership)
        return { status: 200, data: { status: "MEMBER", clubId: club.id } };
      if (!club.allowJoinRequests)
        return {
          error: "This club is not accepting join requests.",
          status: 403,
        };
      const entry = await tx.clubJoinRequest.upsert({
        where: { clubId_userId: { clubId: club.id, userId: access.userId } },
        create: { clubId: club.id, userId: access.userId },
        update: { status: "PENDING", reviewedAt: null, reviewedById: null },
      });
      return {
        status: 200,
        data: { id: entry.id, status: entry.status, clubId: club.id },
      };
    });
    return NextResponse.json(result.data || { error: result.error }, {
      status: result.status,
    });
  } catch (e) {
    logError("Create club join request", e);
    return safeErrorResponse();
  }
}
