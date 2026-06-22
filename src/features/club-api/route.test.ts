import { beforeEach, describe, expect, it, vi } from "vitest";

import { expectClubContractAliases } from "@/lib/clubContractAliasTestUtils";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clubCreate: vi.fn(),
  clubFindMany: vi.fn(),
  clubMemberFindMany: vi.fn(),
  rateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    club: {
      create: mocks.clubCreate,
      findMany: mocks.clubFindMany,
    },
    clubMember: {
      findMany: mocks.clubMemberFindMany,
    },
  },
}));

vi.mock("@/lib/globalAdmin", () => ({
  isGlobalAdminEmail: vi.fn(() => false),
}));

vi.mock("@/lib/quickAccess", () => ({
  getQuickAccessDeniedMessage: vi.fn(() => "Denied"),
  isQuickAccessSession: vi.fn(
    (session: { user?: { isQuickAccess?: boolean } } | null | undefined) =>
      !!session?.user?.isQuickAccess
  ),
  normalizeNameLookupKey: vi.fn((value: string) =>
    value.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
  ),
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: mocks.rateLimit,
}));

import { GET, POST } from "./route";

function mockSignedInUser() {
  mocks.auth.mockResolvedValue({
    user: {
      id: "viewer-1",
      email: "viewer@example.com",
      isAdmin: false,
    },
  });
}

describe("club collection API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(null);
    mockSignedInUser();
  });

  it("returns canonical club fields with legacy community aliases", async () => {
    mocks.clubMemberFindMany.mockResolvedValue([
      {
        role: "ADMIN",
        club: {
          id: "community-1",
          name: "Club One",
          createdById: "viewer-1",
          isTutorial: false,
          isPasswordProtected: false,
          createdAt: new Date("2026-05-18T00:00:00.000Z"),
          _count: {
            members: 2,
            sessions: 1,
          },
        },
      },
    ]);

    const response = await GET(new Request("http://localhost/api/clubs"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toHaveLength(1);
    expectClubContractAliases(body[0]);
    expect(body[0].clubId).toBe("community-1");
    expect(body[0].communityId).toBe("community-1");
    expect(body[0].clubName).toBe("Club One");
    expect(body[0].communityName).toBe("Club One");
  });

  it("returns canonical and legacy aliases when creating a club", async () => {
    mocks.clubFindMany.mockResolvedValue([]);
    mocks.clubCreate.mockResolvedValue({
      id: "community-2",
      name: "New Club",
      isPasswordProtected: false,
      createdAt: new Date("2026-05-19T00:00:00.000Z"),
    });

    const response = await POST(
      new Request("http://localhost/api/clubs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clubName: "New Club" }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expectClubContractAliases(body);
    expect(body.clubId).toBe("community-2");
    expect(body.communityId).toBe("community-2");
    expect(body.clubName).toBe("New Club");
    expect(body.communityName).toBe("New Club");
  });
});
