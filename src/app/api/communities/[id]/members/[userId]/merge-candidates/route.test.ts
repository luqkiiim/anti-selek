import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  communityMemberFindUnique: vi.fn(),
  communityMemberFindMany: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    communityMember: {
      findUnique: mocks.communityMemberFindUnique,
      findMany: mocks.communityMemberFindMany,
    },
    user: {
      findMany: mocks.userFindMany,
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
      `http://localhost/api/communities/community-1/members/source-user/merge-candidates?search=${encodeURIComponent(search)}`
    ),
    { params: Promise.resolve({ id: "community-1", userId: "source-user" }) }
  );
}

describe("duplicate player merge candidates route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", email: "admin@example.com", isAdmin: false },
    });
    mocks.communityMemberFindUnique.mockImplementation(({ where }) => {
      const userId = where.communityId_userId.userId;
      if (userId === "admin-1") return Promise.resolve({ role: "ADMIN" });
      if (userId === "source-user") {
        return Promise.resolve({
          user: { isClaimed: false, email: null },
        });
      }
      return Promise.resolve(null);
    });
    mocks.communityMemberFindMany.mockResolvedValue([
      { userId: "source-user" },
      { userId: "current-member" },
    ]);
  });

  it("rejects quick-access users", async () => {
    mocks.auth.mockResolvedValue({
      user: {
        id: "admin-1",
        email: "admin@example.com",
        isQuickAccess: true,
      },
    });

    const response = await getCandidates("Al");

    expect(response.status).toBe(403);
    expect(mocks.userFindMany).not.toHaveBeenCalled();
  });

  it("requires at least two non-space search characters", async () => {
    const response = await getCandidates(" A ");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
    expect(mocks.userFindMany).not.toHaveBeenCalled();
  });

  it("returns unclaimed placeholder candidates outside the current community", async () => {
    mocks.userFindMany.mockResolvedValue([
      {
        id: "target-user",
        name: "Alex Lee",
        communities: [
          {
            elo: 1210,
            community: { id: "community-2", name: "Partner Club" },
          },
        ],
      },
    ]);

    const response = await getCandidates("Alex");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: {
            notIn: ["source-user", "current-member"],
          },
          isClaimed: false,
          email: null,
          name: { contains: "Alex" },
          communities: { some: {} },
        }),
        take: 10,
      })
    );
    expect(body).toEqual([
      {
        id: "target-user",
        name: "Alex Lee",
        communities: [
          { id: "community-2", name: "Partner Club", elo: 1210 },
        ],
      },
    ]);
  });
});
