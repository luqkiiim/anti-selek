"use client";

import Link from "next/link";
import {
  Home,
  Medal,
  SlidersHorizontal,
  Trophy,
  User,
  type LucideIcon,
} from "lucide-react";
import type { CommunityPageSection } from "./communityTypes";

export type CommunityBottomTabKey = CommunityPageSection | "profile";

interface CommunityBottomTabsProps {
  activeTab: CommunityBottomTabKey;
  canManageCommunity: boolean;
  communityId: string;
  currentUserId?: string | null;
}

interface CommunityBottomTabItem {
  key: CommunityBottomTabKey;
  label: string;
  href: string;
  icon: LucideIcon;
}

function getCommunityTabHref(communityId: string, tab: CommunityPageSection) {
  return `/community/${communityId}?tab=${tab}`;
}

function getProfileHref(communityId: string, currentUserId: string) {
  return `/profile/${currentUserId}?communityId=${encodeURIComponent(communityId)}`;
}

export function CommunityBottomTabs({
  activeTab,
  canManageCommunity,
  communityId,
  currentUserId,
}: CommunityBottomTabsProps) {
  if (!communityId) {
    return null;
  }

  const items: CommunityBottomTabItem[] = [
    {
      key: "overview",
      label: "Overview",
      href: getCommunityTabHref(communityId, "overview"),
      icon: Home,
    },
    {
      key: "tournaments",
      label: "Tournaments",
      href: getCommunityTabHref(communityId, "tournaments"),
      icon: Trophy,
    },
    ...(canManageCommunity
      ? [
          {
            key: "host" as const,
            label: "Host setup",
            href: getCommunityTabHref(communityId, "host"),
            icon: SlidersHorizontal,
          },
        ]
      : []),
    {
      key: "leaderboard",
      label: "Leaderboard",
      href: getCommunityTabHref(communityId, "leaderboard"),
      icon: Medal,
    },
    ...(currentUserId
      ? [
          {
            key: "profile" as const,
            label: "Player profile",
            href: getProfileHref(communityId, currentUserId),
            icon: User,
          },
        ]
      : []),
  ];

  return (
    <nav
      aria-label="Community navigation"
      className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2 sm:hidden"
    >
      <div className="mx-auto flex max-w-md items-center justify-around gap-1 rounded-[1.75rem] border border-white/70 bg-white/[0.92] px-2 py-2 shadow-[0_18px_48px_rgba(7,20,35,0.2)] backdrop-blur-xl">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;

          return (
            <Link
              key={item.key}
              href={item.href}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
              title={item.label}
              className={`flex h-12 w-12 items-center justify-center rounded-2xl transition ${
                isActive
                  ? "bg-gray-900 text-white shadow-sm"
                  : "text-gray-500 hover:bg-blue-50 hover:text-blue-700"
              }`}
            >
              <Icon aria-hidden="true" size={23} strokeWidth={2.25} />
              <span className="sr-only">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
