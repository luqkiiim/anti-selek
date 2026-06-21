import {
  DELETE as deleteMember,
  PATCH as updateMember,
} from "@/features/club-api/[id]/members/[userId]/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const PATCH = withDeprecatedCommunityApiRoute(updateMember);
export const DELETE = withDeprecatedCommunityApiRoute(deleteMember);

