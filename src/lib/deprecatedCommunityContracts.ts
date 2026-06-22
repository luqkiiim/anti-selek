import {
  LEGACY_COMMUNITY_ROUTE_USED_EVENT,
  logTelemetryEvent,
} from "@/lib/serverTelemetry";

export const DEPRECATED_COMMUNITY_CONTRACT_MESSAGE =
  "Use club routes and club fields; community compatibility will be removed in a future phase.";

export const DEPRECATION_HEADER = "Deprecation";
export const LINK_HEADER = "Link";
export const ANTI_SELEK_DEPRECATED_HEADER = "X-Anti-Selek-Deprecated";
export const SUNSET_HEADER = "Sunset";
export const LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE_ENV =
  "LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE";

const LEGACY_API_PREFIX = "/api/communities";
const CANONICAL_API_PREFIX = "/api/clubs";
const LEGACY_PAGE_PREFIX = "/community";
const CANONICAL_PAGE_PREFIX = "/club";
let warnedInvalidSunsetDate = false;

type RouteHandler<TRequest extends Request, TArgs extends unknown[]> = (
  request: TRequest,
  ...args: TArgs
) => Response | Promise<Response>;

interface DeprecatedCommunityApiRouteOptions {
  route: string;
  successorRoute: string;
}

export function getDeprecatedCommunityContractHeaders(successorPath: string) {
  const sunset = getLegacyCommunityContractSunsetHeaderValue();

  return {
    [DEPRECATION_HEADER]: "true",
    [LINK_HEADER]: `<${successorPath}>; rel="successor-version"`,
    [ANTI_SELEK_DEPRECATED_HEADER]: DEPRECATED_COMMUNITY_CONTRACT_MESSAGE,
    ...(sunset ? { [SUNSET_HEADER]: sunset } : {}),
  };
}

export function getLegacyCommunityContractSunsetHeaderValue() {
  const value = process.env[LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE_ENV];
  if (!value) {
    return null;
  }

  const sunset = parseSunsetDate(value);
  if (sunset) {
    return sunset;
  }

  if (!warnedInvalidSunsetDate) {
    warnedInvalidSunsetDate = true;
    console.warn(
      `Invalid ${LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE_ENV}; expected YYYY-MM-DD. Sunset header will be omitted.`
    );
  }

  return null;
}

export function applyDeprecatedCommunityContractHeaders<TResponse extends Response>(
  response: TResponse,
  successorPath: string
) {
  const headers = getDeprecatedCommunityContractHeaders(successorPath);

  for (const [name, value] of Object.entries(headers)) {
    response.headers.set(name, value);
  }

  return response;
}

export function getDeprecatedCommunityApiSuccessorPath(request: Request) {
  const url = new URL(request.url);

  return `${replacePathPrefix(
    url.pathname,
    LEGACY_API_PREFIX,
    CANONICAL_API_PREFIX
  )}${url.search}`;
}

export function getDeprecatedCommunityPageSuccessorPath(
  pathname: string,
  search = ""
) {
  return `${replacePathPrefix(
    pathname,
    LEGACY_PAGE_PREFIX,
    CANONICAL_PAGE_PREFIX
  )}${normalizeSearch(search)}`;
}

export function withDeprecatedCommunityApiRoute<
  TRequest extends Request,
  TArgs extends unknown[],
>(
  handler: RouteHandler<TRequest, TArgs>,
  options?: DeprecatedCommunityApiRouteOptions
) {
  return async (request: TRequest, ...args: TArgs) => {
    let response: Response | undefined;

    try {
      response = await handler(request, ...args);

      return applyDeprecatedCommunityContractHeaders(
        response,
        getDeprecatedCommunityApiSuccessorPath(request)
      );
    } finally {
      logDeprecatedCommunityRouteUsage(request, {
        responseStatus: response?.status,
        route: options?.route ?? getDeprecatedCommunityApiRoutePattern(request),
        successorRoute:
          options?.successorRoute ?? getDeprecatedCommunityApiSuccessorRoute(request),
        surface: "api",
      });
    }
  };
}

export function logDeprecatedCommunityRouteUsage(
  request: Request,
  {
    responseStatus,
    route,
    successorRoute,
    surface,
  }: {
    responseStatus?: number;
    route: string;
    successorRoute: string;
    surface: "api" | "page";
  }
) {
  logTelemetryEvent({
    details: {
      method: request.method,
      responseStatus,
      route,
      successorPath: successorRoute,
      surface,
    },
    event: LEGACY_COMMUNITY_ROUTE_USED_EVENT,
    request,
  });
}

export function getDeprecatedCommunityPageRoutePattern(pathname: string) {
  return replaceFirstDynamicPathSegment(pathname, LEGACY_PAGE_PREFIX);
}

export function getDeprecatedCommunityPageSuccessorRoute(pathname: string) {
  return replacePathPrefix(
    replaceFirstDynamicPathSegment(pathname, LEGACY_PAGE_PREFIX),
    LEGACY_PAGE_PREFIX,
    CANONICAL_PAGE_PREFIX
  );
}

function replacePathPrefix(pathname: string, legacyPrefix: string, canonicalPrefix: string) {
  if (pathname === legacyPrefix) {
    return canonicalPrefix;
  }

  if (pathname.startsWith(`${legacyPrefix}/`)) {
    return `${canonicalPrefix}${pathname.slice(legacyPrefix.length)}`;
  }

  return pathname;
}

function getDeprecatedCommunityApiRoutePattern(request: Request) {
  return replaceFirstDynamicPathSegment(new URL(request.url).pathname, LEGACY_API_PREFIX);
}

function getDeprecatedCommunityApiSuccessorRoute(request: Request) {
  return replacePathPrefix(
    getDeprecatedCommunityApiRoutePattern(request),
    LEGACY_API_PREFIX,
    CANONICAL_API_PREFIX
  );
}

function replaceFirstDynamicPathSegment(pathname: string, prefix: string) {
  if (pathname === prefix || !pathname.startsWith(`${prefix}/`)) {
    return pathname;
  }

  const parts = pathname.split("/");
  const prefixParts = prefix.split("/").filter(Boolean);
  const dynamicIndex = prefixParts.length + 1;

  if (parts[dynamicIndex]) {
    parts[dynamicIndex] = "[id]";
  }

  return parts.join("/");
}

function normalizeSearch(search: string) {
  if (!search) {
    return "";
  }

  return search.startsWith("?") ? search : `?${search}`;
}

function parseSunsetDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date.toUTCString();
}
