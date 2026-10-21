import type { PlayerProfileMatchHistoryEntry } from "./profileStats";

export interface ProfileConnectionSelection {
  id: string;
  name: string;
  role: "partner" | "opponent";
}

export function profileConnectionMatches(
  matches: PlayerProfileMatchHistoryEntry[],
  connection: ProfileConnectionSelection,
) {
  return matches
    .filter(match => connection.role === "partner"
      ? match.partner.id === connection.id
      : match.opponents.some(opponent => opponent.id === connection.id))
    .sort((left, right) =>
      (Date.parse(right.date ?? "") || 0) - (Date.parse(left.date ?? "") || 0));
}
