import { describe, expect, it, vi } from "vitest";
import {
  AVATAR_MAX_FILE_BYTES,
  AVATAR_MAX_SOURCE_FILE_BYTES,
  buildAvatarObjectKey,
  getAvatarSourceValidationError,
  getAvatarUploadValidationError,
  isAvatarStorageConfigured,
  resolveAvatarUrl,
} from "@/lib/avatar";
import {
  cleanupSupersededAvatar,
  rollbackUploadedAvatar,
} from "@/lib/avatarStorage";

describe("avatar helpers", () => {
  it("builds stable object keys with the right extension", () => {
    const key = buildAvatarObjectKey({
      userId: "user-1",
      mimeType: "image/webp",
      now: 1234567890,
      randomSuffix: "abc123",
    });

    expect(key).toBe("avatars/user-1/1234567890-abc123.webp");
  });

  it("passes through stored public avatar URLs", () => {
    expect(
      resolveAvatarUrl(
        " https://blob.vercel-storage.com/avatars/u1/photo.jpg "
      )
    ).toBe("https://blob.vercel-storage.com/avatars/u1/photo.jpg");
    expect(resolveAvatarUrl(null)).toBeNull();
  });

  it("validates source files before cropping", () => {
    expect(
      getAvatarSourceValidationError({
        mimeType: "image/gif",
        size: 128,
      })
    ).toBe("Only JPG, PNG, and WebP images are supported.");

    expect(
      getAvatarSourceValidationError({
        mimeType: "image/png",
        size: AVATAR_MAX_FILE_BYTES + 1,
      })
    ).toBeNull();

    expect(
      getAvatarSourceValidationError({
        mimeType: "image/png",
        size: AVATAR_MAX_SOURCE_FILE_BYTES + 1,
      })
    ).toBe("Choose an image smaller than 20MB before cropping.");
  });

  it("validates final upload size after cropping", () => {
    expect(
      getAvatarUploadValidationError({
        mimeType: "image/png",
        size: AVATAR_MAX_FILE_BYTES + 1,
      })
    ).toBe("Avatar images must be 4MB or smaller after cropping.");

    expect(
      getAvatarUploadValidationError({
        mimeType: "image/png",
        size: 1024,
      })
    ).toBeNull();
  });

  it("detects blob storage only when the token exists", () => {
    expect(isAvatarStorageConfigured({} as NodeJS.ProcessEnv)).toBe(false);
    expect(
      isAvatarStorageConfigured({
        BLOB_READ_WRITE_TOKEN: "blob_rw_token",
      } as unknown as NodeJS.ProcessEnv)
    ).toBe(true);
  });

  it("cleans up superseded keys and rolls back failed uploads", async () => {
    const deleteObject = vi.fn(async () => true);

    await cleanupSupersededAvatar({
      previousAvatarKey: "https://blob.vercel-storage.com/avatars/old.jpg",
      nextAvatarKey: "https://blob.vercel-storage.com/avatars/new.jpg",
      deleteObject,
    });
    await rollbackUploadedAvatar({
      uploadedAvatarKey: "https://blob.vercel-storage.com/avatars/new.jpg",
      persistedAvatarKey: null,
      deleteObject,
    });

    expect(deleteObject).toHaveBeenNthCalledWith(
      1,
      "https://blob.vercel-storage.com/avatars/old.jpg"
    );
    expect(deleteObject).toHaveBeenNthCalledWith(
      2,
      "https://blob.vercel-storage.com/avatars/new.jpg"
    );
  });
});
