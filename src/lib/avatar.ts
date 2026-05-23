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

export function isSupportedAvatarMimeType(
  value: string
): value is AvatarMimeType {
  return (AVATAR_ALLOWED_MIME_TYPES as readonly string[]).includes(value);
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

export function isAvatarStorageConfigured(
  env: NodeJS.ProcessEnv = process.env
) {
  return (
    typeof env.BLOB_READ_WRITE_TOKEN === "string" &&
    env.BLOB_READ_WRITE_TOKEN.trim().length > 0
  );
}
