import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  communityFindUnique: vi.fn(),
  communityFindMany: vi.fn(),
  communityMemberFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    community: {
      findUnique: mocks.communityFindUnique,
      findMany: mocks.communityFindMany,
    },
    communityMember: {
      findUnique: mocks.communityMemberFindUnique,
    },
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(async () =>
    Response.json({ error: "Unauthorized" }, { status: 403 })
  ),
  rateLimit: vi.fn(async () => null),
}));

import { GET } from "./route";

function getCandidates(search: string) {
  return GET(
    new Request(
      `http://localhost/api/communities/community-1/collab-candidates?search=${encodeURIComponent(search)}`
    ),
    { params: Promise.resolve({ id: "community-1" }) }
  );
}

describe("collab community candidate search route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", isAdmin: false, email: "admin@example.com" },
    });
    mocks.communityFindUnique.mockResolvedValue({
      id: "community-1",
      isTutorial: false,
    });
    mocks.communityMemberFindUnique.mockResolvedValue({ role: "ADMIN" });
    mocks.communityFindMany.mockResolvedValue([
      {
        id: "community-2",
        name: "Partner Club",
        _count: { members: 24 },
      },
    ]);
  });

  it("requires authentication", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await getCandidates("pa");

    expect(response.status).toBe(401);
    expect(mocks.communityFindMany).not.toHaveBeenCalled();
  });

  it("rejects quick-access users", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "quick-1", isQuickAccess: true },
    });

    const response = await getCandidates("pa");

    expect(response.status).toBe(403);
    expect(mocks.communityFindMany).not.toHaveBeenCalled();
  });

  it("requires a host community admin", async () => {
    mocks.communityMemberFindUnique.mockResolvedValue({ role: "MEMBER" });

    const response = await getCandidates("pa");

    expect(response.status).toBe(403);
    expect(mocks.communityFindMany).not.toHaveBeenCalled();
  });

  it("returns an empty result without querying all communities for short searches", async () => {
    const response = await getCandidates("p");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
    expect(mocks.communityFindMany).not.toHaveBeenCalled();
  });

  it("searches by name, excludes the host community, caps results, and maps counts", async () => {
    const response = await getCandidates("partner");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.communityFindMany).toHaveBeenCalledWith({
      where: {
        id: { not: "community-1" },
        isTutorial: false,
        name: { contains: "partner" },
      },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            members: true,
          },
        },
      },
      orderBy: { name: "asc" },
      take: 10,
    });
    expect(body).toEqual([
      {
        id: "community-2",
        name: "Partner Club",
        membersCount: 24,
      },
    ]);
  });
});
