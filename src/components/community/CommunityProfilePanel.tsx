"use client";

import { PlayerProfileView } from "@/components/profile/PlayerProfileView";
import { EmptyState, SectionCard } from "@/components/ui/chrome";

export function CommunityProfilePanel({
  userId,
  communityId,
}: {
  userId?: string | null;
  communityId: string;
}) {
  if (!userId) {
    return (
      <SectionCard eyebrow="Profile" title="Player profile">
        <EmptyState
          title="Profile unavailable"
          detail="Sign in again to load your club profile."
        />
      </SectionCard>
    );
  }

  return (
    <PlayerProfileView
      userId={userId}
      communityId={communityId}
      mode="embedded"
    />
  );
}
