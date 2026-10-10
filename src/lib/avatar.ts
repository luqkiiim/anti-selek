import { randomBytes } from "node:crypto";

export const AVATAR_MAX_SOURCE_FILE_BYTES = 20 * 1024 * 1024;
export const AVATAR_MAX_FILE_BYTES = 4 * 1024 * 1024;
export const AVATAR_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

type AvatarMimeType = (typeof AVATAR_ALLOWED_MIME_TYPES)[number];

const MIME_TYPE_TO_EXTENSION: Record<AvatarMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const MIME_TYPE_TO_LABEL: Record<AvatarMimeType, string> = {
  "image/jpeg": "JPG",
  "image/png": "PNG",
  "image/webp": "WebP",
};

function hasPngSignature(bytes: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return signature.every((value, index) => bytes[index] === value);
}

function hasJpegSignature(bytes: Uint8Array) {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function hasWebpSignature(bytes: Uint8Array) {
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

export function isSupportedAvatarMimeType(
  value: string
): value is AvatarMimeType {
  return (AVATAR_ALLOWED_MIME_TYPES as readonly string[]).includes(value);
}

function detectAvatarMimeType(bytes: Uint8Array): AvatarMimeType | null {
  if (hasJpegSignature(bytes)) {
    return "image/jpeg";
  }

  if (hasPngSignature(bytes)) {
    return "image/png";
  }

  if (hasWebpSignature(bytes)) {
    return "image/webp";
  }

  return null;
}

function getAvatarBaseValidationError({
  mimeType,
  size,
}: {
  mimeType: string;
  size: number;
}) {
  if (!isSupportedAvatarMimeType(mimeType)) {
    return "Only JPG, PNG, and WebP images are supported.";
  }

  if (!Number.isFinite(size) || size <= 0) {
    return "Choose an image file to upload.";
  }

  return null;
}

export function getAvatarSourceValidationError({
  mimeType,
  size,
}: {
  mimeType: string;
  size: number;
}) {
  const validationError = getAvatarBaseValidationError({ mimeType, size });
  if (validationError) {
    return validationError;
  }

  if (size > AVATAR_MAX_SOURCE_FILE_BYTES) {
    return "Choose an image smaller than 20MB before cropping.";
  }

  return null;
}

export function getAvatarUploadValidationError({
  mimeType,
  size,
}: {
  mimeType: string;
  size: number;
}) {
  const validationError = getAvatarBaseValidationError({ mimeType, size });
  if (validationError) {
    return validationError;
  }

  if (size > AVATAR_MAX_FILE_BYTES) {
    return "Avatar images must be 4MB or smaller after cropping.";
  }

  return null;
}

export function getAvatarFileSignatureValidationError({
  bytes,
  mimeType,
}: {
  bytes: Uint8Array;
  mimeType: string;
}) {
  if (!isSupportedAvatarMimeType(mimeType)) {
    return "Only JPG, PNG, and WebP images are supported.";
  }

  if (bytes.length === 0) {
    return "The uploaded avatar file is empty.";
  }

  const detectedMimeType = detectAvatarMimeType(bytes);

  if (detectedMimeType === mimeType) {
    return null;
  }

  const expectedLabel = MIME_TYPE_TO_LABEL[mimeType];

  if (detectedMimeType) {
    return `The prepared avatar is labeled as ${expectedLabel}, but the image data looks like ${MIME_TYPE_TO_LABEL[detectedMimeType]}. Try selecting the image again, or export it as JPG, PNG, or WebP.`;
  }

  return `The prepared avatar does not contain valid ${expectedLabel} image data. Try selecting the image again, or export it as JPG, PNG, or WebP.`;
}

export function buildAvatarObjectKey({
  userId,
  mimeType,
  now = Date.now(),
  randomSuffix = randomBytes(6).toString("hex"),
}: {
  userId: string;
  mimeType: AvatarMimeType;
  now?: number;
  randomSuffix?: string;
}) {
  const extension = MIME_TYPE_TO_EXTENSION[mimeType];
  return `avatars/${userId}/${now}-${randomSuffix}.${extension}`;
}

export function buildClubAvatarObjectKey({
  clubId,
  mimeType,
  now = Date.now(),
  randomSuffix = randomBytes(6).toString("hex"),
}: {
  clubId: string;
  mimeType: AvatarMimeType;
  now?: number;
  randomSuffix?: string;
}) {
  const extension = MIME_TYPE_TO_EXTENSION[mimeType];
  return `avatars/clubs/${clubId}/${now}-${randomSuffix}.${extension}`;
}

export function resolveAvatarUrl(
  avatarKey: string | null | undefined
) {
  if (typeof avatarKey !== "string" || avatarKey.trim().length === 0) {
    return null;
  }

  return avatarKey.trim();
}

export function serializeAvatarEntity<T extends { avatarKey: string | null }>(
  value: T
): Omit<T, "avatarKey"> & { avatarUrl: string | null } {
  const { avatarKey, ...rest } = value;
  return {
    ...rest,
    avatarUrl: resolveAvatarUrl(avatarKey),
  };
}

function hasEnvironmentValue(value?: string | null) {
  return typeof value === "string" && value.trim().length > 0;
}

export const PREVIEW_AVATAR_BLOB_STORE_ID = "xpmU5Ssj6d3fygai";
export const PREVIEW_AVATAR_BLOB_ORIGIN = new URL(
  `https://${PREVIEW_AVATAR_BLOB_STORE_ID}.public.blob.vercel-storage.com`
).origin;

function hasIsolatedPreviewAvatarStorage(env: NodeJS.ProcessEnv) {
  const token = env.PREVIEW_BLOB_READ_WRITE_TOKEN;
  const storeId = typeof token === "string"
    ? /^vercel_blob_rw_([A-Za-z0-9]+)_[A-Za-z0-9_-]+$/.exec(token)?.[1]
    : undefined;
  return env.NODE_ENV === "production" && env.VERCEL === "1" &&
    env.VERCEL_ENV === "preview" && hasEnvironmentValue(env.VERCEL_URL) &&
    !hasEnvironmentValue(env.BLOB_READ_WRITE_TOKEN) && storeId === PREVIEW_AVATAR_BLOB_STORE_ID;
}

export function isAvatarStorageMutationAllowed(
  env: NodeJS.ProcessEnv = process.env
) {
  const vercelEnv = env.VERCEL_ENV?.trim().toLowerCase();
  const hasPreviewDatabaseHint =
    hasEnvironmentValue(env.PREVIEW_TURSO_DATABASE_URL) ||
    hasEnvironmentValue(env.PREVIEW_TURSO_AUTH_TOKEN);

  if (vercelEnv === "preview" || hasPreviewDatabaseHint || hasEnvironmentValue(env.PREVIEW_BLOB_READ_WRITE_TOKEN)) {
    return hasIsolatedPreviewAvatarStorage(env);
  }

  const hasVercelMarker =
    hasEnvironmentValue(env.VERCEL) ||
    hasEnvironmentValue(env.VERCEL_ENV) ||
    hasEnvironmentValue(env.VERCEL_URL);

  if (!hasVercelMarker) {
    return true;
  }

  if (vercelEnv === "development" && env.NODE_ENV !== "production") {
    return true;
  }

  return (
    env.NODE_ENV === "production" &&
    env.VERCEL === "1" &&
    vercelEnv === "production" &&
    hasEnvironmentValue(env.VERCEL_URL)
  );
}

export function assertAvatarStorageMutationAllowed(
  env: NodeJS.ProcessEnv = process.env
) {
  if (!isAvatarStorageMutationAllowed(env)) {
    throw new Error("Avatar storage mutations are disabled in this deployment environment");
  }
}

export function isAvatarStorageConfigured(
  env: NodeJS.ProcessEnv = process.env
) {
  return (
    isAvatarStorageMutationAllowed(env) &&
    (hasIsolatedPreviewAvatarStorage(env) || hasEnvironmentValue(env.BLOB_READ_WRITE_TOKEN))
  );
}

export function avatarStorageMutationToken(env: NodeJS.ProcessEnv = process.env) {
  assertAvatarStorageMutationAllowed(env);
  return hasIsolatedPreviewAvatarStorage(env) ? env.PREVIEW_BLOB_READ_WRITE_TOKEN : undefined;
}

export function assertAvatarStorageObjectAllowed(avatarUrl: string, env: NodeJS.ProcessEnv = process.env) {
  assertAvatarStorageMutationAllowed(env);
  if (!hasIsolatedPreviewAvatarStorage(env)) return;
  let url: URL;
  try { url = new URL(avatarUrl); } catch { throw new Error("Preview avatar object is outside the isolated store"); }
  if (url.origin !== PREVIEW_AVATAR_BLOB_ORIGIN || url.username || url.password || url.search || url.hash || !url.pathname.startsWith("/avatars/")) {
    throw new Error("Preview avatar object is outside the isolated store");
  }
}
