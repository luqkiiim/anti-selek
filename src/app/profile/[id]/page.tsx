"use client";

import { useRouter, useParams, useSearchParams } from "next/navigation";
import { PlayerProfileView } from "@/components/profile/PlayerProfileView";

export default function ProfilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const playerId = typeof params.id === "string" ? params.id : "";
  const clubId = searchParams.get("clubId") || "";
  const fallbackBackHref = clubId ? `/club/${clubId}` : "/";

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackBackHref);
  };

  return (
    <PlayerProfileView
      playerId={playerId}
      clubId={clubId}
      mode="standalone"
      onBack={handleBack}
    />
  );
}
