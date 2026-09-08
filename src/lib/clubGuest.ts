import type { Prisma } from "@prisma/client";

// Match the exact identity and the club represented in the original tournament.
export function clubGuestWhere(clubId: string, userId: string): Prisma.SessionPlayerWhereInput {
  return {
    userId,
    isGuest: true,
    session: { isTest: false, status: "COMPLETED" },
    OR: [
      { representingClubId: null, session: { clubId } },
      { representingClubId: clubId, session: { OR: [
        { clubId },
        { sessionClubs: { some: { clubId, status: "ACCEPTED" } } },
      ] } },
    ],
  };
}
