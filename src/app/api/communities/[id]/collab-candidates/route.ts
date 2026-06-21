import { GET as getCollabCandidates } from "@/features/club-api/[id]/collab-candidates/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const GET = withDeprecatedCommunityApiRoute(getCollabCandidates);

