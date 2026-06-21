import { POST as joinClub } from "@/features/club-api/join/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const POST = withDeprecatedCommunityApiRoute(joinClub, {
  route: "/api/communities/join",
  successorRoute: "/api/clubs/join",
});

