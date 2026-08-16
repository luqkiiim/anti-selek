import type { ClubPageSection } from "./clubTypes";

export interface ClubNavigationCounts {
  tournaments: number;
  leaderboard: number;
}

export interface ClubSectionDescriptor {
  key: ClubPageSection;
  label: string;
  shortLabel?: string;
  detail: (counts: ClubNavigationCounts) => string;
  requiresManagement?: boolean;
  requiresUser?: boolean;
}

export const CLUB_SECTION_DESCRIPTORS: readonly ClubSectionDescriptor[] = [
  {
    key: "overview",
    label: "Overview",
    detail: () => "Live snapshot",
  },
  {
    key: "tournaments",
    label: "Tournaments",
    detail: ({ tournaments }) => `${tournaments} total`,
  },
  {
    key: "host",
    label: "Host",
    shortLabel: "Host",
    detail: () => "Setup desk",
    requiresManagement: true,
  },
  {
    key: "leaderboard",
    label: "Leaderboard",
    detail: ({ leaderboard }) => `${leaderboard} players`,
  },
  {
    key: "profile",
    label: "Profile",
    shortLabel: "Profile",
    detail: () => "Your club profile",
    requiresUser: true,
  },
] as const;

export function getAuthorizedClubSections({
  canManageClub,
  hasUser,
}: {
  canManageClub: boolean;
  hasUser: boolean;
}) {
  return CLUB_SECTION_DESCRIPTORS.filter(
    (section) =>
      (!section.requiresManagement || canManageClub) &&
      (!section.requiresUser || hasUser)
  );
}

export function getAuthorizedClubSection(
  requestedTab: string | null,
  sections: readonly ClubSectionDescriptor[]
): ClubPageSection | null {
  return (
    sections.find((section) => section.key === requestedTab)?.key ?? null
  );
}
