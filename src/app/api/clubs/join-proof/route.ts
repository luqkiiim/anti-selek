import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { joinRequestAccess } from "@/lib/clubJoinRequests";
import { rateLimit } from "@/lib/rateLimit";
import { CLUB_COMMUNITY_COMPAT_COOKIE_PATH, CLUB_JOIN_COOKIE_PATH, clubJoinProofCookieName, clubJoinProofCookieOptions, issueClubJoinProof } from "@/lib/clubJoinProof";

const proofRequestSchema = z.object({
  clubId: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(256),
}).strict();

function sameOriginJsonRequest(request: Request) {
  const destination = new URL(request.url);
  destination.host = request.headers.get("host") ?? destination.host;
  return request.headers.get("origin") === destination.origin &&
    !!request.headers.get("content-type")?.startsWith("application/json");
}

function errorResponse(error: string, status: number, code?: string) {
  return NextResponse.json(
    { error, ...(code ? { code } : {}) },
    { status, headers: { "Cache-Control": "no-store, private" } },
  );
}

export async function POST(request: Request) {
  const limited = await rateLimit(request, "api:club-join-proof", { limit: 8, windowMs: 60_000 });
  if (limited) return limited;

  const access = await joinRequestAccess(request);
  if (access.response) return access.response;
  if (!sameOriginJsonRequest(request)) return errorResponse("Invalid request origin", 403);

  const account = await prisma.user.findUnique({ where: { id: access.userId }, select: { isActive: true } });
  if (!account?.isActive) return errorResponse("An active account is required", 403);

  const parsed = proofRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("Club code and password are required", 400);

  const club = await prisma.club.findUnique({
    where: { id: parsed.data.clubId },
    select: { id: true, isTutorial: true, isPasswordProtected: true, passwordHash: true },
  });
  if (!club || club.isTutorial) return errorResponse("Club not found", 404);
  if (!club.isPasswordProtected) return errorResponse("This club does not require a password", 409, "PASSWORD_NOT_REQUIRED");

  let passwordMatches = false;
  try {
    passwordMatches = await bcrypt.compare(parsed.data.password, club.passwordHash ?? "");
  } catch {
    passwordMatches = false;
  }
  if (!passwordMatches) return errorResponse("The club password is incorrect.", 403, "INVALID_PASSWORD");

  let proof: ReturnType<typeof issueClubJoinProof>;
  try {
    proof = issueClubJoinProof({
      userId: access.userId,
      clubId: club.id,
      passwordHash: club.passwordHash,
    });
  } catch {
    return errorResponse("Password verification is temporarily unavailable.", 503, "PASSWORD_PROOF_UNAVAILABLE");
  }
  const response = NextResponse.json(
    { ok: true, clubId: club.id, expiresAt: proof.expiresAt.toISOString() },
    { headers: { "Cache-Control": "no-store, private" } },
  );
  for (const path of [CLUB_JOIN_COOKIE_PATH, CLUB_COMMUNITY_COMPAT_COOKIE_PATH]) {
    response.cookies.set(clubJoinProofCookieName(club.id, path), proof.token, clubJoinProofCookieOptions(request, proof.expiresAt, path));
  }
  return response;
}
