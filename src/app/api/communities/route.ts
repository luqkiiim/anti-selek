import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";
import { GET as getClubs, POST as createClub } from "@/features/club-api/route";

export const dynamic = "force-dynamic";

export const GET = withDeprecatedCommunityApiRoute(getClubs);
export const POST = withDeprecatedCommunityApiRoute(createClub);

