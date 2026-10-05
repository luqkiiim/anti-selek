import type { Prisma } from "@prisma/client";
import { withLegacySportingAliases } from "@/lib/sportingIdentity";

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
      session: { isTest: false, players: { some: { playerId: userId, isGuest: true } } },
      OR: [{ team1Player1Id: userId }, { team1Player2Id: userId }, { team2Player1Id: userId }, { team2Player2Id: userId }],
    },
    select: { team1Player1Id: true, team1Player2Id: true, team2Player1Id: true, team2Player2Id: true, team1EloChange: true, team2EloChange: true },
  });
  return guestRatingFromMatches(userId, startingRating, withLegacySportingAliases(matches));
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
      session: { isTest: false, players: { some: { playerId: { in: userIds }, isGuest: true } } },
      OR: [{ team1Player1Id: { in: userIds } }, { team1Player2Id: { in: userIds } }, { team2Player1Id: { in: userIds } }, { team2Player2Id: { in: userIds } }],
    },
    select: {
      team1Player1Id: true, team1Player2Id: true, team2Player1Id: true, team2Player2Id: true,
      team1EloChange: true, team2EloChange: true,
      session: { select: { players: { where: { playerId: { in: userIds }, isGuest: true }, select: { playerId: true } } } },
    },
  });
  return new Map(guests.map(guest => [guest.userId, guestRatingFromMatches(
    guest.userId, guest.startingRating,
    withLegacySportingAliases(matches.filter(match => match.session.players.some(player => player.playerId === guest.userId)))
  )]));
}
