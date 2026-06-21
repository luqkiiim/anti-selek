import { type NextRequest, NextResponse } from "next/server";

import {
  applyDeprecatedCommunityContractHeaders,
  getDeprecatedCommunityPageSuccessorPath,
} from "@/lib/deprecatedCommunityContracts";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();

  return applyDeprecatedCommunityContractHeaders(
    response,
    getDeprecatedCommunityPageSuccessorPath(
      request.nextUrl.pathname,
      request.nextUrl.search
    )
  );
}

export const config = {
  matcher: ["/community/:path*"],
};
