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

export function isAvatarStorageConfigured(
  env: NodeJS.ProcessEnv = process.env
) {
  return (
    typeof env.BLOB_READ_WRITE_TOKEN === "string" &&
    env.BLOB_READ_WRITE_TOKEN.trim().length > 0
  );
}
