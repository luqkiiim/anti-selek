import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

import { expectClubContractAliases } from "@/lib/clubContractAliasTestUtils";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clubFindMany: vi.fn(),
  clubMemberUpsert: vi.fn(),
  account: vi.fn(),
  submit: vi.fn(),
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
    user: { findUnique: mocks.account },
  },
}));

vi.mock("@/lib/clubAdmissions", () => ({ admissionTransaction: async (_db: unknown, callback: (tx: object) => unknown) => callback({}), submitClubAdmission: mocks.submit }));
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
    mocks.account.mockResolvedValue({ id: "viewer-1", name: "Account Name", gender: "MALE", isActive: true });
    mocks.submit.mockResolvedValue({ id: "request-1", status: "PENDING" });
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
    expect(body.status).toBe("PENDING");
    expect(mocks.clubMemberUpsert).not.toHaveBeenCalled();
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

  it("requires the legacy protected-club password and cannot forge a target Player", async () => {
    const password = "LegacyJoinPasswordForTest";
    mocks.clubFindMany.mockResolvedValue([
      {
        id: "club-protected",
        name: "Protected Club",
        isTutorial: false,
        isPasswordProtected: true,
        passwordHash: await bcrypt.hash(password, 4),
      },
    ]);

    const invalid = await POST(new Request("http://localhost/api/clubs/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clubName: "Protected Club", password: "wrong", targetPlayerId: "forged-player" }),
    }));
    expect(invalid.status).toBe(403);
    expect(mocks.submit).not.toHaveBeenCalled();

    const accepted = await POST(new Request("http://localhost/api/clubs/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clubName: "Protected Club", password, targetPlayerId: "forged-player", targetUserId: "forged-player" }),
    }));
    expect(accepted.status).toBe(200);
    expect(mocks.submit).toHaveBeenCalledTimes(1);
    const submitted = mocks.submit.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(submitted).toEqual({
      clubId: "club-protected",
      requesterUserId: "viewer-1",
      kind: "NEW_PLAYER",
      proposedPlayerName: "Account Name",
      proposedGender: "MALE",
    });
    expect(submitted).not.toHaveProperty("requestedPlayerId");
  });
});
