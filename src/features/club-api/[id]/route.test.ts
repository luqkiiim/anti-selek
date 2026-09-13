import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clubFindMany: vi.fn(),
  clubFindUnique: vi.fn(),
  clubMemberFindUnique: vi.fn(),
  clubUpdate: vi.fn(),
  rateLimit: vi.fn(async () => null),
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(() =>
    Response.json({ error: "Invalid target" }, { status: 404 })
  ),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    club: {
      findMany: mocks.clubFindMany,
      findUnique: mocks.clubFindUnique,
      update: mocks.clubUpdate,
    },
    clubMember: {
      findUnique: mocks.clubMemberFindUnique,
    },
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: mocks.rateLimit,
  checkInvalidTargetRateLimit: mocks.checkInvalidTargetRateLimit,
  invalidTargetResponse: mocks.invalidTargetResponse,
}));

vi.mock("@/lib/quickAccess", () => ({
  canQuickAccessClub: vi.fn(() => true),
  getQuickAccessDeniedMessage: vi.fn(() => "Denied"),
  isQuickAccessSession: vi.fn(
    (session: { user?: { isQuickAccess?: boolean } } | null | undefined) =>
      !!session?.user?.isQuickAccess
  ),
  normalizeNameLookupKey: vi.fn((value: string) =>
    value.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
  ),
}));

vi.mock("@/lib/errors", () => ({
  logError: vi.fn(),
  safeErrorResponse: vi.fn(() =>
    Response.json({ error: "Internal server error" }, { status: 500 })
  ),
}));

import { PATCH } from "./route";

const session = {
  user: {
    id: "owner-1",
    email: "owner@example.com",
    isAdmin: false,
    isQuickAccess: false,
  },
};

function existingClub() {
  return {
    id: "club-1",
    createdById: "owner-1",
    rules: "",
    isPasswordProtected: false,
    isTutorial: false,
    tutorialOwnerId: null,
  };
}

describe("club settings rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue(session);
    mocks.clubMemberFindUnique.mockResolvedValue(null);
    mocks.clubFindUnique.mockResolvedValue(existingClub());
    mocks.clubFindMany.mockResolvedValue([]);
    mocks.rateLimit.mockResolvedValue(null);
    mocks.checkInvalidTargetRateLimit.mockResolvedValue(null);
  });

  it("persists plain-text rules, including line breaks", async () => {
    const rules = "Be kind.\nRotate after each game.";
    mocks.clubUpdate.mockResolvedValue({
      id: "club-1",
      name: "Club One",
      rules,
      isPasswordProtected: false,
      updatedAt: new Date("2026-09-14T00:00:00.000Z"),
    });

    const response = await PATCH(
      new Request("http://localhost/api/clubs/club-1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rules }),
      }),
      { params: Promise.resolve({ id: "club-1" }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: "club-1",
      rules,
    });
    expect(mocks.clubUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { rules } })
    );
  });

  it("allows clearing rules", async () => {
    mocks.clubUpdate.mockResolvedValue({
      id: "club-1",
      name: "Club One",
      rules: "",
      isPasswordProtected: false,
      updatedAt: new Date("2026-09-14T00:00:00.000Z"),
    });

    const response = await PATCH(
      new Request("http://localhost/api/clubs/club-1", {
        method: "PATCH",
        body: JSON.stringify({ rules: "" }),
      }),
      { params: Promise.resolve({ id: "club-1" }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.clubUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { rules: "" } })
    );
  });

  it("rejects rules longer than 3000 characters", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/clubs/club-1", {
        method: "PATCH",
        body: JSON.stringify({ rules: "x".repeat(3001) }),
      }),
      { params: Promise.resolve({ id: "club-1" }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Club rules must be 3000 characters or fewer",
    });
    expect(mocks.clubUpdate).not.toHaveBeenCalled();
  });
});
