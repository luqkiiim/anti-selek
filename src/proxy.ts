import { type NextRequest, NextResponse } from "next/server";

import {
  applyDeprecatedCommunityContractHeaders,
  getDeprecatedCommunityPageSuccessorPath,
  getDeprecatedCommunityPageRoutePattern,
  getDeprecatedCommunityPageSuccessorRoute,
  logDeprecatedCommunityRouteUsage,
} from "@/lib/deprecatedCommunityContracts";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const pathname = request.nextUrl.pathname;
  const successorPath = getDeprecatedCommunityPageSuccessorPath(
    pathname,
    request.nextUrl.search
  );

  logDeprecatedCommunityRouteUsage(request, {
    responseStatus: response.status,
    route: getDeprecatedCommunityPageRoutePattern(pathname),
    successorRoute: getDeprecatedCommunityPageSuccessorRoute(pathname),
    surface: "page",
  });

  return applyDeprecatedCommunityContractHeaders(
    response,
    successorPath
  );
}

export const config = {
  matcher: ["/community/:path*"],
};
