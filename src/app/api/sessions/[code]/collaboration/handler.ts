import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { admissionTransaction, ClubAdmissionError } from "@/lib/clubAdmissions";
import { IdentityConflictError } from "@/lib/playerIdentity";
import { sportingJson } from "@/lib/sportingResponse";
import { rateLimit } from "@/lib/rateLimit";
import { isQuickAccessSession } from "@/lib/quickAccess";
import { logError, safeErrorResponse } from "@/lib/errors";
import {
  getCollaborationState,
  type CollaborationActor,
} from "@/lib/sessionCollaboration";
export async function collaborationRoute(
  request: Request,
  params: Promise<{ code: string; rowId?: string }>,
  write: boolean,
  operation: (
    db: Prisma.TransactionClient,
    sessionId: string,
    actor: CollaborationActor,
    body: Record<string, unknown>,
    rowId?: string,
  ) => Promise<unknown>,
) {
  try {
    const actorSession = await auth();
    if (!actorSession?.user?.id)
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    if (isQuickAccessSession(actorSession))
      return sportingJson({ error: "Not authorized" }, { status: 403 });
    const limited = await rateLimit(
      request,
      `api:collaboration:${write ? "write" : "read"}`,
      { limit: write ? 60 : 120, windowMs: 60000 },
    );
    if (limited) return limited;
    const { code, rowId } = await params;
    const session = await prisma.session.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!session)
      return sportingJson({ error: "Session not found" }, { status: 404 });
    const actor = {
      userId: actorSession.user.id,
      isGlobalAdmin: !!actorSession.user.isAdmin,
    };
    const body = write ? await request.json().catch(() => ({})) : {};
    if (!body || typeof body !== "object" || Array.isArray(body))
      return sportingJson({ error: "Invalid request" }, { status: 400 });
    await getCollaborationState(prisma, session.id, actor);
    const result = write
      ? await admissionTransaction(prisma, (db) =>
          operation(db, session.id, actor, body, rowId),
        )
      : await operation(prisma, session.id, actor, body, rowId);
    return sportingJson(result);
  } catch (error) {
    if (
      error instanceof IdentityConflictError ||
      error instanceof ClubAdmissionError
    )
      return sportingJson(
        { error: error.message },
        { status: error.statusCode },
      );
    logError("Collaboration request failed", error);
    return safeErrorResponse();
  }
}
