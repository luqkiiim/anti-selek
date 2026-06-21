import {
  GET as getOfflineIdentityLinks,
  POST as createOfflineIdentityLink,
} from "@/features/club-api/[id]/offline-identity-links/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const GET = withDeprecatedCommunityApiRoute(getOfflineIdentityLinks, {
  route: "/api/communities/[id]/offline-identity-links",
  successorRoute: "/api/clubs/[id]/offline-identity-links",
});
export const POST = withDeprecatedCommunityApiRoute(createOfflineIdentityLink, {
  route: "/api/communities/[id]/offline-identity-links",
  successorRoute: "/api/clubs/[id]/offline-identity-links",
});

