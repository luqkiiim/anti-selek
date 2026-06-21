import { POST as resetMemberElo } from "@/features/club-api/[id]/members/[userId]/reset-elo/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const POST = withDeprecatedCommunityApiRoute(resetMemberElo, {
  route: "/api/communities/[id]/members/[userId]/reset-elo",
  successorRoute: "/api/clubs/[id]/members/[userId]/reset-elo",
});

