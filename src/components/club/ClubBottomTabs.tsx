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

export type ClubBottomTabKey = ClubPageSection;

interface ClubBottomTabsProps {
  activeTab: ClubBottomTabKey;
  canManageClub: boolean;
  clubId: string;
  currentUserId?: string | null;
  onSelect?: (tab: ClubBottomTabKey) => void;
}

function getClubTabHref(clubId: string, tab: ClubBottomTabKey) {
  return `/club/${clubId}?tab=${tab}`;
}

export function ClubBottomTabs({
  activeTab,
  canManageClub,
  clubId,
  currentUserId,
  onSelect,
}: ClubBottomTabsProps) {
  const router = useRouter();

  if (!clubId) {
    return null;
  }

  const items = [
    {
      id: "overview" as const,
      label: "Overview",
      icon: Home,
    },
    {
      id: "tournaments" as const,
      label: "Tournaments",
      icon: Trophy,
    },
    ...(canManageClub
      ? [
          {
            id: "host" as const,
            label: "Host setup",
            shortLabel: "Host",
            icon: SlidersHorizontal,
          },
        ]
      : []),
    {
      id: "leaderboard" as const,
      label: "Leaderboard",
      icon: Medal,
    },
    ...(currentUserId
      ? [
          {
            id: "profile" as const,
            label: "Player profile",
            shortLabel: "Profile",
            icon: User,
          },
        ]
      : []),
  ];

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
    />
  );
}
