import {
  DELETE as deleteOfflineIdentityLink,
  PATCH as updateOfflineIdentityLink,
} from "@/features/club-api/[id]/offline-identity-links/[requestId]/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const PATCH = withDeprecatedCommunityApiRoute(updateOfflineIdentityLink, {
  route: "/api/communities/[id]/offline-identity-links/[requestId]",
  successorRoute: "/api/clubs/[id]/offline-identity-links/[requestId]",
});
export const DELETE = withDeprecatedCommunityApiRoute(deleteOfflineIdentityLink, {
  route: "/api/communities/[id]/offline-identity-links/[requestId]",
  successorRoute: "/api/clubs/[id]/offline-identity-links/[requestId]",
});

