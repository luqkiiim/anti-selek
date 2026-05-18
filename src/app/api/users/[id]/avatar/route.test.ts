import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  communityMemberFindUnique: vi.fn(),
  uploadAvatarObject: vi.fn(),
  cleanupSupersededAvatar: vi.fn(),
  rollbackUploadedAvatar: vi.fn(),
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
    communityMember: {
      findUnique: mocks.communityMemberFindUnique,
    },
  },
}));

vi.mock("@/lib/avatarStorage", () => ({
  uploadAvatarObject: mocks.uploadAvatarObject,
  cleanupSupersededAvatar: mocks.cleanupSupersededAvatar,
  rollbackUploadedAvatar: mocks.rollbackUploadedAvatar,
}));

vi.mock("@/lib/rateLimit", () => ({
  checkInvalidTargetRateLimit: vi.fn(async () => null),
  invalidTargetResponse: vi.fn(async () =>
    Response.json({ error: "Unauthorized" }, { status: 403 })
  ),
  rateLimit: vi.fn(async () => null),
}));

import { DELETE, POST } from "./route";

function createAvatarRequest(url = "http://localhost/api/users/user-1/avatar") {
  const formData = new FormData();
  formData.append(
    "avatar",
    new File([new Uint8Array([1, 2, 3])], "avatar.png", {
      type: "image/png",
    })
  );

  return new Request(url, {
    method: "POST",
    body: formData,
  });
}

describe("user avatar route", () => {
  const previousEnv = {
    AVATAR_S3_ENDPOINT: process.env.AVATAR_S3_ENDPOINT,
    AVATAR_S3_REGION: process.env.AVATAR_S3_REGION,
    AVATAR_S3_BUCKET: process.env.AVATAR_S3_BUCKET,
    AVATAR_S3_ACCESS_KEY_ID: process.env.AVATAR_S3_ACCESS_KEY_ID,
    AVATAR_S3_SECRET_ACCESS_KEY: process.env.AVATAR_S3_SECRET_ACCESS_KEY,
    AVATAR_PUBLIC_BASE_URL: process.env.AVATAR_PUBLIC_BASE_URL,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AVATAR_S3_ENDPOINT = "https://s3.test";
    process.env.AVATAR_S3_REGION = "auto";
    process.env.AVATAR_S3_BUCKET = "avatars";
    process.env.AVATAR_S3_ACCESS_KEY_ID = "key";
    process.env.AVATAR_S3_SECRET_ACCESS_KEY = "secret";
    process.env.AVATAR_PUBLIC_BASE_URL = "https://cdn.test";

    mocks.userUpdate.mockImplementation(async ({ data }: { data: { avatarKey?: string | null } }) => ({
      avatarKey: data.avatarKey ?? null,
    }));
  });

  afterAll(() => {
    process.env.AVATAR_S3_ENDPOINT = previousEnv.AVATAR_S3_ENDPOINT;
    process.env.AVATAR_S3_REGION = previousEnv.AVATAR_S3_REGION;
    process.env.AVATAR_S3_BUCKET = previousEnv.AVATAR_S3_BUCKET;
    process.env.AVATAR_S3_ACCESS_KEY_ID = previousEnv.AVATAR_S3_ACCESS_KEY_ID;
    process.env.AVATAR_S3_SECRET_ACCESS_KEY =
      previousEnv.AVATAR_S3_SECRET_ACCESS_KEY;
    process.env.AVATAR_PUBLIC_BASE_URL = previousEnv.AVATAR_PUBLIC_BASE_URL;
  });

  it("uploads an avatar for a claimed owner", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "user-1", isAdmin: false, isQuickAccess: false },
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      avatarKey: "avatars/user-1/old.jpg",
      isClaimed: true,
      name: "Owner",
    });

    const response = await POST(createAvatarRequest(), {
      params: Promise.resolve({ id: "user-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.uploadAvatarObject).toHaveBeenCalledTimes(1);
    expect(mocks.userUpdate).toHaveBeenCalledTimes(1);
    expect(body.avatarUrl).toMatch(/^https:\/\/cdn\.test\/avatars\/user-1\//);
    expect(mocks.cleanupSupersededAvatar).toHaveBeenCalledWith({
      previousAvatarKey: "avatars/user-1/old.jpg",
      nextAvatarKey: expect.stringMatching(/^avatars\/user-1\//),
    });
  });

  it("rejects quick-access self-management", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "user-1", isAdmin: false, isQuickAccess: true },
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      avatarKey: null,
      isClaimed: true,
      name: "Quick User",
    });

    const response = await POST(createAvatarRequest(), {
      params: Promise.resolve({ id: "user-1" }),
    });

    expect(response.status).toBe(403);
    expect(mocks.uploadAvatarObject).not.toHaveBeenCalled();
  });

  it("allows a community admin to manage a placeholder avatar", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", isAdmin: false, isQuickAccess: false },
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "placeholder-1",
      avatarKey: null,
      isClaimed: false,
      name: "Placeholder",
    });
    mocks.communityMemberFindUnique
      .mockResolvedValueOnce({ role: "ADMIN" })
      .mockResolvedValueOnce({ role: "MEMBER" });

    const response = await POST(
      createAvatarRequest(
        "http://localhost/api/users/placeholder-1/avatar?communityId=community-1"
      ),
      {
        params: Promise.resolve({ id: "placeholder-1" }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.communityMemberFindUnique).toHaveBeenCalledTimes(2);
  });

  it("removes an avatar and clears the stored key", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", isAdmin: true, isQuickAccess: false },
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "user-9",
      avatarKey: "avatars/user-9/avatar.jpg",
      isClaimed: false,
      name: "Managed User",
    });

    const response = await DELETE(
      new Request("http://localhost/api/users/user-9/avatar", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ id: "user-9" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ avatarUrl: null });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: "user-9" },
      data: { avatarKey: null },
    });
    expect(mocks.cleanupSupersededAvatar).toHaveBeenCalledWith({
      previousAvatarKey: "avatars/user-9/avatar.jpg",
      nextAvatarKey: null,
    });
  });
});
