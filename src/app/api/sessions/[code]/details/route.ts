import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { admissionTransaction, ClubAdmissionError } from "@/lib/clubAdmissions";
import { assertSessionMutationActor } from "@/lib/sessionProfileIdentity";
import { isQuickAccessSession, getQuickAccessDeniedMessage } from "@/lib/quickAccess";
import { rateLimit, checkInvalidTargetRateLimit, invalidTargetResponse } from "@/lib/rateLimit";
import { sportingJson } from "@/lib/sportingResponse";
import { logError, safeErrorResponse } from "@/lib/errors";
import { parseSessionDetails, serializeSessionDetails, sessionDetailsData, SessionDetailsError } from "@/lib/sessionDetails";
import { SessionRouteError } from "../../sessionRouteShared";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const viewer = await auth();
    if (!viewer?.user?.id) return sportingJson({ error: "Not authenticated" }, { status: 401 });
    if (isQuickAccessSession(viewer)) return sportingJson({ error: getQuickAccessDeniedMessage() }, { status: 403 });
    const limit = await rateLimit(request, "api:sessions:details:patch", { limit: 15, windowMs: 60_000 });
    if (limit) return limit;
    const { code } = await params;
    if (!code || code.length > 100) return sportingJson({ error: "Invalid session" }, { status: 400 });
    const invalidLimit = await checkInvalidTargetRateLimit(request, "api:sessions:details");
    if (invalidLimit) return invalidLimit;
    const body = await request.json().catch(() => null);
    const saved = await admissionTransaction(prisma, async tx => {
      const session = await tx.session.findUnique({ where: { code }, include: { courts: { where: { isActive: true } } } });
      if (!session) return null;
      await assertSessionMutationActor(tx, { session, userId: viewer.user.id, isGlobalAdmin: !!viewer.user.isAdmin, hostOnly: true });
      if (!["WAITING", "ACTIVE"].includes(session.status)) throw new SessionRouteError("Completed session details cannot be edited.", 409);
      const details = parseSessionDetails(body?.details, session.courts.map(court => court.courtNumber));
      await tx.session.update({ where: { id: session.id }, data: sessionDetailsData(details) });
      for (const court of session.courts) {
        const booking = details.courtBookings.find(item => item.courtNumber === court.courtNumber);
        await tx.court.update({ where: { id: court.id }, data: {
          bookingStartAt: booking?.startsAt ? new Date(booking.startsAt) : null,
          bookingEndAt: booking?.endsAt ? new Date(booking.endsAt) : null,
        } });
      }
      return { details: serializeSessionDetails({ ...sessionDetailsData(details), courts: session.courts.map(court => {
        const booking = details.courtBookings.find(item => item.courtNumber === court.courtNumber);
        return { courtNumber: court.courtNumber, bookingStartAt: booking?.startsAt, bookingEndAt: booking?.endsAt };
      }) }) };
    });
    return saved ? sportingJson(saved) : invalidTargetResponse(request, "api:sessions:details");
  } catch (error) {
    if (error instanceof SessionDetailsError) return sportingJson({ error: error.message }, { status: 400 });
    if (error instanceof SessionRouteError) return sportingJson({ error: error.message }, { status: error.status });
    if (error instanceof ClubAdmissionError) return sportingJson({ error: error.message }, { status: error.statusCode });
    logError("Save session details", error);
    return safeErrorResponse();
  }
}
