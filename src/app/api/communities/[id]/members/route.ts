import {
  GET as getMembers,
  POST as createMember,
} from "@/features/club-api/[id]/members/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const GET = withDeprecatedCommunityApiRoute(getMembers, {
  route: "/api/communities/[id]/members",
  successorRoute: "/api/clubs/[id]/members",
});
export const POST = withDeprecatedCommunityApiRoute(createMember, {
  route: "/api/communities/[id]/members",
  successorRoute: "/api/clubs/[id]/members",
});

