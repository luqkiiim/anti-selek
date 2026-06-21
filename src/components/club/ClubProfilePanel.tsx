"use client";

import { PlayerProfileView } from "@/components/profile/PlayerProfileView";
import { EmptyState, SectionCard } from "@/components/ui/chrome";

export function ClubProfilePanel({
  userId,
  clubId,
}: {
  userId?: string | null;
  clubId: string;
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
      clubId={clubId}
      mode="embedded"
    />
  );
}
