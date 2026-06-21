import {
  GET as getMemberLinks,
  POST as createMemberLink,
} from "@/features/club-api/[id]/members/link/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const GET = withDeprecatedCommunityApiRoute(getMemberLinks);
export const POST = withDeprecatedCommunityApiRoute(createMemberLink);

