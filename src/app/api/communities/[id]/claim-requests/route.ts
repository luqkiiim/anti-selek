import {
  GET as getClaimRequests,
  POST as createClaimRequest,
} from "@/features/club-api/[id]/claim-requests/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const GET = withDeprecatedCommunityApiRoute(getClaimRequests);
export const POST = withDeprecatedCommunityApiRoute(createClaimRequest);

