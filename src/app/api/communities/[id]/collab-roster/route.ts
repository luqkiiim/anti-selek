import { GET as getCollabRoster } from "@/features/club-api/[id]/collab-roster/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const GET = withDeprecatedCommunityApiRoute(getCollabRoster);

