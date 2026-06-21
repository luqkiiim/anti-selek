import {
  DELETE as deleteMember,
  PATCH as updateMember,
} from "@/features/club-api/[id]/members/[userId]/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const PATCH = withDeprecatedCommunityApiRoute(updateMember, {
  route: "/api/communities/[id]/members/[userId]",
  successorRoute: "/api/clubs/[id]/members/[userId]",
});
export const DELETE = withDeprecatedCommunityApiRoute(deleteMember, {
  route: "/api/communities/[id]/members/[userId]",
  successorRoute: "/api/clubs/[id]/members/[userId]",
});

