"use client";

import { PlayProfile } from "@/components/play/PlayProfile";
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
    <PlayProfile
      userId={userId}
      clubId={clubId}
    />
  );
}
