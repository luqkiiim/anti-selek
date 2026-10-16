import { collaborationEvent, isUpgradedCollaboration } from "@/lib/sessionCollaboration";
import { IdentityConflictError } from "@/lib/playerIdentity";
import { admissionTransaction, ClubAdmissionError } from "@/lib/clubAdmissions";
import { sportingJson } from "@/lib/sportingResponse";
import { auth } from "@/lib/auth";
import { logError, safeErrorResponse } from "@/lib/errors";
import { withLegacyClubAliases } from "@/lib/clubContractAliases";
import { prisma } from "@/lib/prisma";
import { getAccountClubContext } from "@/lib/playerIdentity";
import {
  checkInvalidTargetRateLimit,
  invalidTargetResponse,
  rateLimit,
} from "@/lib/rateLimit";
import { isQuickAccessSession } from "@/lib/quickAccess";
import {
  SessionClubRole,
  SessionClubStatus,
} from "@/types/enums";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const rateLimitResponse = await rateLimit(
      request,
      "api:sessions:code:collab:patch",
      { limit: 15, windowMs: 60_000 }
    );
    if (rateLimitResponse) return rateLimitResponse;

    const session = await auth();
    if (!session?.user?.id) {
      return sportingJson({ error: "Not authenticated" }, { status: 401 });
    }
    if (isQuickAccessSession(session)) {
      return invalidTargetResponse(request, "api:sessions:code:collab");
    }

    const { code } = await params;
    if (typeof code !== "string" || code.length === 0) {
      return sportingJson(
        { error: "Invalid request parameters" },
        { status: 400 }
      );
    }

    const invalidTargetLimitResponse = await checkInvalidTargetRateLimit(
      request,
      "api:sessions:code:collab"
    );
    if (invalidTargetLimitResponse) return invalidTargetLimitResponse;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return sportingJson({ error: "Invalid request body" }, { status: 400 });
    }

    const { status } = body as { status?: unknown };
    if (
      status !== SessionClubStatus.ACCEPTED &&
      status !== SessionClubStatus.REJECTED
    ) {
      return sportingJson({ error: "Invalid collab status" }, { status: 400 });
    }

    const sessionData = await prisma.session.findUnique({
      where: { code },
      select: {
        id: true,
        status: true,
        sessionClubs: {
          where: {
            role: SessionClubRole.PARTNER,
            status: SessionClubStatus.PENDING,
          },
          select: {
            id: true,
            clubId: true,
            club: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    if (!sessionData || sessionData.sessionClubs.length === 0) {
      return invalidTargetResponse(request, "api:sessions:code:collab");
    }

    const partnerLink = sessionData.sessionClubs[0];
    const partnerClubContext = await getAccountClubContext(prisma, {
      userId: session.user.id,
      clubId: partnerLink.clubId,
      isGlobalAdmin: !!session.user.isAdmin,
    });
    if (!partnerClubContext.canAdmin) {
      return invalidTargetResponse(request, "api:sessions:code:collab");
    }

    const updated = await admissionTransaction(prisma, async tx => {
      const freshContext = await getAccountClubContext(tx, { userId: session.user.id, clubId: partnerLink.clubId, isGlobalAdmin: !!session.user.isAdmin });
      if (!freshContext.canAdmin) throw new IdentityConflictError("Your partner club access changed. Refresh before reviewing this tournament.");
      const current = await tx.session.findUnique({where:{id:sessionData.id},select:{status:true,collaborationVersion:true}});
      if (current && isUpgradedCollaboration(current)) {
        if(current.status !== "WAITING") throw new IdentityConflictError("This invitation is no longer open.");
        await collaborationEvent(tx,sessionData.id,session.user.id,"INVITATION_REVIEW",{status,clubId:partnerLink.clubId});
      }
      const freshLink = await tx.sessionClub.findUnique({ where: { id: partnerLink.id }, select: { status: true } });
      if (freshLink?.status !== SessionClubStatus.PENDING) throw new IdentityConflictError("This collaboration invitation was already reviewed.");
      return tx.sessionClub.update({
      where: { id: partnerLink.id },
      data: {
        status,
        reviewedById: session.user.id,
        reviewedAt: new Date(),
      },
      include: {
        club: { select: { id: true, name: true } },
      },
    });

    });
    return sportingJson(withLegacyClubAliases({
      id: updated.id,
      clubId: updated.clubId,
      clubName: updated.club.name,
      role: updated.role,
      status: updated.status,
      reviewedAt: updated.reviewedAt,
    }));
  } catch (error) {
    if (error instanceof IdentityConflictError || error instanceof ClubAdmissionError) return sportingJson({ error: error.message }, { status: 409 });
    logError("Review collab session error", error);
    return safeErrorResponse();
  }
}
