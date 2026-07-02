import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AVATAR_MAX_FILE_BYTES } from "@/lib/avatar";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  clubFindUnique: vi.fn(),
  clubUpdate: vi.fn(),
  clubMemberFindUnique: vi.fn(),
  uploadAvatarObject: vi.fn(),
  cleanupSupersededAvatar: vi.fn(),
  rollbackUploadedAvatar: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    club: {
      findUnique: mocks.clubFindUnique,
      update: mocks.clubUpdate,
    },
    clubMember: {
      findUnique: mocks.clubMemberFindUnique,
    },
  },
}));

vi.mock("@/lib/avatarStorage", () => ({
  uploadAvatarObject: mocks.uploadAvatarObject,
  cleanupSupersededAvatar: mocks.cleanupSupersededAvatar,
  rollbackUploadedAvatar: mocks.rollbackUploadedAvatar,
}));

vi.mock("@/lib/errors", () => ({
  logError: mocks.logError,
  safeErrorResponse: vi.fn(() =>
    Response.json({ error: "Internal server error" }, { status: 500 })
  ),
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
  file = new File([PNG_BYTES], "club-logo.png", {
    type: "image/png",
  }),
}: {
  file?: File;
} = {}) {
  const formData = new FormData();
  formData.append("avatar", file);

  return new Request("http://localhost/api/clubs/community-1/avatar", {
    method: "POST",
    body: formData,
  });
}

describe("club avatar route", () => {
  const previousBlobToken = process.env.BLOB_READ_WRITE_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "blob_rw_token";

    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", isAdmin: false, isQuickAccess: false },
    });
    mocks.clubFindUnique.mockResolvedValue({
      id: "community-1",
      avatarKey: "https://blob.vercel-storage.com/avatars/clubs/community-1/old.png",
      createdById: "owner-1",
      isTutorial: false,
    });
    mocks.clubMemberFindUnique.mockResolvedValue({ role: "ADMIN" });
    mocks.uploadAvatarObject.mockResolvedValue(
      "https://blob.vercel-storage.com/avatars/clubs/community-1/new.png"
    );
    mocks.clubUpdate.mockImplementation(
      async ({ data }: { data: { avatarKey?: string | null } }) => ({
        avatarKey: data.avatarKey ?? null,
      })
    );
  });

  afterAll(() => {
    process.env.BLOB_READ_WRITE_TOKEN = previousBlobToken;
  });

  it("uploads a club avatar for a club admin", async () => {
    const response = await POST(createAvatarRequest(), {
      params: Promise.resolve({ id: "community-1" }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.avatarUrl).toBe(
      "https://blob.vercel-storage.com/avatars/clubs/community-1/new.png"
    );
    expect(mocks.uploadAvatarObject).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarPathname: expect.stringMatching(
          /^avatars\/clubs\/community-1\/\d+-[a-f0-9]+\.png$/
        ),
        contentType: "image/png",
      })
    );
    expect(mocks.clubUpdate).toHaveBeenCalledWith({
      where: { id: "community-1" },
      data: {
        avatarKey:
          "https://blob.vercel-storage.com/avatars/clubs/community-1/new.png",
      },
      select: { avatarKey: true },
    });
    expect(mocks.cleanupSupersededAvatar).toHaveBeenCalledWith({
      previousAvatarKey:
        "https://blob.vercel-storage.com/avatars/clubs/community-1/old.png",
      nextAvatarKey:
        "https://blob.vercel-storage.com/avatars/clubs/community-1/new.png",
    });
  });

  it("rejects non-admin club members", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "member-1", isAdmin: false, isQuickAccess: false },
    });
    mocks.clubMemberFindUnique.mockResolvedValue({ role: "MEMBER" });

    const response = await POST(createAvatarRequest(), {
      params: Promise.resolve({ id: "community-1" }),
    });

    expect(response.status).toBe(403);
    expect(mocks.uploadAvatarObject).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated requests", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await POST(createAvatarRequest(), {
      params: Promise.resolve({ id: "community-1" }),
    });

    expect(response.status).toBe(401);
    expect(mocks.clubFindUnique).not.toHaveBeenCalled();
    expect(mocks.uploadAvatarObject).not.toHaveBeenCalled();
  });

  it("rejects quick-access sessions", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "admin-1", isAdmin: false, isQuickAccess: true },
    });

    const response = await POST(createAvatarRequest(), {
      params: Promise.resolve({ id: "community-1" }),
    });

    expect(response.status).toBe(403);
    expect(mocks.uploadAvatarObject).not.toHaveBeenCalled();
  });

  it("rejects avatars above the 4MB limit", async () => {
    const response = await POST(
      createAvatarRequest({
        file: new File([new Uint8Array(AVATAR_MAX_FILE_BYTES + 1)], "big.png", {
          type: "image/png",
        }),
      }),
      {
        params: Promise.resolve({ id: "community-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Avatar images must be 4MB or smaller after cropping.");
    expect(mocks.uploadAvatarObject).not.toHaveBeenCalled();
  });

  it("rejects unsupported file types", async () => {
    const response = await POST(
      createAvatarRequest({
        file: new File([new Uint8Array([0x68, 0x69])], "logo.txt", {
          type: "text/plain",
        }),
      }),
      {
        params: Promise.resolve({ id: "community-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Only JPG, PNG, and WebP images are supported.");
    expect(mocks.uploadAvatarObject).not.toHaveBeenCalled();
  });

  it("rejects files whose bytes do not match the declared image type", async () => {
    const response = await POST(
      createAvatarRequest({
        file: new File([new Uint8Array([0x3c, 0x73, 0x76, 0x67])], "logo.png", {
          type: "image/png",
        }),
      }),
      {
        params: Promise.resolve({ id: "community-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe(
      "The prepared avatar does not contain valid PNG image data. Try selecting the image again, or export it as JPG, PNG, or WebP."
    );
    expect(mocks.uploadAvatarObject).not.toHaveBeenCalled();
  });

  it("rolls back an uploaded object when persistence fails", async () => {
    mocks.clubUpdate.mockRejectedValueOnce(new Error("database down"));

    const response = await POST(createAvatarRequest(), {
      params: Promise.resolve({ id: "community-1" }),
    });

    expect(response.status).toBe(500);
    expect(mocks.rollbackUploadedAvatar).toHaveBeenCalledWith({
      uploadedAvatarKey:
        "https://blob.vercel-storage.com/avatars/clubs/community-1/new.png",
    });
  });

  it("removes a club avatar for a global admin", async () => {
    mocks.auth.mockResolvedValue({
      user: { id: "global-admin", isAdmin: true, isQuickAccess: false },
    });

    const response = await DELETE(
      new Request("http://localhost/api/clubs/community-1/avatar", {
        method: "DELETE",
      }),
      {
        params: Promise.resolve({ id: "community-1" }),
      }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ avatarUrl: null });
    expect(mocks.clubUpdate).toHaveBeenCalledWith({
      where: { id: "community-1" },
      data: { avatarKey: null },
    });
    expect(mocks.cleanupSupersededAvatar).toHaveBeenCalledWith({
      previousAvatarKey:
        "https://blob.vercel-storage.com/avatars/clubs/community-1/old.png",
      nextAvatarKey: null,
    });
  });
});
