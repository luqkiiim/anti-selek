export interface ProfileCommunityRankMember {
  userId: string;
  name: string;
  elo: number;
}

export interface ProfileCommunityRankMatch {
  team1User1Id: string;
  team1User2Id: string;
  team2User1Id: string;
  team2User2Id: string;
  team1EloChange: number | null;
  team2EloChange: number | null;
}

export interface ProfileCommunityRankWindow {
  leaderboardSize: number;
  currentRank: number | null;
  previousRank: number | null;
  rankDelta: number | null;
}

function rankMembers(
  userId: string,
  membersById: Map<string, ProfileCommunityRankMember>
) {
  const rankedMembers = [...membersById.values()].sort(
    (left, right) =>
      right.elo - left.elo ||
      left.name.localeCompare(right.name, undefined, {
        sensitivity: "base",
      })
  );
  const rank =
    rankedMembers.findIndex((member) => member.userId === userId) + 1 || null;

  return {
    leaderboardSize: rankedMembers.length,
    rank,
  };
}

function applyRollbackDelta(
  membersById: Map<string, ProfileCommunityRankMember>,
  userId: string,
  delta: number
) {
  const member = membersById.get(userId);
  if (!member) {
    return;
  }

  member.elo -= delta;
}

export function buildProfileCommunityRankWindow(
  userId: string,
  members: ProfileCommunityRankMember[],
  matchesSinceWindowStart: ProfileCommunityRankMatch[]
): ProfileCommunityRankWindow {
  const currentMembersById = new Map(
    members.map((member) => [member.userId, { ...member }])
  );
  const previousMembersById = new Map(
    members.map((member) => [member.userId, { ...member }])
  );

  const currentRanking = rankMembers(userId, currentMembersById);

  if (currentRanking.rank === null) {
    return {
      leaderboardSize: currentRanking.leaderboardSize,
      currentRank: null,
      previousRank: null,
      rankDelta: null,
    };
  }

  for (const match of matchesSinceWindowStart) {
    const team1Delta = match.team1EloChange ?? 0;
    const team2Delta = match.team2EloChange ?? 0;

    for (const participantId of [match.team1User1Id, match.team1User2Id]) {
      applyRollbackDelta(previousMembersById, participantId, team1Delta);
    }

    for (const participantId of [match.team2User1Id, match.team2User2Id]) {
      applyRollbackDelta(previousMembersById, participantId, team2Delta);
    }
  }

  const previousRanking = rankMembers(userId, previousMembersById);

  return {
    leaderboardSize: currentRanking.leaderboardSize,
    currentRank: currentRanking.rank,
    previousRank: previousRanking.rank,
    rankDelta:
      currentRanking.rank !== null && previousRanking.rank !== null
        ? previousRanking.rank - currentRanking.rank
        : null,
  };
}
