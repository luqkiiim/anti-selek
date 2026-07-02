import {
  DELETE as deleteClubAvatar,
  POST as uploadClubAvatar,
} from "@/features/club-api/[id]/avatar/route";
import { withDeprecatedCommunityApiRoute } from "@/lib/deprecatedCommunityContracts";

export const dynamic = "force-dynamic";

export const POST = withDeprecatedCommunityApiRoute(uploadClubAvatar, {
  route: "/api/communities/[id]/avatar",
  successorRoute: "/api/clubs/[id]/avatar",
});

export const DELETE = withDeprecatedCommunityApiRoute(deleteClubAvatar, {
  route: "/api/communities/[id]/avatar",
  successorRoute: "/api/clubs/[id]/avatar",
});
