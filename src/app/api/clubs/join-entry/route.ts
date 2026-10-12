import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { joinRequestAccess } from "@/lib/clubJoinRequests";
import { admissionError } from "@/lib/clubAdmissionApi";
import { sameOriginJsonGuard, setClubEntryCookie, signClubEntryProof, verifyClubEntryPassword } from "@/lib/clubJoinEntry";
const schema = z.object({ clubId: z.string().min(1).max(100), password: z.string().max(256) }).strict();
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
export async function POST(request: Request) {
  try {
    const guard = sameOriginJsonGuard(request); if (guard) return guard;
    const access = await joinRequestAccess(request); if (access.response) return access.response;
    const input = schema.safeParse(await request.json().catch(() => null));
    if (!input.success) return json({ error: "Enter a club and join code" }, 400);
    const [club, account] = await Promise.all([
      prisma.club.findUnique({ where: { id: input.data.clubId }, select: { id: true, isTutorial: true, allowJoinRequests: true, isPasswordProtected: true, passwordHash: true } }),
      prisma.user.findUnique({ where: { id: access.userId }, select: { id: true, isActive: true, sessionVersion: true } }),
    ]);
    if (!club || club.isTutorial) return json({ error: "Club not found" }, 404);
    if (!account?.isActive) return json({ error: "An active account is required" }, 403);
    if (!club.allowJoinRequests) return json({ error: "This club is not accepting join requests" }, 403);
    const proof = await verifyClubEntryPassword(club, account, input.data.password);
    if (!proof) return json({ error: "Invalid join code", code: "INVALID_JOIN_CODE" }, 403);
    const response = json({ clubId: club.id, verified: true });
    setClubEntryCookie(response, request, club.id, await signClubEntryProof(proof));
    return response;
  } catch (error) { return admissionError(error); }
}
