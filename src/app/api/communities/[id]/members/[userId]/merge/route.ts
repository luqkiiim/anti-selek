import { POST as mergeMember } from "@/features/club-api/[id]/members/[userId]/merge/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const POST = withDeprecatedCommunityApiRoute(mergeMember, {
  route: "/api/communities/[id]/members/[userId]/merge",
  successorRoute: "/api/clubs/[id]/members/[userId]/merge",
});

