import type { Player } from "@/components/session/sessionTypes";
import type { LiveSessionPlayerStats } from "./deriveLiveSessionStandings";

/** Highlight only outright, positive records; never break ties arbitrarily. */
export function sessionFinishHighlights(players: readonly Player[], stats: Map<string, LiveSessionPlayerStats>) {
  const categories = [
    { id: "wins", label: "Most wins", field: "wins" as const, format: (n: number) => `${n} ${n === 1 ? "win" : "wins"}` },
  ];
  return categories.flatMap(category => {
    const played = players.filter(player => (stats.get(player.userId)?.matchesPlayed ?? 0) > 0);
    const best = Math.max(0, ...played.map(player => stats.get(player.userId)?.[category.field] ?? 0));
    const leaders = played.filter(player => stats.get(player.userId)?.[category.field] === best);
    if (best <= 0 || leaders.length !== 1) return [];
    const player = leaders[0];
    return [{ id: category.id, label: category.label, name: player.user.name, value: category.format(best), avatarUrl: player.user.avatarUrl }];
  });
}
