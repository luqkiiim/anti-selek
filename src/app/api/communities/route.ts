import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";
import { GET as getClubs, POST as createClub } from "@/features/club-api/route";

export const dynamic = "force-dynamic";

export const GET = withDeprecatedCommunityApiRoute(getClubs, {
  route: "/api/communities",
  successorRoute: "/api/clubs",
});
export const POST = withDeprecatedCommunityApiRoute(createClub, {
  route: "/api/communities",
  successorRoute: "/api/clubs",
});

