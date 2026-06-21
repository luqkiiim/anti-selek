import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  logAuditEvent: vi.fn(),
  rateLimit: vi.fn(async () => null),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      update: mocks.userUpdate,
    },
  },
}));

vi.mock("@/lib/rateLimit", () => ({
  rateLimit: mocks.rateLimit,
}));

vi.mock("@/lib/serverAudit", () => ({
  logAuditEvent: mocks.logAuditEvent,
}));

import { GET, PATCH } from "./route";

function buildUser(overrides?: Partial<{
  id: string;
  email: string | null;
  name: string;
  avatarKey: string | null;
  isClaimed: boolean;
  gender: string;
  partnerPreference: string;
  mixedSideOverride: string | null;
  elo: number;
  createdAt: Date;
  selfNameChangedAt: Date | null;
}>) {
  return {
    id: "user-1",
    email: "user@example.com",
    name: "Owner",
    avatarKey: "https://blob.vercel-storage.com/avatars/user-1/avatar.jpg",
    isClaimed: true,
    gender: "MALE",
    partnerPreference: "OPEN",
    mixedSideOverride: null,
    elo: 1200,
    createdAt: new Date("2026-05-18T00:00:00.000Z"),
    selfNameChangedAt: null,
    ...overrides,
  };
}

function buildSession(overrides?: Partial<{
  id: string;
  email: string;
  isAdmin: boolean;
  isQuickAccess: boolean;
  quickAccessClubId: string | null;
}>) {
  return {
    user: {
      id: "user-1",
      email: "user@example.com",
      isAdmin: false,
      isQuickAccess: false,
      quickAccessClubId: null,
      ...overrides,
    },
  };
}

describe("current user route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(null);
  });

  it("returns avatarUrl for the current user payload", async () => {
    mocks.auth.mockResolvedValue(buildSession());
    mocks.userFindUnique.mockResolvedValue(buildUser());

    const response = await GET(new Request("http://localhost/api/user/me"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.avatarUrl).toBe(
      "https://blob.vercel-storage.com/avatars/user-1/avatar.jpg"
    );
  });

  it("returns rename metadata for a full account with an unused rename", async () => {
    mocks.auth.mockResolvedValue(buildSession());
    mocks.userFindUnique.mockResolvedValue(buildUser());

    const response = await GET(new Request("http://localhost/api/user/me"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.canRenameName).toBe(true);
    expect(body.user.selfNameChangedAt).toBeNull();
  });

  it("returns rename metadata for a quick-access profile without rename access", async () => {
    mocks.auth.mockResolvedValue(
      buildSession({
        isQuickAccess: true,
        quickAccessClubId: "community-1",
      })
    );
    mocks.userFindUnique.mockResolvedValue(
      buildUser({
        isClaimed: false,
      })
    );

    const response = await GET(new Request("http://localhost/api/user/me"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.canRenameName).toBe(false);
    expect(body.user.isQuickAccess).toBe(true);
  });

  it("allows a full-account user to rename once", async () => {
    mocks.auth.mockResolvedValue(buildSession());
    mocks.userFindUnique.mockResolvedValue(buildUser());
    mocks.userUpdate.mockResolvedValue(
      buildUser({
        name: "Alex Tan",
        selfNameChangedAt: new Date("2026-05-23T09:00:00.000Z"),
      })
    );

    const response = await PATCH(
      new Request("http://localhost/api/user/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Alex Tan",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "user-1" },
        data: expect.objectContaining({
          name: "Alex Tan",
          selfNameChangedAt: expect.any(Date),
        }),
      })
    );
    expect(body.user.name).toBe("Alex Tan");
    expect(body.user.canRenameName).toBe(false);
    expect(mocks.logAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.rename_self",
        details: expect.objectContaining({
          previousName: "Owner",
          nextName: "Alex Tan",
        }),
      })
    );
  });

  it("rejects a second rename after the one-time change has been used", async () => {
    mocks.auth.mockResolvedValue(buildSession());
    mocks.userFindUnique.mockResolvedValue(
      buildUser({
        selfNameChangedAt: new Date("2026-05-22T09:00:00.000Z"),
      })
    );

    const response = await PATCH(
      new Request("http://localhost/api/user/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Alex Tan",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("Player name can only be changed once");
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("treats an unchanged name as a no-op without consuming the rename", async () => {
    mocks.auth.mockResolvedValue(buildSession());
    mocks.userFindUnique.mockResolvedValue(buildUser());

    const response = await PATCH(
      new Request("http://localhost/api/user/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Owner",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.name).toBe("Owner");
    expect(body.user.canRenameName).toBe(true);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("rejects quick-access users", async () => {
    mocks.auth.mockResolvedValue(
      buildSession({
        isQuickAccess: true,
        quickAccessClubId: "community-1",
      })
    );

    const response = await PATCH(
      new Request("http://localhost/api/user/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Alex Tan",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Sign up or log in with a full account to use this feature");
  });

  it("rejects unauthenticated users", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await PATCH(
      new Request("http://localhost/api/user/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Alex Tan",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Not authenticated");
  });

  it("rejects invalid normalized names", async () => {
    mocks.auth.mockResolvedValue(buildSession());
    mocks.userFindUnique.mockResolvedValue(buildUser());

    const response = await PATCH(
      new Request("http://localhost/api/user/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "!!!",
        }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Player name must include letters or numbers");
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});
