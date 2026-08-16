import { beforeEach, describe, expect, it, vi } from "vitest";

import { expectClubContractAliases } from "@/lib/clubContractAliasTestUtils";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clubFindMany: vi.fn(),
  clubMemberUpsert: vi.fn(),
  rateLimit: vi.fn(async () => null),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    club: {
      findMany: mocks.clubFindMany,
    },
    clubMember: {
      upsert: mocks.clubMemberUpsert,
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

import { POST } from "./route";

describe("club join API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(null);
    mocks.auth.mockResolvedValue({
      user: {
        id: "viewer-1",
        email: "viewer@example.com",
        isAdmin: false,
      },
    });
  });

  it("returns canonical club fields with legacy community aliases", async () => {
    mocks.clubFindMany.mockResolvedValue([
      {
        id: "community-1",
        name: "Club One",
        isTutorial: false,
        isPasswordProtected: false,
        passwordHash: null,
      },
    ]);
    mocks.clubMemberUpsert.mockResolvedValue({
      role: "MEMBER",
      club: {
        id: "community-1",
        name: "Club One",
        isPasswordProtected: false,
        createdAt: new Date("2026-05-18T00:00:00.000Z"),
      },
    });

    const response = await POST(
      new Request("http://localhost/api/clubs/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clubName: "Club One" }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expectClubContractAliases(body);
    expect(body.clubId).toBe("community-1");
    expect(body.communityId).toBe("community-1");
    expect(body.clubName).toBe("Club One");
    expect(body.communityName).toBe("Club One");
  });

  it("identifies the club-name field when the club cannot be found", async () => {
    mocks.clubFindMany.mockResolvedValue([]);

    const response = await POST(
      new Request("http://localhost/api/clubs/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clubName: "Missing Club" }),
      })
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Club not found",
      field: "clubName",
    });
  });

  it("identifies the password field for a protected club", async () => {
    mocks.clubFindMany.mockResolvedValue([
      {
        id: "community-1",
        name: "Club One",
        isTutorial: false,
        isPasswordProtected: true,
        passwordHash: "hash",
      },
    ]);

    const response = await POST(
      new Request("http://localhost/api/clubs/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clubName: "Club One" }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Password is required",
      field: "password",
    });
  });
});
