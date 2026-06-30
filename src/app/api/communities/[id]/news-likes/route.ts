import { POST as toggleClubNewsLike } from "@/features/club-api/[id]/news-likes/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const POST = withDeprecatedCommunityApiRoute(toggleClubNewsLike, {
  route: "/api/communities/[id]/news-likes",
  successorRoute: "/api/clubs/[id]/news-likes",
});
