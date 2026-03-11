export interface MatchApprovalTeams {
  team1User1Id: string;
  team1User2Id: string;
  team2User1Id: string;
  team2User2Id: string;
}

export function getTeamNumberForUserId(
  match: MatchApprovalTeams,
  userId: string
): 1 | 2 | null {
  if ([match.team1User1Id, match.team1User2Id].includes(userId)) {
    return 1;
  }
  if ([match.team2User1Id, match.team2User2Id].includes(userId)) {
    return 2;
  }
  return null;
}

export function shouldRequireOpponentApproval({
  match,
  submitterUserId,
  submitterIsAdmin,
  claimedByUserId,
}: {
  match: MatchApprovalTeams;
  submitterUserId: string;
  submitterIsAdmin: boolean;
  claimedByUserId: ReadonlyMap<string, boolean>;
}): boolean {
  const submitterTeam = getTeamNumberForUserId(match, submitterUserId);

  if (!submitterTeam) {
    return !submitterIsAdmin;
  }

  const opposingTeamUserIds =
    submitterTeam === 1
      ? [match.team2User1Id, match.team2User2Id]
      : [match.team1User1Id, match.team1User2Id];

  return opposingTeamUserIds.some((userId) => claimedByUserId.get(userId) === true);
}

export function canApprovePendingSubmission({
  match,
  approverUserId,
  approverIsAdmin,
  approverIsClaimed,
  scoreSubmittedByUserId,
}: {
  match: MatchApprovalTeams;
  approverUserId: string;
  approverIsAdmin: boolean;
  approverIsClaimed: boolean;
  scoreSubmittedByUserId?: string | null;
}): boolean {
  if (approverIsAdmin) {
    return true;
  }

  if (!approverIsClaimed || !scoreSubmittedByUserId) {
    return false;
  }

  const approverTeam = getTeamNumberForUserId(match, approverUserId);
  const submitterTeam = getTeamNumberForUserId(match, scoreSubmittedByUserId);

  if (!approverTeam || !submitterTeam) {
    return false;
  }

  return approverTeam !== submitterTeam;
}
