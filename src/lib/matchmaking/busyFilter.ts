/**
 * Identifies user IDs who are currently busy on a court.
 * Busy status includes: PENDING, IN_PROGRESS, PENDING_APPROVAL.
 */
export function getBusyPlayerIds(matches: { 
  status: string; 
  team1User1Id: string; 
  team1User2Id: string; 
  team2User1Id: string; 
  team2User2Id: string; 
}[]): Set<string> {
  const busyIds = new Set<string>();
  
  const busyStatuses = ["PENDING", "IN_PROGRESS", "PENDING_APPROVAL"];
  
  matches
    .filter(m => busyStatuses.includes(m.status))
    .forEach(m => {
      busyIds.add(m.team1User1Id);
      busyIds.add(m.team1User2Id);
      busyIds.add(m.team2User1Id);
      busyIds.add(m.team2User2Id);
    });
    
  return busyIds;
}
