import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  accountFindUnique: vi.fn(),
  accountUpdateMany: vi.fn(),
  playerUpdateMany: vi.fn(),
  uploadAvatarObject: vi.fn(),
  cleanupSupersededAvatar: vi.fn(),
  rollbackUploadedAvatar: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.accountFindUnique,
      updateMany: mocks.accountUpdateMany,
    },
    player: { updateMany: mocks.playerUpdateMany },
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
vi.mock("@/lib/rateLimit", () => ({ rateLimit: vi.fn(async () => null) }));

import { POST } from "./route";

const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function createRequest() {
  const formData = new FormData();
  formData.append(
    "avatar",
    new File([PNG_BYTES], "account-photo.png", { type: "image/png" })
  );
  return new Request("http://localhost/api/user/me/avatar", {
    method: "POST",
    body: formData,
  });
}

describe("current account avatar route", () => {
  const previousBlobToken = process.env.BLOB_READ_WRITE_TOKEN;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.BLOB_READ_WRITE_TOKEN = "blob_rw_token";
    mocks.auth.mockResolvedValue({
      user: {
        id: "account-avatar-owner",
        playerId: "player-avatar-owner",
        isQuickAccess: false,
      },
    });
    mocks.accountFindUnique.mockResolvedValue({
      id: "account-avatar-owner",
      avatarKey: "https://blob.vercel-storage.com/avatars/accounts/old.png",
      isActive: true,
    });
    mocks.accountUpdateMany.mockResolvedValue({ count: 1 });
    mocks.uploadAvatarObject.mockResolvedValue(
      "https://blob.vercel-storage.com/avatars/accounts/account-avatar-owner/new.png"
    );
  });

  afterAll(() => {
    process.env.BLOB_READ_WRITE_TOKEN = previousBlobToken;
  });

  it("updates the authenticated Account avatar without writing to its owned Player", async () => {
    const response = await POST(createRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      avatarUrl:
        "https://blob.vercel-storage.com/avatars/accounts/account-avatar-owner/new.png",
    });
    expect(mocks.accountFindUnique).toHaveBeenCalledWith({
      where: { id: "account-avatar-owner" },
      select: { id: true, avatarKey: true, isActive: true },
    });
    expect(mocks.uploadAvatarObject).toHaveBeenCalledWith(
      expect.objectContaining({
        avatarPathname: expect.stringMatching(
          /^avatars\/accounts\/account-avatar-owner\/\d+-[a-f0-9]+\.png$/
        ),
        contentType: "image/png",
      })
    );
    expect(mocks.accountUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "account-avatar-owner",
        avatarKey: "https://blob.vercel-storage.com/avatars/accounts/old.png",
      },
      data: {
        avatarKey:
          "https://blob.vercel-storage.com/avatars/accounts/account-avatar-owner/new.png",
      },
    });
    expect(mocks.playerUpdateMany).not.toHaveBeenCalled();
    expect(mocks.cleanupSupersededAvatar).toHaveBeenCalledWith({
      previousAvatarKey: "https://blob.vercel-storage.com/avatars/accounts/old.png",
      nextAvatarKey:
        "https://blob.vercel-storage.com/avatars/accounts/account-avatar-owner/new.png",
    });
  });
});
