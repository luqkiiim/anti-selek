import { describe, expect, it, vi } from "vitest";
import {
  AVATAR_MAX_FILE_BYTES,
  buildAvatarObjectKey,
  getAvatarValidationError,
  resolveAvatarStorageConfig,
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

  it("resolves public avatar URLs without duplicated slashes", () => {
    expect(resolveAvatarUrl("/avatars/u1/photo.jpg", "https://cdn.test/")).toBe(
      "https://cdn.test/avatars/u1/photo.jpg"
    );
    expect(resolveAvatarUrl(null, "https://cdn.test")).toBeNull();
  });

  it("validates image type and max size", () => {
    expect(
      getAvatarValidationError({
        mimeType: "image/gif",
        size: 128,
      })
    ).toBe("Only JPG, PNG, and WebP images are supported.");

    expect(
      getAvatarValidationError({
        mimeType: "image/png",
        size: AVATAR_MAX_FILE_BYTES + 1,
      })
    ).toBe("Avatar images must be 5MB or smaller.");

    expect(
      getAvatarValidationError({
        mimeType: "image/png",
        size: 1024,
      })
    ).toBeNull();
  });

  it("parses avatar storage config only when every env var exists", () => {
    expect(resolveAvatarStorageConfig({} as NodeJS.ProcessEnv)).toBeNull();

    expect(
      resolveAvatarStorageConfig({
        AVATAR_S3_ENDPOINT: "https://s3.test",
        AVATAR_S3_REGION: "auto",
        AVATAR_S3_BUCKET: "avatars",
        AVATAR_S3_ACCESS_KEY_ID: "key",
        AVATAR_S3_SECRET_ACCESS_KEY: "secret",
        AVATAR_PUBLIC_BASE_URL: "https://cdn.test",
      } as unknown as NodeJS.ProcessEnv)
    ).toEqual({
      endpoint: "https://s3.test",
      region: "auto",
      bucket: "avatars",
      accessKeyId: "key",
      secretAccessKey: "secret",
      publicBaseUrl: "https://cdn.test",
    });
  });

  it("cleans up superseded keys and rolls back failed uploads", async () => {
    const deleteObject = vi.fn(async () => true);

    await cleanupSupersededAvatar({
      previousAvatarKey: "avatars/old.jpg",
      nextAvatarKey: "avatars/new.jpg",
      deleteObject,
    });
    await rollbackUploadedAvatar({
      uploadedAvatarKey: "avatars/new.jpg",
      persistedAvatarKey: null,
      deleteObject,
    });

    expect(deleteObject).toHaveBeenNthCalledWith(1, "avatars/old.jpg");
    expect(deleteObject).toHaveBeenNthCalledWith(2, "avatars/new.jpg");
  });
});
