export interface ProfileCommunityRankMember {
  userId: string;
  name: string;
  elo: number;
  isLeaderboardEligible?: boolean;
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

export interface CommunityLeaderboardRankMovement {
  currentRank: number;
  previousRank: number | null;
  rankDelta: number | null;
}

function rankMembers(
  userId: string,
  membersById: Map<string, ProfileCommunityRankMember>
) {
  const rankedMembers = rankAllMembers(membersById);
  const rank =
    rankedMembers.findIndex((member) => member.userId === userId) + 1 || null;

  return {
    leaderboardSize: rankedMembers.length,
    rank,
  };
}

function rankAllMembers(membersById: Map<string, ProfileCommunityRankMember>) {
  return [...membersById.values()].sort(
    (left, right) =>
      right.elo - left.elo ||
      left.name.localeCompare(right.name, undefined, {
        sensitivity: "base",
      })
  );
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

function buildEligibleMemberMaps(members: ProfileCommunityRankMember[]) {
  const eligibleMembers = members.filter(
    (member) => member.isLeaderboardEligible !== false
  );

  return {
    currentMembersById: new Map(
      eligibleMembers.map((member) => [member.userId, { ...member }])
    ),
    previousMembersById: new Map(
      eligibleMembers.map((member) => [member.userId, { ...member }])
    ),
  };
}

function rollbackRankWindow(
  previousMembersById: Map<string, ProfileCommunityRankMember>,
  matchesSinceWindowStart: ProfileCommunityRankMatch[],
  resolveUserId: (userId: string) => string
) {
  for (const match of matchesSinceWindowStart) {
    const team1Delta = match.team1EloChange ?? 0;
    const team2Delta = match.team2EloChange ?? 0;

    for (const participantId of [match.team1User1Id, match.team1User2Id]) {
      applyRollbackDelta(previousMembersById, resolveUserId(participantId), team1Delta);
    }

    for (const participantId of [match.team2User1Id, match.team2User2Id]) {
      applyRollbackDelta(previousMembersById, resolveUserId(participantId), team2Delta);
    }
  }
}

export function buildProfileCommunityRankWindow(
  userId: string,
  members: ProfileCommunityRankMember[],
  matchesSinceWindowStart: ProfileCommunityRankMatch[]
): ProfileCommunityRankWindow {
  const { currentMembersById, previousMembersById } =
    buildEligibleMemberMaps(members);

  const currentRanking = rankMembers(userId, currentMembersById);

  if (currentRanking.rank === null) {
    return {
      leaderboardSize: currentRanking.leaderboardSize,
      currentRank: null,
      previousRank: null,
      rankDelta: null,
    };
  }

  rollbackRankWindow(
    previousMembersById,
    matchesSinceWindowStart,
    (participantId) => participantId
  );

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

export function buildCommunityLeaderboardRankMovements({
  members,
  matchesSinceWindowStart,
  resolveUserId = (userId) => userId,
}: {
  members: ProfileCommunityRankMember[];
  matchesSinceWindowStart: ProfileCommunityRankMatch[];
  resolveUserId?: (userId: string) => string;
}) {
  const { currentMembersById, previousMembersById } =
    buildEligibleMemberMaps(members);

  rollbackRankWindow(
    previousMembersById,
    matchesSinceWindowStart,
    resolveUserId
  );

  const currentRankByUserId = new Map(
    rankAllMembers(currentMembersById).map((member, index) => [
      member.userId,
      index + 1,
    ])
  );
  const previousRankByUserId = new Map(
    rankAllMembers(previousMembersById).map((member, index) => [
      member.userId,
      index + 1,
    ])
  );

  return new Map(
    [...currentRankByUserId.entries()].map(([userId, currentRank]) => {
      const previousRank = previousRankByUserId.get(userId) ?? null;

      return [
        userId,
        {
          currentRank,
          previousRank,
          rankDelta:
            previousRank === null ? null : previousRank - currentRank,
        } satisfies CommunityLeaderboardRankMovement,
      ];
    })
  );
}
