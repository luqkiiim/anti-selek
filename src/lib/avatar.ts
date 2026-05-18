import { randomBytes } from "node:crypto";

export const AVATAR_MAX_FILE_BYTES = 5 * 1024 * 1024;
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

export function getAvatarValidationError({
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

  if (size > AVATAR_MAX_FILE_BYTES) {
    return "Avatar images must be 5MB or smaller.";
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
  avatarKey: string | null | undefined,
  publicBaseUrl = process.env.AVATAR_PUBLIC_BASE_URL
) {
  if (
    typeof avatarKey !== "string" ||
    avatarKey.trim().length === 0 ||
    typeof publicBaseUrl !== "string" ||
    publicBaseUrl.trim().length === 0
  ) {
    return null;
  }

  const normalizedBaseUrl = publicBaseUrl.trim().replace(/\/+$/, "");
  const normalizedKey = avatarKey.trim().replace(/^\/+/, "");
  return `${normalizedBaseUrl}/${normalizedKey}`;
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

export interface AvatarStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
}

export function resolveAvatarStorageConfig(
  env: NodeJS.ProcessEnv = process.env
): AvatarStorageConfig | null {
  const endpoint = env.AVATAR_S3_ENDPOINT?.trim();
  const region = env.AVATAR_S3_REGION?.trim();
  const bucket = env.AVATAR_S3_BUCKET?.trim();
  const accessKeyId = env.AVATAR_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.AVATAR_S3_SECRET_ACCESS_KEY?.trim();
  const publicBaseUrl = env.AVATAR_PUBLIC_BASE_URL?.trim();

  if (
    !endpoint ||
    !region ||
    !bucket ||
    !accessKeyId ||
    !secretAccessKey ||
    !publicBaseUrl
  ) {
    return null;
  }

  return {
    endpoint,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl,
  };
}
