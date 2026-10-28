import type { Prisma } from "@prisma/client";
import { SessionRouteError } from "@/app/api/sessions/sessionRouteShared";

/** Called after reserving the session writer, alongside match assignment writers. */
export async function setSessionCourtCount(
  tx: Prisma.TransactionClient,
  sessionId: string,
  courtCount: number,
) {
  const session = await tx.session.findUnique({
    where: { id: sessionId },
    select: {
      status: true,
      courts: {
        select: {
          courtNumber: true,
          currentMatchId: true,
          matches: {
            where: { status: { in: ["PENDING", "IN_PROGRESS", "PENDING_APPROVAL"] } },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!session || !["WAITING", "ACTIVE"].includes(session.status)) {
    throw new SessionRouteError("Court count can only change before or during a session", 409);
  }
  const busyCourt = session.courts.find(
    court => court.courtNumber > courtCount && (court.currentMatchId || court.matches.length > 0),
  );
  if (busyCourt) {
    throw new SessionRouteError(`Finish or clear the match on Court ${busyCourt.courtNumber} before reducing courts`, 409);
  }

  // Never delete a court: Match.courtId cascades on deletion.
  await tx.court.updateMany({
    where: { sessionId, courtNumber: { gt: courtCount } },
    data: { isActive: false },
  });
  await tx.court.updateMany({
    where: { sessionId, courtNumber: { lte: courtCount } },
    data: { isActive: true },
  });
  const existingNumbers = new Set(session.courts.map(court => court.courtNumber));
  const newCourts = Array.from({ length: courtCount }, (_, index) => index + 1)
    .filter(courtNumber => !existingNumbers.has(courtNumber));
  if (newCourts.length) {
    await tx.court.createMany({ data: newCourts.map(courtNumber => ({ sessionId, courtNumber })) });
  }
}
