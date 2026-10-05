import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { joinRequestAccess } from "@/lib/clubJoinRequests";
import { safeErrorResponse, logError } from "@/lib/errors";
type Context = { params: Promise<{ id: string }> };
export { adminAdmissionListApi as GET } from "@/lib/clubAdmissionApi";
export async function PATCH(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const access = await joinRequestAccess(request, id);
    if (access.response) return access.response;
    const body = await request.json().catch(() => null);
    if (typeof body?.allowJoinRequests !== "boolean")
      return NextResponse.json(
        { error: "Invalid join request setting" },
        { status: 400 },
      );
    await prisma.club.update({
      where: { id },
      data: { allowJoinRequests: body.allowJoinRequests },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logError("Update club join requests", e);
    return safeErrorResponse();
  }
}
