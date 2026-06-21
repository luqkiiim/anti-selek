import {
  DELETE as deleteOfflineIdentityLink,
  PATCH as updateOfflineIdentityLink,
} from "@/features/club-api/[id]/offline-identity-links/[requestId]/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const PATCH = withDeprecatedCommunityApiRoute(updateOfflineIdentityLink);
export const DELETE = withDeprecatedCommunityApiRoute(deleteOfflineIdentityLink);

