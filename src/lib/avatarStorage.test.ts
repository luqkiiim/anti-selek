import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const blobMocks = vi.hoisted(() => ({
  del: vi.fn(),
  put: vi.fn(),
}));

vi.mock("@vercel/blob", () => blobMocks);

import {
  cleanupSupersededAvatar,
  deleteAvatarObject,
  uploadAvatarObject,
} from "@/lib/avatarStorage";
import { PREVIEW_AVATAR_BLOB_ORIGIN, PREVIEW_AVATAR_BLOB_STORE_ID } from "@/lib/avatar";

const environmentKeys = [
  "BLOB_READ_WRITE_TOKEN",
  "NODE_ENV",
  "PREVIEW_TURSO_AUTH_TOKEN",
  "PREVIEW_BLOB_READ_WRITE_TOKEN",
  "PREVIEW_TURSO_DATABASE_URL",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
] as const;

function setEnvironment(values: Partial<Record<(typeof environmentKeys)[number], string>>) {
  for (const key of environmentKeys) {
    vi.stubEnv(key, values[key] ?? "");
  }
}

const avatarUrl = "https://blob.vercel-storage.com/avatars/account/photo.png";
const previewToken = `vercel_blob_rw_${PREVIEW_AVATAR_BLOB_STORE_ID}_syntheticSecret`;
const previewUrl = `${PREVIEW_AVATAR_BLOB_ORIGIN}/avatars/account/photo.png`;
const previewEnvironment = { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: "preview.invalid", PREVIEW_BLOB_READ_WRITE_TOKEN: previewToken };

describe("avatar storage mutation boundary", () => {
  beforeEach(() => {
    blobMocks.del.mockResolvedValue(undefined);
    blobMocks.put.mockResolvedValue({ url: avatarUrl });
    setEnvironment({ BLOB_READ_WRITE_TOKEN: "shared_blob_token" });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it.each([
    ["a fully marked Preview deployment", { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "preview", VERCEL_URL: "preview.invalid" }],
    ["a Preview marker with no other Vercel metadata", { VERCEL_ENV: "preview" }],
    ["an incomplete Vercel deployment with a Preview database hint", { NODE_ENV: "production", VERCEL: "1", PREVIEW_TURSO_DATABASE_URL: "preview-db" }],
    ["a local process carrying only a Preview token hint", { PREVIEW_TURSO_AUTH_TOKEN: "preview-db-token" }],
    ["a nonblank invalid Vercel marker", { VERCEL: "0" }],
    ["a Vercel production process missing VERCEL_ENV", { NODE_ENV: "production", VERCEL: "1", VERCEL_URL: "app.invalid" }],
    ["a Vercel production process missing VERCEL_URL", { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production" }],
  ])("does not call Blob APIs for %s", async (_label, env) => {
    setEnvironment({ BLOB_READ_WRITE_TOKEN: "shared_blob_token", ...env });

    await expect(
      uploadAvatarObject({
        avatarPathname: "avatars/account/new.png",
        body: new ArrayBuffer(3),
        contentType: "image/png",
      })
    ).rejects.toThrow("Avatar storage mutations are disabled");
    await expect(deleteAvatarObject(avatarUrl)).rejects.toThrow(
      "Avatar storage mutations are disabled"
    );
    await expect(
      cleanupSupersededAvatar({ previousAvatarKey: avatarUrl, nextAvatarKey: null })
    ).resolves.toBe(false);

    expect(blobMocks.put).not.toHaveBeenCalled();
    expect(blobMocks.del).not.toHaveBeenCalled();
  });

  it.each([
    ["ordinary local development", { NODE_ENV: "development" }],
    ["local Vercel development", { NODE_ENV: "development", VERCEL: "1", VERCEL_ENV: "development" }],
    [
      "fully marked Vercel production",
      { NODE_ENV: "production", VERCEL: "1", VERCEL_ENV: "production", VERCEL_URL: "app.invalid" },
    ],
  ])("preserves Blob API use for %s", async (_label, env) => {
    setEnvironment({ BLOB_READ_WRITE_TOKEN: "blob_rw_token", ...env });

    await expect(
      uploadAvatarObject({
        avatarPathname: "avatars/account/new.png",
        body: new ArrayBuffer(3),
        contentType: "image/png",
      })
    ).resolves.toBe(avatarUrl);
    await expect(deleteAvatarObject(avatarUrl)).resolves.toBeUndefined();

    expect(blobMocks.put).toHaveBeenCalledWith(
      "avatars/account/new.png",
      expect.any(ArrayBuffer),
      expect.objectContaining({ access: "public", contentType: "image/png" })
    );
    expect(blobMocks.del).toHaveBeenCalledWith(avatarUrl);
  });

  it("uses only the dedicated Preview token for upload and deletion", async () => {
    setEnvironment(previewEnvironment);
    blobMocks.put.mockResolvedValue({ url: previewUrl });
    await expect(uploadAvatarObject({ avatarPathname: "avatars/account/photo.png", body: new ArrayBuffer(3), contentType: "image/png" })).resolves.toBe(previewUrl);
    await expect(deleteAvatarObject(previewUrl)).resolves.toBeUndefined();
    expect(blobMocks.put).toHaveBeenCalledWith("avatars/account/photo.png", expect.any(ArrayBuffer), expect.objectContaining({ token: previewToken }));
    expect(blobMocks.del).toHaveBeenCalledWith(previewUrl, { token: previewToken });
  });

  it.each([
    ["shared standard token", { BLOB_READ_WRITE_TOKEN: "shared-production-token" }],
    ["wrong store", { PREVIEW_BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_anotherStore_syntheticSecret" }],
    ["malformed token", { PREVIEW_BLOB_READ_WRITE_TOKEN: "invalid" }],
    ["missing token", { PREVIEW_BLOB_READ_WRITE_TOKEN: "" }],
    ["missing deployment URL", { VERCEL_URL: "" }],
    ["local context", { NODE_ENV: "development", VERCEL: "", VERCEL_ENV: "" }],
  ])("rejects Preview authority with %s before Blob calls", async (_label, override) => {
    setEnvironment({ ...previewEnvironment, ...override });
    await expect(uploadAvatarObject({ avatarPathname: "avatars/account/photo.png", body: new ArrayBuffer(3), contentType: "image/png" })).rejects.toThrow("Avatar storage mutations are disabled");
    await expect(deleteAvatarObject(previewUrl)).rejects.toThrow("Avatar storage mutations are disabled");
    expect(blobMocks.put).not.toHaveBeenCalled();
    expect(blobMocks.del).not.toHaveBeenCalled();
  });

  it.each([
    avatarUrl,
    "https://production.public.blob.vercel-storage.com/avatars/account/photo.png",
    `${PREVIEW_AVATAR_BLOB_ORIGIN}.evil.invalid/avatars/account/photo.png`,
    `${PREVIEW_AVATAR_BLOB_ORIGIN}/another-prefix/photo.png`,
    `${PREVIEW_AVATAR_BLOB_ORIGIN}/avatars/photo.png?query=1`,
  ])("rejects out-of-store deletion and cleanup before Blob calls", async (url) => {
    setEnvironment(previewEnvironment);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(deleteAvatarObject(url)).rejects.toThrow("outside the isolated store");
      await expect(cleanupSupersededAvatar({ previousAvatarKey: url, nextAvatarKey: previewUrl })).resolves.toBe(false);
      expect(blobMocks.del).not.toHaveBeenCalled();
    } finally { errorLog.mockRestore(); }
  });

  it("rejects an upload result outside the dedicated origin", async () => {
    setEnvironment(previewEnvironment);
    await expect(uploadAvatarObject({ avatarPathname: "avatars/account/photo.png", body: new ArrayBuffer(3), contentType: "image/png" })).rejects.toThrow("outside the isolated store");
    expect(blobMocks.put).toHaveBeenCalledTimes(1);
    expect(blobMocks.del).not.toHaveBeenCalled();
  });

  it("rejects a Preview upload pathname outside the avatar prefix before Blob calls", async () => {
    setEnvironment(previewEnvironment);
    await expect(uploadAvatarObject({ avatarPathname: "avatars/../escape.png", body: new ArrayBuffer(3), contentType: "image/png" })).rejects.toThrow("outside the isolated avatar prefix");
    expect(blobMocks.put).not.toHaveBeenCalled();
  });
});
