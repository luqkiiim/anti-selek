import {
  GET as getClaimRequests,
  POST as createClaimRequest,
} from "@/features/club-api/[id]/claim-requests/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const GET = withDeprecatedCommunityApiRoute(getClaimRequests, {
  route: "/api/communities/[id]/claim-requests",
  successorRoute: "/api/clubs/[id]/claim-requests",
});
export const POST = withDeprecatedCommunityApiRoute(createClaimRequest, {
  route: "/api/communities/[id]/claim-requests",
  successorRoute: "/api/clubs/[id]/claim-requests",
});

