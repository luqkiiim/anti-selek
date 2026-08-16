"use client";

import { useRouter } from "next/navigation";
import {
  Home,
  Medal,
  SlidersHorizontal,
  Trophy,
  User,
} from "lucide-react";
import { MobileBottomTabs } from "@/components/ui/MobileBottomTabs";
import type { ClubPageSection } from "./clubTypes";
import type { ClubSectionDescriptor } from "./clubNavigation";

export type ClubBottomTabKey = ClubPageSection;

interface ClubBottomTabsProps {
  activeTab: ClubBottomTabKey;
  clubId: string;
  sections: readonly ClubSectionDescriptor[];
  onSelect?: (tab: ClubBottomTabKey) => void;
}

const SECTION_ICONS = {
  overview: Home,
  tournaments: Trophy,
  host: SlidersHorizontal,
  leaderboard: Medal,
  profile: User,
} satisfies Record<ClubBottomTabKey, typeof Home>;

function getClubTabHref(clubId: string, tab: ClubBottomTabKey) {
  return `/club/${clubId}?tab=${tab}`;
}

export function ClubBottomTabs({
  activeTab,
  clubId,
  sections,
  onSelect,
}: ClubBottomTabsProps) {
  const router = useRouter();

  if (!clubId) {
    return null;
  }

  const items = sections.map((section) => ({
    id: section.key,
    label:
      section.key === "host"
        ? "Host setup"
        : section.key === "profile"
          ? "Player profile"
          : section.label,
    shortLabel: section.shortLabel,
    icon: SECTION_ICONS[section.key],
  }));

  const handleSelect = (tab: ClubBottomTabKey) => {
    if (onSelect) {
      onSelect(tab);
      return;
    }

    router.push(getClubTabHref(clubId, tab));
  };

  return (
    <MobileBottomTabs
      items={items}
      activeId={activeTab}
      onSelect={handleSelect}
      ariaLabel="Club navigation"
      visibilityClassName="xl:hidden"
    />
  );
}
