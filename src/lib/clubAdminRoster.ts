import { prisma } from "./prisma";
import { getClubRoster } from "./clubRoster";
import { getClubStatUserResolver } from "./offlineIdentities";

/** Admin controls need roster identities and match counts, not dashboard history. */
export async function getClubAdminRoster(clubId: string) {
  const [roster, matches] = await Promise.all([
    getClubRoster(prisma, clubId),
    prisma.match.findMany({
      where: { status: "COMPLETED", session: { isTest: false, OR: [{ clubId }, { sessionClubs: { some: { clubId, status: "ACCEPTED" } } }] } },
      select: { team1Player1Id: true, team1Player2Id: true, team2Player1Id: true, team2Player2Id: true, winnerTeam: true },
    }),
  ]);
  const resolve = await getClubStatUserResolver(prisma, { clubId, memberUserIds: roster.map(p => p.id) });
  const stats = new Map(roster.map(p => [p.id, { wins: 0, losses: 0, matchesPlayed: 0 }]));
  for (const match of matches) {
    const teams = [[match.team1Player1Id, match.team1Player2Id].map(resolve), [match.team2Player1Id, match.team2Player2Id].map(resolve)];
    for (const id of new Set(teams.flat())) {
      const stat = stats.get(id);
      if (stat) stat.matchesPlayed++;
    }
    if (match.winnerTeam !== 1 && match.winnerTeam !== 2) continue;
    teams.forEach((team, index) => team.forEach(id => {
      const stat = stats.get(id);
      if (stat) { if (index + 1 === match.winnerTeam) stat.wins++; else stat.losses++; }
    }));
  }
  return roster.map(p => ({ ...p, ...stats.get(p.id)! }));
}
