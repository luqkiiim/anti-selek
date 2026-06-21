import { POST as updateMemberPassword } from "@/features/club-api/[id]/members/[userId]/password/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const POST = withDeprecatedCommunityApiRoute(updateMemberPassword);

