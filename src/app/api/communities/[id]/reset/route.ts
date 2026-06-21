import { POST as resetClub } from "@/features/club-api/[id]/reset/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const POST = withDeprecatedCommunityApiRoute(resetClub, {
  route: "/api/communities/[id]/reset",
  successorRoute: "/api/clubs/[id]/reset",
});

