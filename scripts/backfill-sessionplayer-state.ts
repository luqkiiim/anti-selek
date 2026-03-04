import { prisma } from "../src/lib/prisma";

async function backfill() {
  console.log("Starting backfill for SessionPlayer matchmaking state...");

  const sessionPlayers = await prisma.sessionPlayer.findMany({
    include: {
      session: true,
      user: true,
    },
  });

  for (const sp of sessionPlayers) {
    const matches = await prisma.match.findMany({
      where: {
        sessionId: sp.sessionId,
        status: "COMPLETED",
        OR: [
          { team1User1Id: sp.userId },
          { team1User2Id: sp.userId },
          { team2User1Id: sp.userId },
          { team2User2Id: sp.userId },
        ],
      },
      orderBy: {
        completedAt: "desc",
      },
    });

    const matchesPlayed = matches.length;
    const lastPlayedAt = matches.length > 0 ? matches[0].completedAt : null;
    const joinedAt = sp.session.createdAt;

    let availableSince = joinedAt;
    if (sp.isPaused) {
      availableSince = new Date();
    } else if (lastPlayedAt) {
      availableSince = lastPlayedAt;
    }

    await prisma.sessionPlayer.update({
      where: { id: sp.id },
      data: {
        matchesPlayed,
        lastPlayedAt,
        joinedAt,
        availableSince,
      },
    });
  }

  console.log(`Backfilled ${sessionPlayers.length} SessionPlayer records.`);
}

backfill()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
