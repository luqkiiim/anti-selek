import type { ClubPageMember } from "@/components/club/clubTypes";
import { ClubPlayerStatus } from "@/types/enums";

export function getClubLeaderboard(members: ClubPageMember[]) {
  return members
    .filter(
      (member) =>
        member.status !== ClubPlayerStatus.OCCASIONAL &&
        (member.matchesPlayed ?? 0) > 0
    )
    .sort((a, b) => {
      if (b.elo !== a.elo) return b.elo - a.elo;
      return a.name.localeCompare(b.name);
    });
}
