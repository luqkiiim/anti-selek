import {
  DELETE as deleteClub,
  GET as getClub,
  PATCH as updateClub,
} from "@/features/club-api/[id]/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const GET = withDeprecatedCommunityApiRoute(getClub, {
  route: "/api/communities/[id]",
  successorRoute: "/api/clubs/[id]",
});
export const PATCH = withDeprecatedCommunityApiRoute(updateClub, {
  route: "/api/communities/[id]",
  successorRoute: "/api/clubs/[id]",
});
export const DELETE = withDeprecatedCommunityApiRoute(deleteClub, {
  route: "/api/communities/[id]",
  successorRoute: "/api/clubs/[id]",
});

