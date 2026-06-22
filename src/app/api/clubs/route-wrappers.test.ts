import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ANTI_SELEK_DEPRECATED_HEADER,
  DEPRECATED_COMMUNITY_CONTRACT_MESSAGE,
  DEPRECATION_HEADER,
  LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE_ENV,
  LINK_HEADER,
  SUNSET_HEADER,
} from "@/lib/deprecatedCommunityContracts";
import { LEGACY_COMMUNITY_ROUTE_USED_EVENT } from "@/lib/serverTelemetry";

const handlerMocks = vi.hoisted(() => {
  const makeHandlers = <T extends string>(methods: T[]) =>
    Object.fromEntries(
      methods.map((method) => [
        method,
        vi.fn((request: Request) =>
          Response.json({ method, path: new URL(request.url).pathname })
        ),
      ])
    ) as Record<
      T,
      ReturnType<typeof vi.fn>
    >;

  return {
    claimRequest: makeHandlers(["PATCH"]),
    claimRequests: makeHandlers(["GET", "POST"]),
    collabCandidates: makeHandlers(["GET"]),
    collabRoster: makeHandlers(["GET"]),
    club: makeHandlers(["GET", "PATCH", "DELETE"]),
    join: makeHandlers(["POST"]),
    member: makeHandlers(["PATCH", "DELETE"]),
    memberMerge: makeHandlers(["POST"]),
    memberMergeCandidates: makeHandlers(["GET"]),
    memberPassword: makeHandlers(["POST"]),
    memberResetElo: makeHandlers(["POST"]),
    members: makeHandlers(["GET", "POST"]),
    membersLink: makeHandlers(["GET", "POST"]),
    offlineIdentityLink: makeHandlers(["PATCH", "DELETE"]),
    offlineIdentityLinks: makeHandlers(["GET", "POST"]),
    reset: makeHandlers(["POST"]),
    root: makeHandlers(["GET", "POST"]),
  };
});

vi.mock("@/features/club-api/route", () => handlerMocks.root);
vi.mock("@/features/club-api/join/route", () => handlerMocks.join);
vi.mock("@/features/club-api/[id]/route", () => handlerMocks.club);
vi.mock("@/features/club-api/[id]/reset/route", () => handlerMocks.reset);
vi.mock("@/features/club-api/[id]/collab-candidates/route", () => handlerMocks.collabCandidates);
vi.mock("@/features/club-api/[id]/collab-roster/route", () => handlerMocks.collabRoster);
vi.mock("@/features/club-api/[id]/claim-requests/route", () => handlerMocks.claimRequests);
vi.mock(
  "@/features/club-api/[id]/claim-requests/[requestId]/route",
  () => handlerMocks.claimRequest
);
vi.mock("@/features/club-api/[id]/offline-identity-links/route", () => handlerMocks.offlineIdentityLinks);
vi.mock(
  "@/features/club-api/[id]/offline-identity-links/[requestId]/route",
  () => handlerMocks.offlineIdentityLink
);
vi.mock("@/features/club-api/[id]/members/route", () => handlerMocks.members);
vi.mock("@/features/club-api/[id]/members/link/route", () => handlerMocks.membersLink);
vi.mock("@/features/club-api/[id]/members/[userId]/route", () => handlerMocks.member);
vi.mock("@/features/club-api/[id]/members/[userId]/reset-elo/route", () => handlerMocks.memberResetElo);
vi.mock("@/features/club-api/[id]/members/[userId]/password/route", () => handlerMocks.memberPassword);
vi.mock("@/features/club-api/[id]/members/[userId]/merge-candidates/route", () => handlerMocks.memberMergeCandidates);
vi.mock("@/features/club-api/[id]/members/[userId]/merge/route", () => handlerMocks.memberMerge);

type RouteModule = Record<string, unknown>;
type RouteHandler = (
  request: Request,
  context: { params: Promise<Record<string, string>> }
) => Response | Promise<Response>;
type TelemetryPayload = {
  details: Record<string, unknown>;
  event: string;
};

const mutableEnv = process.env as Record<string, string | undefined>;
const previousSunsetDate =
  mutableEnv[LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE_ENV];

const routeCases: Array<{
  name: string;
  methods: string[];
  legacyPath: string;
  legacyRoute: string;
  successorRoute: string;
  feature: () => Promise<RouteModule>;
  canonical: () => Promise<RouteModule>;
  legacy: () => Promise<RouteModule>;
}> = [
  {
    name: "club collection",
    methods: ["GET", "POST"],
    legacyPath: "/api/communities?includeArchived=false",
    legacyRoute: "/api/communities",
    successorRoute: "/api/clubs",
    feature: () => import("@/features/club-api/route"),
    canonical: () => import("@/app/api/clubs/route"),
    legacy: () => import("@/app/api/communities/route"),
  },
  {
    name: "join",
    methods: ["POST"],
    legacyPath: "/api/communities/join",
    legacyRoute: "/api/communities/join",
    successorRoute: "/api/clubs/join",
    feature: () => import("@/features/club-api/join/route"),
    canonical: () => import("@/app/api/clubs/join/route"),
    legacy: () => import("@/app/api/communities/join/route"),
  },
  {
    name: "club detail",
    methods: ["GET", "PATCH", "DELETE"],
    legacyPath: "/api/communities/club-1",
    legacyRoute: "/api/communities/[id]",
    successorRoute: "/api/clubs/[id]",
    feature: () => import("@/features/club-api/[id]/route"),
    canonical: () => import("@/app/api/clubs/[id]/route"),
    legacy: () => import("@/app/api/communities/[id]/route"),
  },
  {
    name: "club reset",
    methods: ["POST"],
    legacyPath: "/api/communities/club-1/reset",
    legacyRoute: "/api/communities/[id]/reset",
    successorRoute: "/api/clubs/[id]/reset",
    feature: () => import("@/features/club-api/[id]/reset/route"),
    canonical: () => import("@/app/api/clubs/[id]/reset/route"),
    legacy: () => import("@/app/api/communities/[id]/reset/route"),
  },
  {
    name: "collab candidates",
    methods: ["GET"],
    legacyPath: "/api/communities/club-1/collab-candidates",
    legacyRoute: "/api/communities/[id]/collab-candidates",
    successorRoute: "/api/clubs/[id]/collab-candidates",
    feature: () => import("@/features/club-api/[id]/collab-candidates/route"),
    canonical: () => import("@/app/api/clubs/[id]/collab-candidates/route"),
    legacy: () => import("@/app/api/communities/[id]/collab-candidates/route"),
  },
  {
    name: "collab roster",
    methods: ["GET"],
    legacyPath: "/api/communities/club-1/collab-roster?partnerCommunityId=club-2",
    legacyRoute: "/api/communities/[id]/collab-roster",
    successorRoute: "/api/clubs/[id]/collab-roster",
    feature: () => import("@/features/club-api/[id]/collab-roster/route"),
    canonical: () => import("@/app/api/clubs/[id]/collab-roster/route"),
    legacy: () => import("@/app/api/communities/[id]/collab-roster/route"),
  },
  {
    name: "claim requests",
    methods: ["GET", "POST"],
    legacyPath: "/api/communities/club-1/claim-requests",
    legacyRoute: "/api/communities/[id]/claim-requests",
    successorRoute: "/api/clubs/[id]/claim-requests",
    feature: () => import("@/features/club-api/[id]/claim-requests/route"),
    canonical: () => import("@/app/api/clubs/[id]/claim-requests/route"),
    legacy: () => import("@/app/api/communities/[id]/claim-requests/route"),
  },
  {
    name: "claim request detail",
    methods: ["PATCH"],
    legacyPath: "/api/communities/club-1/claim-requests/request-1",
    legacyRoute: "/api/communities/[id]/claim-requests/[requestId]",
    successorRoute: "/api/clubs/[id]/claim-requests/[requestId]",
    feature: () => import("@/features/club-api/[id]/claim-requests/[requestId]/route"),
    canonical: () => import("@/app/api/clubs/[id]/claim-requests/[requestId]/route"),
    legacy: () => import("@/app/api/communities/[id]/claim-requests/[requestId]/route"),
  },
  {
    name: "offline identity links",
    methods: ["GET", "POST"],
    legacyPath: "/api/communities/club-1/offline-identity-links",
    legacyRoute: "/api/communities/[id]/offline-identity-links",
    successorRoute: "/api/clubs/[id]/offline-identity-links",
    feature: () => import("@/features/club-api/[id]/offline-identity-links/route"),
    canonical: () => import("@/app/api/clubs/[id]/offline-identity-links/route"),
    legacy: () => import("@/app/api/communities/[id]/offline-identity-links/route"),
  },
  {
    name: "offline identity link detail",
    methods: ["PATCH", "DELETE"],
    legacyPath: "/api/communities/club-1/offline-identity-links/request-1",
    legacyRoute: "/api/communities/[id]/offline-identity-links/[requestId]",
    successorRoute: "/api/clubs/[id]/offline-identity-links/[requestId]",
    feature: () =>
      import("@/features/club-api/[id]/offline-identity-links/[requestId]/route"),
    canonical: () =>
      import("@/app/api/clubs/[id]/offline-identity-links/[requestId]/route"),
    legacy: () =>
      import("@/app/api/communities/[id]/offline-identity-links/[requestId]/route"),
  },
  {
    name: "members",
    methods: ["GET", "POST"],
    legacyPath: "/api/communities/club-1/members",
    legacyRoute: "/api/communities/[id]/members",
    successorRoute: "/api/clubs/[id]/members",
    feature: () => import("@/features/club-api/[id]/members/route"),
    canonical: () => import("@/app/api/clubs/[id]/members/route"),
    legacy: () => import("@/app/api/communities/[id]/members/route"),
  },
  {
    name: "member link",
    methods: ["GET", "POST"],
    legacyPath: "/api/communities/club-1/members/link",
    legacyRoute: "/api/communities/[id]/members/link",
    successorRoute: "/api/clubs/[id]/members/link",
    feature: () => import("@/features/club-api/[id]/members/link/route"),
    canonical: () => import("@/app/api/clubs/[id]/members/link/route"),
    legacy: () => import("@/app/api/communities/[id]/members/link/route"),
  },
  {
    name: "member detail",
    methods: ["PATCH", "DELETE"],
    legacyPath: "/api/communities/club-1/members/user-1",
    legacyRoute: "/api/communities/[id]/members/[userId]",
    successorRoute: "/api/clubs/[id]/members/[userId]",
    feature: () => import("@/features/club-api/[id]/members/[userId]/route"),
    canonical: () => import("@/app/api/clubs/[id]/members/[userId]/route"),
    legacy: () => import("@/app/api/communities/[id]/members/[userId]/route"),
  },
  {
    name: "member reset elo",
    methods: ["POST"],
    legacyPath: "/api/communities/club-1/members/user-1/reset-elo",
    legacyRoute: "/api/communities/[id]/members/[userId]/reset-elo",
    successorRoute: "/api/clubs/[id]/members/[userId]/reset-elo",
    feature: () => import("@/features/club-api/[id]/members/[userId]/reset-elo/route"),
    canonical: () => import("@/app/api/clubs/[id]/members/[userId]/reset-elo/route"),
    legacy: () => import("@/app/api/communities/[id]/members/[userId]/reset-elo/route"),
  },
  {
    name: "member password",
    methods: ["POST"],
    legacyPath: "/api/communities/club-1/members/user-1/password",
    legacyRoute: "/api/communities/[id]/members/[userId]/password",
    successorRoute: "/api/clubs/[id]/members/[userId]/password",
    feature: () => import("@/features/club-api/[id]/members/[userId]/password/route"),
    canonical: () => import("@/app/api/clubs/[id]/members/[userId]/password/route"),
    legacy: () => import("@/app/api/communities/[id]/members/[userId]/password/route"),
  },
  {
    name: "member merge candidates",
    methods: ["GET"],
    legacyPath: "/api/communities/club-1/members/user-1/merge-candidates",
    legacyRoute: "/api/communities/[id]/members/[userId]/merge-candidates",
    successorRoute: "/api/clubs/[id]/members/[userId]/merge-candidates",
    feature: () =>
      import("@/features/club-api/[id]/members/[userId]/merge-candidates/route"),
    canonical: () =>
      import("@/app/api/clubs/[id]/members/[userId]/merge-candidates/route"),
    legacy: () =>
      import("@/app/api/communities/[id]/members/[userId]/merge-candidates/route"),
  },
  {
    name: "member merge",
    methods: ["POST"],
    legacyPath: "/api/communities/club-1/members/user-1/merge",
    legacyRoute: "/api/communities/[id]/members/[userId]/merge",
    successorRoute: "/api/clubs/[id]/members/[userId]/merge",
    feature: () => import("@/features/club-api/[id]/members/[userId]/merge/route"),
    canonical: () => import("@/app/api/clubs/[id]/members/[userId]/merge/route"),
    legacy: () => import("@/app/api/communities/[id]/members/[userId]/merge/route"),
  },
];

function getTelemetryPayload(infoSpy: ReturnType<typeof vi.spyOn>) {
  expect(infoSpy).toHaveBeenCalledTimes(1);
  expect(infoSpy.mock.calls[0]?.[0]).toBe("[telemetry]");

  return JSON.parse(String(infoSpy.mock.calls[0]?.[1])) as TelemetryPayload;
}

describe("club API route wrappers", () => {
  const context = {
    params: Promise.resolve({
      id: "club-1",
      requestId: "request-1",
      userId: "user-1",
    }),
  };

  beforeEach(() => {
    delete mutableEnv[LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE_ENV];
  });

  afterEach(() => {
    if (previousSunsetDate === undefined) {
      delete mutableEnv[LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE_ENV];
    } else {
      mutableEnv[LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE_ENV] = previousSunsetDate;
    }
    vi.restoreAllMocks();
  });

  it.each(routeCases)("routes $name through shared canonical handlers", async (routeCase) => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const [feature, canonical, legacy] = await Promise.all([
      routeCase.feature(),
      routeCase.canonical(),
      routeCase.legacy(),
    ]);

    expect(canonical.dynamic).toBe("force-dynamic");
    expect(legacy.dynamic).toBe("force-dynamic");

    for (const method of routeCase.methods) {
      expect(canonical[method]).toBe(feature[method]);
      expect(legacy[method]).not.toBe(feature[method]);

      const canonicalPath = routeCase.legacyPath.replace(
        "/api/communities",
        "/api/clubs"
      );
      infoSpy.mockClear();
      const canonicalResponse = await (canonical[method] as RouteHandler)(
        new Request(`http://localhost${canonicalPath}`, { method }),
        context
      );

      expect(canonicalResponse.headers.get(DEPRECATION_HEADER)).toBeNull();
      expect(canonicalResponse.headers.get(LINK_HEADER)).toBeNull();
      expect(canonicalResponse.headers.get(ANTI_SELEK_DEPRECATED_HEADER)).toBeNull();
      expect(canonicalResponse.headers.get(SUNSET_HEADER)).toBeNull();
      expect(infoSpy).not.toHaveBeenCalled();

      const legacyResponse = await (legacy[method] as RouteHandler)(
        new Request(`http://localhost${routeCase.legacyPath}`, { method }),
        context
      );

      expect(legacyResponse.headers.get(DEPRECATION_HEADER)).toBe("true");
      expect(legacyResponse.headers.get(LINK_HEADER)).toBe(
        `<${canonicalPath}>; rel="successor-version"`
      );
      expect(legacyResponse.headers.get(ANTI_SELEK_DEPRECATED_HEADER)).toBe(
        DEPRECATED_COMMUNITY_CONTRACT_MESSAGE
      );
      expect(legacyResponse.headers.get(SUNSET_HEADER)).toBeNull();

      const telemetryPayload = getTelemetryPayload(infoSpy);
      expect(telemetryPayload).toMatchObject({
        details: {
          method,
          responseStatus: 200,
          route: routeCase.legacyRoute,
          successorPath: routeCase.successorRoute,
          surface: "api",
        },
        event: LEGACY_COMMUNITY_ROUTE_USED_EVENT,
      });
      expect(JSON.stringify(telemetryPayload)).not.toContain("club-1");
      expect(JSON.stringify(telemetryPayload)).not.toContain("user-1");
      expect(JSON.stringify(telemetryPayload)).not.toContain("request-1");
    }
  });

  it("adds a configured Sunset header to legacy API wrappers", async () => {
    mutableEnv[LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE_ENV] = "2026-08-01";
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const [canonical, legacy] = await Promise.all([
      import("@/app/api/clubs/route"),
      import("@/app/api/communities/route"),
    ]);

    const canonicalResponse = await (canonical.GET as RouteHandler)(
      new Request("http://localhost/api/clubs", { method: "GET" }),
      context
    );
    expect(canonicalResponse.headers.get(SUNSET_HEADER)).toBeNull();

    const legacyResponse = await (legacy.GET as RouteHandler)(
      new Request("http://localhost/api/communities", { method: "GET" }),
      context
    );

    expect(legacyResponse.headers.get(SUNSET_HEADER)).toBe(
      "Sat, 01 Aug 2026 00:00:00 GMT"
    );
    expect(infoSpy).toHaveBeenCalledTimes(1);
  });

  it("omits Sunset and warns once when the configured date is invalid", async () => {
    mutableEnv[LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE_ENV] = "2026-02-31";
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const legacy = await import("@/app/api/communities/route");

    for (const method of ["GET", "POST"] as const) {
      const response = await (legacy[method] as RouteHandler)(
        new Request("http://localhost/api/communities", { method }),
        context
      );

      expect(response.headers.get(SUNSET_HEADER)).toBeNull();
    }

    expect(infoSpy).toHaveBeenCalledTimes(2);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain(
      LEGACY_COMMUNITY_CONTRACT_SUNSET_DATE_ENV
    );
  });
});
