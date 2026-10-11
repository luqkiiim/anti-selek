import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { rateLimit } from "./rateLimit";
import { isQuickAccessSession } from "./quickAccess";
import { admissionTransaction, ClubAdmissionError } from "./clubAdmissions";
import { disconnectRemovedPlayer, PlayerReleaseError, removedOwnedPlayers } from "./playerOwnershipRelease";
const headers = { "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
function failure(error: unknown) {
  if (error instanceof PlayerReleaseError) return json({ error: error.message, code: error.code }, error.statusCode);
  if (error instanceof ClubAdmissionError) return json({ error: error.message }, error.statusCode);
  console.error("Player disconnect failed", { code: "PLAYER_RELEASE_INTERNAL_ERROR" });
  return json({ error: "Unable to disconnect this account. Refresh and try again." }, 500);
}
async function principal() {
  const session = await auth();
  if (!session?.user?.id || isQuickAccessSession(session)) throw new PlayerReleaseError("Sign in with an account.", "ACCOUNT_REQUIRED", 401);
  return session.user.id;
}
export async function removedPlayersGet(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const limited = await rateLimit(request, "api:removed-players", { limit: 20, windowMs: 60_000 }); if (limited) return limited;
    const { id: clubId } = await context.params;
    if (!id.safeParse(clubId).success) return json({ error: "Invalid club." }, 400);
    return json(await removedOwnedPlayers(prisma, clubId, await principal()));
  } catch (error) { return failure(error); }
}
export async function ownershipReleasePost(request: Request, context: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const limited = await rateLimit(request, "api:disconnect-player", { limit: 15, windowMs: 60_000 }); if (limited) return limited;
    const destination = new URL(request.url); destination.host = request.headers.get("host") ?? destination.host;
    if (request.headers.get("origin") !== destination.origin || !request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "Same-origin JSON request required." }, 403);
    const { id: clubId, userId: playerId } = await context.params;
    if (!id.safeParse(clubId).success || !id.safeParse(playerId).success || !z.object({ confirm: z.literal(true) }).strict().safeParse(await request.json().catch(() => null)).success) return json({ error: "Confirm the selected Player disconnect." }, 400);
    const actorUserId = await principal();
    return json(await admissionTransaction(prisma, tx => disconnectRemovedPlayer(tx, { clubId, playerId, actorUserId })));
  } catch (error) { return failure(error); }
}
