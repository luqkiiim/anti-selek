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
import type { CommunityPageSection } from "./communityTypes";

export type CommunityBottomTabKey = CommunityPageSection;

interface CommunityBottomTabsProps {
  activeTab: CommunityBottomTabKey;
  canManageCommunity: boolean;
  communityId: string;
  currentUserId?: string | null;
  onSelect?: (tab: CommunityBottomTabKey) => void;
}

function getCommunityTabHref(communityId: string, tab: CommunityBottomTabKey) {
  return `/community/${communityId}?tab=${tab}`;
}

export function CommunityBottomTabs({
  activeTab,
  canManageCommunity,
  communityId,
  currentUserId,
  onSelect,
}: CommunityBottomTabsProps) {
  const router = useRouter();

  if (!communityId) {
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
    ...(canManageCommunity
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

  const handleSelect = (tab: CommunityBottomTabKey) => {
    if (onSelect) {
      onSelect(tab);
      return;
    }

    router.push(getCommunityTabHref(communityId, tab));
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
