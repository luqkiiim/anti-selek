"use client";

import { useRouter, useParams, useSearchParams } from "next/navigation";
import { PlayerProfileView } from "@/components/profile/PlayerProfileView";

export default function ProfilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const userId = typeof params.id === "string" ? params.id : "";
  const communityId = searchParams.get("communityId") || "";
  const fallbackBackHref = communityId ? `/community/${communityId}` : "/";

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackBackHref);
  };

  return (
    <PlayerProfileView
      userId={userId}
      communityId={communityId}
      mode="standalone"
      onBack={handleBack}
    />
  );
}
