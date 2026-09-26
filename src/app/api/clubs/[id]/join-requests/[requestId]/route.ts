import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { joinRequestAccess } from "@/lib/clubJoinRequests";
import { safeErrorResponse, logError } from "@/lib/errors";
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  try {
    const { id, requestId } = await params;
    const access = await joinRequestAccess(request, id);
    if (access.response) return access.response;
    const body = await request.json().catch(() => null);
    if (!["APPROVE", "REJECT"].includes(body?.action))
      return NextResponse.json(
        { error: "Invalid review action" },
        { status: 400 },
      );
    const result = await prisma.$transaction(async (tx) => {
      const entry = await tx.clubJoinRequest.findFirst({
        where: { id: requestId, clubId: id },
      });
      if (!entry) return { error: "Request not found", status: 404 };
      if (entry.status !== "PENDING")
        return {
          error: "This request has already been reviewed.",
          status: 409,
        };
      const changed = await tx.clubJoinRequest.updateMany({
        where: { id: requestId, clubId: id, status: "PENDING" },
        data: {
          status: body.action === "APPROVE" ? "APPROVED" : "REJECTED",
          reviewedAt: new Date(),
          reviewedById: access.userId,
        },
      });
      if (changed.count !== 1)
        return {
          error: "This request has already been reviewed.",
          status: 409,
        };
      if (body.action === "APPROVE")
        await tx.clubMember.upsert({
          where: { clubId_userId: { clubId: id, userId: entry.userId } },
          create: { clubId: id, userId: entry.userId, role: "MEMBER" },
          update: {},
        });
      return { status: 200 };
    });
    return NextResponse.json(
      result.error ? { error: result.error } : { ok: true },
      { status: result.status },
    );
  } catch (e) {
    logError("Review club join request", e);
    return safeErrorResponse();
  }
}
