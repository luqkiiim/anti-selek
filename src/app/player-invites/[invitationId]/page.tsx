import type { Metadata } from "next";
import { PlayerInvitationClaim } from "@/components/profile/PlayerInvitationClaim";

export const metadata: Metadata = { title: "Claim your Player profile | Anti-Selek", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function PlayerInvitationPage({ params }: { params: Promise<{ invitationId: string }> }) {
  const { invitationId } = await params;
  return <PlayerInvitationClaim key={invitationId} invitationId={invitationId} />;
}
