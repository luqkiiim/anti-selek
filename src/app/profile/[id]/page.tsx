"use client";
import { useParams, useSearchParams } from "next/navigation";
import { PlayProfile } from "@/components/play/PlayProfile";
import { PlayShell } from "@/components/play/PlayShell";
export default function ProfilePage() {
  const { id } = useParams<{ id: string }>();
  const clubId = useSearchParams().get("clubId") || undefined;
  return (
    <PlayShell
      title="Player profile"
      backHref={clubId ? `/club/${clubId}` : "/"}
      clubId={clubId}
    >
      <PlayProfile userId={id} clubId={clubId} />
    </PlayShell>
  );
}
