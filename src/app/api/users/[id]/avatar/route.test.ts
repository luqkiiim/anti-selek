import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AVATAR_MAX_FILE_BYTES } from "@/lib/avatar";

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

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function createAvatarRequest({
  url = "http://localhost/api/users/user-1/avatar",
  file = new File([PNG_BYTES], "avatar.png", {
    type: "image/png",
  }),
}: {
  url?: string;
  file?: File;
} = {}) {
  const formData = new FormData();
  formData.append("avatar", file);

  return new Request(url, {
    method: "POST",
    body: formData,
  });
}

describe("user avatar route", () => {
  const previousBlobToken = process.env.BLOB_READ_WRITE_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "blob_rw_token";

    mocks.uploadAvatarObject.mockResolvedValue(
      "https://blob.vercel-storage.com/avatars/user-1/123-avatar.png"
    );
    mocks.userUpdate.mockImplementation(
      async ({ data }: { data: { avatarKey?: string | null } }) => ({
        avatarKey: data.avatarKey ?? null,
      })
    );
  });

  afterAll(() => {
    process.env.BLOB_READ_WRITE_TOKEN = previousBlobToken;
  });

  it("uploads an avatar for a claimed owner", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "user-1", isAdmin: false, isQuickAccess: false },
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      avatarKey: "https://blob.vercel-storage.com/avatars/user-1/old.jpg",
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
    expect(body.avatarUrl).toBe(
      "https://blob.vercel-storage.com/avatars/user-1/123-avatar.png"
    );
    expect(mocks.cleanupSupersededAvatar).toHaveBeenCalledWith({
      previousAvatarKey: "https://blob.vercel-storage.com/avatars/user-1/old.jpg",
      nextAvatarKey: "https://blob.vercel-storage.com/avatars/user-1/123-avatar.png",
    });
  });

  it("rejects avatars above the 4MB limit", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "user-1", isAdmin: false, isQuickAccess: false },
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      avatarKey: null,
      isClaimed: true,
      name: "Owner",
    });

    const response = await POST(
      createAvatarRequest({
        file: new File([new Uint8Array(AVATAR_MAX_FILE_BYTES + 1)], "big.png", {
          type: "image/png",
        }),
      }),
      {
        params: Promise.resolve({ id: "user-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Avatar images must be 4MB or smaller after cropping.");
    expect(mocks.uploadAvatarObject).not.toHaveBeenCalled();
  });

  it("rejects files whose bytes do not match the declared image type", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "user-1", isAdmin: false, isQuickAccess: false },
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      avatarKey: null,
      isClaimed: true,
      name: "Owner",
    });

    const response = await POST(
      createAvatarRequest({
        file: new File([new Uint8Array([0x3c, 0x73, 0x76, 0x67])], "avatar.png", {
          type: "image/png",
        }),
      }),
      {
        params: Promise.resolve({ id: "user-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "The prepared avatar does not contain valid PNG image data. Try selecting the image again, or export it as JPG, PNG, or WebP."
    );
    expect(mocks.uploadAvatarObject).not.toHaveBeenCalled();
  });

  it("returns 503 when blob storage is not configured", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "";
    mocks.auth.mockResolvedValue({
      user: { id: "user-1", isAdmin: false, isQuickAccess: false },
    });
    mocks.userFindUnique.mockResolvedValue({
      id: "user-1",
      avatarKey: null,
      isClaimed: true,
      name: "Owner",
    });

    const response = await POST(createAvatarRequest(), {
      params: Promise.resolve({ id: "user-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toBe("Avatar storage is not configured");
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
      createAvatarRequest({
        url: "http://localhost/api/users/placeholder-1/avatar?communityId=community-1",
      }),
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
      avatarKey: "https://blob.vercel-storage.com/avatars/user-9/avatar.jpg",
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
      previousAvatarKey: "https://blob.vercel-storage.com/avatars/user-9/avatar.jpg",
      nextAvatarKey: null,
    });
  });
});
