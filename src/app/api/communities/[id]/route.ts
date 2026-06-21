import {
  DELETE as deleteClub,
  GET as getClub,
  PATCH as updateClub,
} from "@/features/club-api/[id]/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const GET = withDeprecatedCommunityApiRoute(getClub);
export const PATCH = withDeprecatedCommunityApiRoute(updateClub);
export const DELETE = withDeprecatedCommunityApiRoute(deleteClub);

