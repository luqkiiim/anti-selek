import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { logError } from "@/lib/errors";
import { resolveAvatarStorageConfig } from "@/lib/avatar";

type DeleteAvatarObject = (avatarKey: string) => Promise<boolean>;

let cachedAvatarS3Client: S3Client | null = null;
let cachedAvatarS3ClientKey: string | null = null;

function getAvatarClientCacheKey(config: {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
}) {
  return `${config.endpoint}|${config.region}|${config.bucket}|${config.accessKeyId}`;
}

export function getAvatarS3Client() {
  const config = resolveAvatarStorageConfig();
  if (!config) {
    throw new Error("Avatar storage is not configured");
  }

  const cacheKey = getAvatarClientCacheKey(config);
  if (cachedAvatarS3Client && cachedAvatarS3ClientKey === cacheKey) {
    return { client: cachedAvatarS3Client, config };
  }

  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  cachedAvatarS3Client = client;
  cachedAvatarS3ClientKey = cacheKey;
  return { client, config };
}

export async function uploadAvatarObject({
  avatarKey,
  body,
  contentType,
}: {
  avatarKey: string;
  body: Buffer;
  contentType: string;
}) {
  const { client, config } = getAvatarS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: avatarKey,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
}

export async function deleteAvatarObject(avatarKey: string) {
  const { client, config } = getAvatarS3Client();

  await client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: avatarKey,
    })
  );
}

export async function deleteAvatarObjectBestEffort(avatarKey: string) {
  if (!avatarKey) {
    return false;
  }

  try {
    await deleteAvatarObject(avatarKey);
    return true;
  } catch (error) {
    logError("Delete avatar object error", error);
    return false;
  }
}

export async function cleanupSupersededAvatar({
  previousAvatarKey,
  nextAvatarKey,
  deleteObject = deleteAvatarObjectBestEffort,
}: {
  previousAvatarKey: string | null | undefined;
  nextAvatarKey?: string | null;
  deleteObject?: DeleteAvatarObject;
}) {
  if (!previousAvatarKey || previousAvatarKey === nextAvatarKey) {
    return false;
  }

  return deleteObject(previousAvatarKey);
}

export async function rollbackUploadedAvatar({
  uploadedAvatarKey,
  persistedAvatarKey,
  deleteObject = deleteAvatarObjectBestEffort,
}: {
  uploadedAvatarKey: string | null | undefined;
  persistedAvatarKey?: string | null;
  deleteObject?: DeleteAvatarObject;
}) {
  if (!uploadedAvatarKey || uploadedAvatarKey === persistedAvatarKey) {
    return false;
  }

  return deleteObject(uploadedAvatarKey);
}
