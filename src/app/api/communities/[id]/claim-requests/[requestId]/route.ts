import { PATCH as updateClaimRequest } from "@/features/club-api/[id]/claim-requests/[requestId]/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const PATCH = withDeprecatedCommunityApiRoute(updateClaimRequest, {
  route: "/api/communities/[id]/claim-requests/[requestId]",
  successorRoute: "/api/clubs/[id]/claim-requests/[requestId]",
});

