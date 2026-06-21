import { GET as getMemberMergeCandidates } from "@/features/club-api/[id]/members/[userId]/merge-candidates/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const GET = withDeprecatedCommunityApiRoute(getMemberMergeCandidates);

