import type { Prisma } from "@prisma/client";

interface GuestRatingMatch {
  team1User1Id: string;
  team1User2Id: string;
  team2User1Id: string;
  team2User2Id: string;
  team1EloChange: number | null;
  team2EloChange: number | null;
}

// User.elo remains the guest's starting rating; completed results supply the gains/losses.
export function guestRatingFromMatches(userId: string, startingRating: number, matches: GuestRatingMatch[]) {
  return matches.reduce((rating, match) => {
    if (match.team1User1Id === userId || match.team1User2Id === userId) return rating + (match.team1EloChange ?? 0);
    if (match.team2User1Id === userId || match.team2User2Id === userId) return rating + (match.team2EloChange ?? 0);
    return rating;
  }, startingRating);
}

export async function getGuestRating(tx: Prisma.TransactionClient, userId: string, startingRating: number) {
  const matches = await tx.match.findMany({
    where: {
      status: "COMPLETED",
      session: { isTest: false, players: { some: { userId, isGuest: true } } },
      OR: [{ team1User1Id: userId }, { team1User2Id: userId }, { team2User1Id: userId }, { team2User2Id: userId }],
    },
    select: { team1User1Id: true, team1User2Id: true, team2User1Id: true, team2User2Id: true, team1EloChange: true, team2EloChange: true },
  });
  return guestRatingFromMatches(userId, startingRating, matches);
}

export async function getGuestRatingsByUserId(
  tx: Prisma.TransactionClient,
  guests: Array<{ userId: string; startingRating: number }>
): Promise<Map<string, number>> {
  if (!guests.length) return new Map();
  const userIds = [...new Set(guests.map(guest => guest.userId))];
  const matches = await tx.match.findMany({
    where: {
      status: "COMPLETED",
      session: { isTest: false, players: { some: { userId: { in: userIds }, isGuest: true } } },
      OR: [{ team1User1Id: { in: userIds } }, { team1User2Id: { in: userIds } }, { team2User1Id: { in: userIds } }, { team2User2Id: { in: userIds } }],
    },
    select: {
      team1User1Id: true, team1User2Id: true, team2User1Id: true, team2User2Id: true,
      team1EloChange: true, team2EloChange: true,
      session: { select: { players: { where: { userId: { in: userIds }, isGuest: true }, select: { userId: true } } } },
    },
  });
  return new Map(guests.map(guest => [guest.userId, guestRatingFromMatches(
    guest.userId, guest.startingRating,
    matches.filter(match => match.session.players.some(player => player.userId === guest.userId))
  )]));
}
