import { del, put } from "@vercel/blob";
import { assertAvatarStorageObjectAllowed, avatarStorageMutationToken } from "@/lib/avatar";
import { logError } from "@/lib/errors";

type DeleteAvatarObject = (avatarUrl: string) => Promise<boolean>;

/** Includes disconnected, archived and retired rows: historical photos remain valid. */
export async function isAvatarReferenced(avatarKey: string) {
  const { prisma } = await import("./prisma");
  const counts = await Promise.all([
    prisma.user.count({ where: { avatarKey } }),
    prisma.player.count({ where: { avatarKey } }),
    prisma.club.count({ where: { avatarKey } }),
  ]);
  return counts.some(count => count > 0);
}

async function deleteUnreferencedAvatar(key: string, deleteObject: DeleteAvatarObject, isReferenced: (key: string) => Promise<boolean>) {
  try {
    if (await isReferenced(key)) return false;
    return await deleteObject(key);
  } catch (error) {
    logError("Check avatar references", error);
    return false;
  }
}

export async function uploadAvatarObject({
  avatarPathname,
  body,
  contentType,
}: {
  avatarPathname: string;
  body: Blob | Buffer | ArrayBuffer;
  contentType: string;
}) {
  const token = avatarStorageMutationToken();
  if (token && (!avatarPathname.startsWith("avatars/") || /[\\?#]/.test(avatarPathname) || avatarPathname.split("/").some((part) => !part || part === "." || part === ".."))) {
    throw new Error("Preview avatar pathname is outside the isolated avatar prefix");
  }

  const blob = await put(avatarPathname, body, {
    access: "public",
    addRandomSuffix: false,
    cacheControlMaxAge: 31_536_000,
    contentType,
    ...(token ? { token } : {}),
  });

  assertAvatarStorageObjectAllowed(blob.url);
  return blob.url;
}

export async function deleteAvatarObject(avatarUrl: string) {
  const token = avatarStorageMutationToken();
  assertAvatarStorageObjectAllowed(avatarUrl);
  if (token) await del(avatarUrl, { token });
  else await del(avatarUrl);
}

export async function deleteAvatarObjectBestEffort(avatarUrl: string) {
  if (!avatarUrl) {
    return false;
  }

  try {
    await deleteAvatarObject(avatarUrl);
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
  isReferenced = isAvatarReferenced,
}: {
  previousAvatarKey: string | null | undefined;
  nextAvatarKey?: string | null;
  deleteObject?: DeleteAvatarObject;
  isReferenced?: (key: string) => Promise<boolean>;
}) {
  if (!previousAvatarKey || previousAvatarKey === nextAvatarKey) {
    return false;
  }

  return deleteUnreferencedAvatar(previousAvatarKey, deleteObject, isReferenced);
}

export async function rollbackUploadedAvatar({
  uploadedAvatarKey,
  persistedAvatarKey,
  deleteObject = deleteAvatarObjectBestEffort,
  isReferenced = isAvatarReferenced,
}: {
  uploadedAvatarKey: string | null | undefined;
  persistedAvatarKey?: string | null;
  deleteObject?: DeleteAvatarObject;
  isReferenced?: (key: string) => Promise<boolean>;
}) {
  if (!uploadedAvatarKey || uploadedAvatarKey === persistedAvatarKey) {
    return false;
  }

  return deleteUnreferencedAvatar(uploadedAvatarKey, deleteObject, isReferenced);
}
