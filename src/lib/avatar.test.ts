import { describe, expect, it, vi } from "vitest";
import {
  AVATAR_MAX_FILE_BYTES,
  AVATAR_MAX_SOURCE_FILE_BYTES,
  buildAvatarObjectKey,
  getAvatarFileSignatureValidationError,
  getAvatarSourceValidationError,
  getAvatarUploadValidationError,
  isAvatarStorageMutationAllowed,
  isAvatarStorageConfigured,
  PREVIEW_AVATAR_BLOB_ORIGIN,
  PREVIEW_AVATAR_BLOB_STORE_ID,
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

  it("validates avatar file signatures against the declared image type", () => {
    expect(
      getAvatarFileSignatureValidationError({
        mimeType: "image/png",
        bytes: new Uint8Array([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        ]),
      })
    ).toBeNull();

    expect(
      getAvatarFileSignatureValidationError({
        mimeType: "image/png",
        bytes: new Uint8Array([0x3c, 0x73, 0x76, 0x67]),
      })
    ).toBe(
      "The prepared avatar does not contain valid PNG image data. Try selecting the image again, or export it as JPG, PNG, or WebP."
    );
  });

  it("explains when avatar file contents do not match the declared type", () => {
    expect(
      getAvatarFileSignatureValidationError({
        mimeType: "image/png",
        bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xdb]),
      })
    ).toBe(
      "The prepared avatar is labeled as PNG, but the image data looks like JPG. Try selecting the image again, or export it as JPG, PNG, or WebP."
    );
  });

  it("explains when uploaded avatar content is empty", () => {
    expect(
      getAvatarFileSignatureValidationError({
        mimeType: "image/webp",
        bytes: new Uint8Array([]),
      })
    ).toBe("The uploaded avatar file is empty.");
  });

  it("requires a configured token and an allowed deployment environment", () => {
    expect(isAvatarStorageConfigured({} as NodeJS.ProcessEnv)).toBe(false);
    expect(
      isAvatarStorageConfigured({
        BLOB_READ_WRITE_TOKEN: "blob_rw_token",
      } as unknown as NodeJS.ProcessEnv)
    ).toBe(true);
    expect(
      isAvatarStorageConfigured({
        BLOB_READ_WRITE_TOKEN: "shared_blob_token",
        VERCEL_ENV: "preview",
      } as unknown as NodeJS.ProcessEnv)
    ).toBe(false);
  });

  it("enables only the pinned Preview store in a complete isolated deployment", () => {
    const env = { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: "preview.invalid", PREVIEW_BLOB_READ_WRITE_TOKEN: `vercel_blob_rw_${PREVIEW_AVATAR_BLOB_STORE_ID}_syntheticSecret` } as const;
    expect(PREVIEW_AVATAR_BLOB_ORIGIN).toBe("https://xpmu5ssj6d3fygai.public.blob.vercel-storage.com");
    expect(isAvatarStorageConfigured(env)).toBe(true);
    expect(isAvatarStorageMutationAllowed(env)).toBe(true);
    expect(isAvatarStorageConfigured({ ...env, BLOB_READ_WRITE_TOKEN: "shared-production-token" })).toBe(false);
    expect(isAvatarStorageConfigured({ ...env, VERCEL_URL: "" })).toBe(false);
    expect(isAvatarStorageConfigured({ ...env, PREVIEW_BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_wrongStore_syntheticSecret" })).toBe(false);
  });

  it.each([
    ["an explicit Preview deployment", { VERCEL_ENV: "preview" }],
    ["a Preview database URL hint", { PREVIEW_TURSO_DATABASE_URL: "preview-db" }],
    ["a Preview database token hint", { PREVIEW_TURSO_AUTH_TOKEN: "preview-db-token" }],
    [
      "an incomplete Vercel production marker set",
      { NODE_ENV: "production", VERCEL: "1", VERCEL_URL: "app-preview.invalid" },
    ],
    [
      "a production environment marker without the Vercel marker",
      { NODE_ENV: "production", VERCEL_ENV: "production", VERCEL_URL: "app.invalid" },
    ],
    [
      "a production environment missing its deployment URL",
      { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production" },
    ],
    [
      "an unrecognized Vercel deployment environment",
      { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "staging", VERCEL_URL: "app.invalid" },
    ],
    ["a nonblank invalid Vercel marker", { VERCEL: "0" }],
  ])("blocks avatar mutations for %s", (_label, env) => {
    expect(
      isAvatarStorageMutationAllowed({
        BLOB_READ_WRITE_TOKEN: "shared_blob_token",
        ...env,
      } as unknown as NodeJS.ProcessEnv)
    ).toBe(false);
  });

  it.each([
    ["ordinary local development", { NODE_ENV: "development" }],
    [
      "local Vercel development",
      { NODE_ENV: "development", VERCEL: "1", VERCEL_ENV: "development" },
    ],
    [
      "fully marked Vercel production",
      {
        NODE_ENV: "production",
        VERCEL: "1",
        VERCEL_ENV: "production",
        VERCEL_URL: "app.invalid",
      },
    ],
  ])("allows avatar mutations for %s", (_label, env) => {
    expect(
      isAvatarStorageMutationAllowed({
        BLOB_READ_WRITE_TOKEN: "blob_rw_token",
        ...env,
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
