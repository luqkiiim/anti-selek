"use client";

import { PlayerProfileView } from "@/components/profile/PlayerProfileView";
import { EmptyState, SectionCard } from "@/components/ui/chrome";

export function ClubProfilePanel({
  playerId,
  clubId,
}: {
  playerId?: string | null;
  clubId: string;
}) {
  if (!playerId) {
    return (
      <SectionCard eyebrow="Profile" title="Player profile">
        <EmptyState
          title="Profile unavailable"
          detail="There is no Player profile attached to this account in this club yet."
        />
      </SectionCard>
    );
  }

  return (
    <PlayerProfileView
      playerId={playerId}
      clubId={clubId}
      mode="embedded"
    />
  );
}
