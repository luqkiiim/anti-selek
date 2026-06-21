import { describe, expect, it, vi } from "vitest";

const handlerMocks = vi.hoisted(() => {
  const makeHandlers = <T extends string>(methods: T[]) =>
    Object.fromEntries(methods.map((method) => [method, vi.fn()])) as Record<
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

const routeCases: Array<{
  name: string;
  methods: string[];
  feature: () => Promise<RouteModule>;
  canonical: () => Promise<RouteModule>;
  legacy: () => Promise<RouteModule>;
}> = [
  {
    name: "club collection",
    methods: ["GET", "POST"],
    feature: () => import("@/features/club-api/route"),
    canonical: () => import("@/app/api/clubs/route"),
    legacy: () => import("@/app/api/communities/route"),
  },
  {
    name: "join",
    methods: ["POST"],
    feature: () => import("@/features/club-api/join/route"),
    canonical: () => import("@/app/api/clubs/join/route"),
    legacy: () => import("@/app/api/communities/join/route"),
  },
  {
    name: "club detail",
    methods: ["GET", "PATCH", "DELETE"],
    feature: () => import("@/features/club-api/[id]/route"),
    canonical: () => import("@/app/api/clubs/[id]/route"),
    legacy: () => import("@/app/api/communities/[id]/route"),
  },
  {
    name: "club reset",
    methods: ["POST"],
    feature: () => import("@/features/club-api/[id]/reset/route"),
    canonical: () => import("@/app/api/clubs/[id]/reset/route"),
    legacy: () => import("@/app/api/communities/[id]/reset/route"),
  },
  {
    name: "collab candidates",
    methods: ["GET"],
    feature: () => import("@/features/club-api/[id]/collab-candidates/route"),
    canonical: () => import("@/app/api/clubs/[id]/collab-candidates/route"),
    legacy: () => import("@/app/api/communities/[id]/collab-candidates/route"),
  },
  {
    name: "collab roster",
    methods: ["GET"],
    feature: () => import("@/features/club-api/[id]/collab-roster/route"),
    canonical: () => import("@/app/api/clubs/[id]/collab-roster/route"),
    legacy: () => import("@/app/api/communities/[id]/collab-roster/route"),
  },
  {
    name: "claim requests",
    methods: ["GET", "POST"],
    feature: () => import("@/features/club-api/[id]/claim-requests/route"),
    canonical: () => import("@/app/api/clubs/[id]/claim-requests/route"),
    legacy: () => import("@/app/api/communities/[id]/claim-requests/route"),
  },
  {
    name: "claim request detail",
    methods: ["PATCH"],
    feature: () => import("@/features/club-api/[id]/claim-requests/[requestId]/route"),
    canonical: () => import("@/app/api/clubs/[id]/claim-requests/[requestId]/route"),
    legacy: () => import("@/app/api/communities/[id]/claim-requests/[requestId]/route"),
  },
  {
    name: "offline identity links",
    methods: ["GET", "POST"],
    feature: () => import("@/features/club-api/[id]/offline-identity-links/route"),
    canonical: () => import("@/app/api/clubs/[id]/offline-identity-links/route"),
    legacy: () => import("@/app/api/communities/[id]/offline-identity-links/route"),
  },
  {
    name: "offline identity link detail",
    methods: ["PATCH", "DELETE"],
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
    feature: () => import("@/features/club-api/[id]/members/route"),
    canonical: () => import("@/app/api/clubs/[id]/members/route"),
    legacy: () => import("@/app/api/communities/[id]/members/route"),
  },
  {
    name: "member link",
    methods: ["GET", "POST"],
    feature: () => import("@/features/club-api/[id]/members/link/route"),
    canonical: () => import("@/app/api/clubs/[id]/members/link/route"),
    legacy: () => import("@/app/api/communities/[id]/members/link/route"),
  },
  {
    name: "member detail",
    methods: ["PATCH", "DELETE"],
    feature: () => import("@/features/club-api/[id]/members/[userId]/route"),
    canonical: () => import("@/app/api/clubs/[id]/members/[userId]/route"),
    legacy: () => import("@/app/api/communities/[id]/members/[userId]/route"),
  },
  {
    name: "member reset elo",
    methods: ["POST"],
    feature: () => import("@/features/club-api/[id]/members/[userId]/reset-elo/route"),
    canonical: () => import("@/app/api/clubs/[id]/members/[userId]/reset-elo/route"),
    legacy: () => import("@/app/api/communities/[id]/members/[userId]/reset-elo/route"),
  },
  {
    name: "member password",
    methods: ["POST"],
    feature: () => import("@/features/club-api/[id]/members/[userId]/password/route"),
    canonical: () => import("@/app/api/clubs/[id]/members/[userId]/password/route"),
    legacy: () => import("@/app/api/communities/[id]/members/[userId]/password/route"),
  },
  {
    name: "member merge candidates",
    methods: ["GET"],
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
    feature: () => import("@/features/club-api/[id]/members/[userId]/merge/route"),
    canonical: () => import("@/app/api/clubs/[id]/members/[userId]/merge/route"),
    legacy: () => import("@/app/api/communities/[id]/members/[userId]/merge/route"),
  },
];

describe("club API route wrappers", () => {
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
      expect(legacy[method]).toBe(feature[method]);
    }
  });
});
