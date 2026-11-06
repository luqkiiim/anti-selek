/** The exact unfinished games a host has reviewed before discarding them. */
export interface UnfinishedMatchReview {
  id: string;
  status: string;
  scoreRevision: number;
  courtNumber?: number;
  courtLabel?: string | null;
}

export function acknowledgesUnfinishedMatches(value: unknown, matches: UnfinishedMatchReview[]): boolean {
  if (!Array.isArray(value) || value.length !== matches.length) return false;
  const seen = new Set<string>();
  return value.every(item => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || seen.has(item.id)) return false;
    seen.add(item.id);
    return matches.some(match => match.id === item.id && match.status === item.status && match.scoreRevision === item.scoreRevision);
  });
}
