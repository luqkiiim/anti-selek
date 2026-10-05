/** Sporting IDs below identify Players. Account IDs are used only for actor checks. */
export type MatchApprovalTeams = {
  team1Player1Id: string; team1Player2Id: string;
  team2Player1Id: string; team2Player2Id: string;
} | {
  team1User1Id: string; team1User2Id: string;
  team2User1Id: string; team2User2Id: string;
};
function teams(match: MatchApprovalTeams): [string[], string[]] {
  return "team1Player1Id" in match
    ? [[match.team1Player1Id, match.team1Player2Id], [match.team2Player1Id, match.team2Player2Id]]
    : [[match.team1User1Id, match.team1User2Id], [match.team2User1Id, match.team2User2Id]];
}
export function getTeamNumberForPlayerId(match: MatchApprovalTeams, playerId: string): 1 | 2 | null {
  const [team1, team2] = teams(match);
  if (team1.includes(playerId)) return 1;
  if (team2.includes(playerId)) return 2;
  return null;
}
/** Existing frontend name; its identifier is a sporting Player ID. */
export const getTeamNumberForUserId = getTeamNumberForPlayerId;
export function shouldRequireOpponentApproval({match, submitterUserId, submitterPlayerId, submitterIsAdmin, claimedByUserId}: {
  match: MatchApprovalTeams; submitterUserId: string; submitterPlayerId?: string | null;
  submitterIsAdmin: boolean; claimedByUserId: ReadonlyMap<string, boolean>;
}): boolean {
  if (submitterIsAdmin) return false;
  const playerId = submitterPlayerId ?? null;
  const submitterTeam = playerId ? getTeamNumberForPlayerId(match, playerId) : null;
  if (!submitterTeam) return true;
  return teams(match)[submitterTeam === 1 ? 1 : 0].some(id => claimedByUserId.get(id) === true);
}
export function canApprovePendingSubmission({match, approverUserId, approverPlayerId, approverIsAdmin, approverIsClaimed, scoreSubmittedByUserId, scoreSubmittedByPlayerId}: {
  match: MatchApprovalTeams; approverUserId: string; approverPlayerId?: string | null;
  approverIsAdmin: boolean; approverIsClaimed: boolean;
  scoreSubmittedByUserId?: string | null; scoreSubmittedByPlayerId?: string | null;
}): boolean {
  if (approverIsAdmin) return true;
  if (!approverIsClaimed || !scoreSubmittedByUserId || approverUserId === scoreSubmittedByUserId) return false;
  const approverId = approverPlayerId ?? null;
  const submitterId = scoreSubmittedByPlayerId ?? null;
  const approverTeam = approverId ? getTeamNumberForPlayerId(match, approverId) : null;
  const submitterTeam = submitterId ? getTeamNumberForPlayerId(match, submitterId) : null;
  return !!approverTeam && !!submitterTeam && approverTeam !== submitterTeam;
}
/** Do not infer an account's participating identity from matching ID strings. */
export function getOwnedMatchParticipant(participants: Array<{ id: string; ownerUserId: string | null }>, accountUserId: string) {
  const owned = participants.filter(player => player.ownerUserId === accountUserId);
  return owned.length === 1 ? owned[0] : null;
}
