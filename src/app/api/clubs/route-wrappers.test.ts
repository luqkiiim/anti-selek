import { describe, expect, it, vi } from "vitest";

import {
  ANTI_SELEK_DEPRECATED_HEADER,
  DEPRECATED_COMMUNITY_CONTRACT_MESSAGE,
  DEPRECATION_HEADER,
  LINK_HEADER,
} from "@/lib/deprecatedCommunityContracts";

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

const routeCases: Array<{
  name: string;
  methods: string[];
  legacyPath: string;
  feature: () => Promise<RouteModule>;
  canonical: () => Promise<RouteModule>;
  legacy: () => Promise<RouteModule>;
}> = [
  {
    name: "club collection",
    methods: ["GET", "POST"],
    legacyPath: "/api/communities?includeArchived=false",
    feature: () => import("@/features/club-api/route"),
    canonical: () => import("@/app/api/clubs/route"),
    legacy: () => import("@/app/api/communities/route"),
  },
  {
    name: "join",
    methods: ["POST"],
    legacyPath: "/api/communities/join",
    feature: () => import("@/features/club-api/join/route"),
    canonical: () => import("@/app/api/clubs/join/route"),
    legacy: () => import("@/app/api/communities/join/route"),
  },
  {
    name: "club detail",
    methods: ["GET", "PATCH", "DELETE"],
    legacyPath: "/api/communities/club-1",
    feature: () => import("@/features/club-api/[id]/route"),
    canonical: () => import("@/app/api/clubs/[id]/route"),
    legacy: () => import("@/app/api/communities/[id]/route"),
  },
  {
    name: "club reset",
    methods: ["POST"],
    legacyPath: "/api/communities/club-1/reset",
    feature: () => import("@/features/club-api/[id]/reset/route"),
    canonical: () => import("@/app/api/clubs/[id]/reset/route"),
    legacy: () => import("@/app/api/communities/[id]/reset/route"),
  },
  {
    name: "collab candidates",
    methods: ["GET"],
    legacyPath: "/api/communities/club-1/collab-candidates",
    feature: () => import("@/features/club-api/[id]/collab-candidates/route"),
    canonical: () => import("@/app/api/clubs/[id]/collab-candidates/route"),
    legacy: () => import("@/app/api/communities/[id]/collab-candidates/route"),
  },
  {
    name: "collab roster",
    methods: ["GET"],
    legacyPath: "/api/communities/club-1/collab-roster?partnerCommunityId=club-2",
    feature: () => import("@/features/club-api/[id]/collab-roster/route"),
    canonical: () => import("@/app/api/clubs/[id]/collab-roster/route"),
    legacy: () => import("@/app/api/communities/[id]/collab-roster/route"),
  },
  {
    name: "claim requests",
    methods: ["GET", "POST"],
    legacyPath: "/api/communities/club-1/claim-requests",
    feature: () => import("@/features/club-api/[id]/claim-requests/route"),
    canonical: () => import("@/app/api/clubs/[id]/claim-requests/route"),
    legacy: () => import("@/app/api/communities/[id]/claim-requests/route"),
  },
  {
    name: "claim request detail",
    methods: ["PATCH"],
    legacyPath: "/api/communities/club-1/claim-requests/request-1",
    feature: () => import("@/features/club-api/[id]/claim-requests/[requestId]/route"),
    canonical: () => import("@/app/api/clubs/[id]/claim-requests/[requestId]/route"),
    legacy: () => import("@/app/api/communities/[id]/claim-requests/[requestId]/route"),
  },
  {
    name: "offline identity links",
    methods: ["GET", "POST"],
    legacyPath: "/api/communities/club-1/offline-identity-links",
    feature: () => import("@/features/club-api/[id]/offline-identity-links/route"),
    canonical: () => import("@/app/api/clubs/[id]/offline-identity-links/route"),
    legacy: () => import("@/app/api/communities/[id]/offline-identity-links/route"),
  },
  {
    name: "offline identity link detail",
    methods: ["PATCH", "DELETE"],
    legacyPath: "/api/communities/club-1/offline-identity-links/request-1",
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
    feature: () => import("@/features/club-api/[id]/members/route"),
    canonical: () => import("@/app/api/clubs/[id]/members/route"),
    legacy: () => import("@/app/api/communities/[id]/members/route"),
  },
  {
    name: "member link",
    methods: ["GET", "POST"],
    legacyPath: "/api/communities/club-1/members/link",
    feature: () => import("@/features/club-api/[id]/members/link/route"),
    canonical: () => import("@/app/api/clubs/[id]/members/link/route"),
    legacy: () => import("@/app/api/communities/[id]/members/link/route"),
  },
  {
    name: "member detail",
    methods: ["PATCH", "DELETE"],
    legacyPath: "/api/communities/club-1/members/user-1",
    feature: () => import("@/features/club-api/[id]/members/[userId]/route"),
    canonical: () => import("@/app/api/clubs/[id]/members/[userId]/route"),
    legacy: () => import("@/app/api/communities/[id]/members/[userId]/route"),
  },
  {
    name: "member reset elo",
    methods: ["POST"],
    legacyPath: "/api/communities/club-1/members/user-1/reset-elo",
    feature: () => import("@/features/club-api/[id]/members/[userId]/reset-elo/route"),
    canonical: () => import("@/app/api/clubs/[id]/members/[userId]/reset-elo/route"),
    legacy: () => import("@/app/api/communities/[id]/members/[userId]/reset-elo/route"),
  },
  {
    name: "member password",
    methods: ["POST"],
    legacyPath: "/api/communities/club-1/members/user-1/password",
    feature: () => import("@/features/club-api/[id]/members/[userId]/password/route"),
    canonical: () => import("@/app/api/clubs/[id]/members/[userId]/password/route"),
    legacy: () => import("@/app/api/communities/[id]/members/[userId]/password/route"),
  },
  {
    name: "member merge candidates",
    methods: ["GET"],
    legacyPath: "/api/communities/club-1/members/user-1/merge-candidates",
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
    feature: () => import("@/features/club-api/[id]/members/[userId]/merge/route"),
    canonical: () => import("@/app/api/clubs/[id]/members/[userId]/merge/route"),
    legacy: () => import("@/app/api/communities/[id]/members/[userId]/merge/route"),
  },
];

describe("club API route wrappers", () => {
  const context = {
    params: Promise.resolve({
      id: "club-1",
      requestId: "request-1",
      userId: "user-1",
    }),
  };

  it.each(routeCases)("routes $name through shared canonical handlers", async (routeCase) => {
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
      const canonicalResponse = await (canonical[method] as RouteHandler)(
        new Request(`http://localhost${canonicalPath}`),
        context
      );

      expect(canonicalResponse.headers.get(DEPRECATION_HEADER)).toBeNull();
      expect(canonicalResponse.headers.get(LINK_HEADER)).toBeNull();
      expect(canonicalResponse.headers.get(ANTI_SELEK_DEPRECATED_HEADER)).toBeNull();

      const legacyResponse = await (legacy[method] as RouteHandler)(
        new Request(`http://localhost${routeCase.legacyPath}`),
        context
      );

      expect(legacyResponse.headers.get(DEPRECATION_HEADER)).toBe("true");
      expect(legacyResponse.headers.get(LINK_HEADER)).toBe(
        `<${canonicalPath}>; rel="successor-version"`
      );
      expect(legacyResponse.headers.get(ANTI_SELEK_DEPRECATED_HEADER)).toBe(
        DEPRECATED_COMMUNITY_CONTRACT_MESSAGE
      );
    }
  });
});
