import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clubFindUnique: vi.fn(),
  clubFindMany: vi.fn(),
  clubMemberFindUnique: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    club: {
      findUnique: mocks.clubFindUnique,
      findMany: mocks.clubFindMany,
    },
    clubMember: {
      findUnique: mocks.clubMemberFindUnique,
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
      `http://localhost/api/clubs/community-1/collab-candidates?search=${encodeURIComponent(search)}`
    ),
    { params: Promise.resolve({ id: "community-1" }) }
  );
}

describe("collab club candidate search route", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", isAdmin: false, email: "admin@example.com" },
    });
    mocks.clubFindUnique.mockResolvedValue({
      id: "community-1",
      isTutorial: false,
    });
    mocks.clubMemberFindUnique.mockResolvedValue({ role: "ADMIN" });
    mocks.clubFindMany.mockResolvedValue([
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
    expect(mocks.clubFindMany).not.toHaveBeenCalled();
  });

  it("rejects quick-access users", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "quick-1", isQuickAccess: true },
    });

    const response = await getCandidates("pa");

    expect(response.status).toBe(403);
    expect(mocks.clubFindMany).not.toHaveBeenCalled();
  });

  it("requires a host club admin or staff member", async () => {
    mocks.clubMemberFindUnique.mockResolvedValue({ role: "MEMBER" });

    const response = await getCandidates("pa");

    expect(response.status).toBe(403);
    expect(mocks.clubFindMany).not.toHaveBeenCalled();
  });

  it("allows staff to search outgoing collab candidates", async () => {
    mocks.clubMemberFindUnique.mockResolvedValue({ role: "STAFF" });

    const response = await getCandidates("partner");

    expect(response.status).toBe(200);
    expect(mocks.clubFindMany).toHaveBeenCalled();
  });

  it("returns an empty result without querying all clubs for short searches", async () => {
    const response = await getCandidates("p");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual([]);
    expect(mocks.clubFindMany).not.toHaveBeenCalled();
  });

  it("searches by name, excludes the host club, caps results, and maps counts", async () => {
    const response = await getCandidates("partner");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.clubFindMany).toHaveBeenCalledWith({
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
