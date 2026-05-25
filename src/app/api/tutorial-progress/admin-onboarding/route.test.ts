import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rateLimit: vi.fn(async () => null),
  tutorialProgressFindUnique: vi.fn(),
  tutorialProgressUpsert: vi.fn(),
  communityMemberFindMany: vi.fn(),
  sessionFindFirst: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    tutorialProgress: {
      findUnique: mocks.tutorialProgressFindUnique,
      upsert: mocks.tutorialProgressUpsert,
    },
    communityMember: {
      findMany: mocks.communityMemberFindMany,
    },
    session: {
      findFirst: mocks.sessionFindFirst,
    },
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: mocks.rateLimit,
}));

import { GET, PATCH } from "./route";

function buildSession(overrides?: Partial<{
  id: string;
  email: string;
  isAdmin: boolean;
  isQuickAccess: boolean;
  quickAccessCommunityId: string | null;
}>) {
  return {
    user: {
      id: "user-1",
      email: "admin@example.com",
      isAdmin: false,
      isQuickAccess: false,
      quickAccessCommunityId: null,
      ...overrides,
    },
  };
}

function buildMembership(overrides?: Partial<{
  communityId: string;
  members: number;
  sessions: number;
}>) {
  const values = {
    communityId: "community-1",
    members: 2,
    sessions: 1,
    ...overrides,
  };

  return {
    communityId: values.communityId,
    community: {
      id: values.communityId,
      createdAt: new Date("2026-05-25T00:00:00.000Z"),
      _count: {
        members: values.members,
        sessions: values.sessions,
      },
    },
  };
}

describe("admin onboarding progress route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(null);
    mocks.tutorialProgressFindUnique.mockResolvedValue(null);
    mocks.tutorialProgressUpsert.mockResolvedValue({});
    mocks.communityMemberFindMany.mockResolvedValue([buildMembership()]);
    mocks.sessionFindFirst.mockResolvedValue({ id: "session-1" });
  });

  it("returns inferred admin onboarding progress", async () => {
    mocks.auth.mockResolvedValue(buildSession());

    const response = await GET(
      new Request("http://localhost/api/tutorial-progress/admin-onboarding")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.visible).toBe(true);
    expect(body.primaryCommunityId).toBe("community-1");
    expect(body.completedStepIds).toEqual([
      "admin-community",
      "players",
      "host-session",
      "session-workflow",
    ]);
  });

  it("hides onboarding for quick-access users", async () => {
    mocks.auth.mockResolvedValue(
      buildSession({
        isQuickAccess: true,
        quickAccessCommunityId: "community-1",
      })
    );

    const response = await GET(
      new Request("http://localhost/api/tutorial-progress/admin-onboarding")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.visible).toBe(false);
    expect(mocks.communityMemberFindMany).not.toHaveBeenCalled();
  });

  it("updates stored progress and dismissal state", async () => {
    mocks.auth.mockResolvedValue(buildSession());
    mocks.tutorialProgressFindUnique.mockResolvedValue({
      completedStepIdsJson: "[]",
      dismissedAt: null,
    });

    const response = await PATCH(
      new Request("http://localhost/api/tutorial-progress/admin-onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completedStepIds: ["followups"],
          dismissed: true,
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mocks.tutorialProgressUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          completedStepIdsJson: JSON.stringify(["followups"]),
          dismissedAt: expect.any(Date),
        }),
        update: expect.objectContaining({
          completedStepIdsJson: JSON.stringify(["followups"]),
          dismissedAt: expect.any(Date),
        }),
      })
    );
  });

  it("rejects invalid patch payloads", async () => {
    mocks.auth.mockResolvedValue(buildSession());

    const response = await PATCH(
      new Request("http://localhost/api/tutorial-progress/admin-onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completedStepIds: "followups",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("completedStepIds must be an array");
    expect(mocks.tutorialProgressUpsert).not.toHaveBeenCalled();
  });
});
