import { del, put } from "@vercel/blob";
import { assertAvatarStorageObjectAllowed, avatarStorageMutationToken } from "@/lib/avatar";
import { logError } from "@/lib/errors";

type DeleteAvatarObject = (avatarUrl: string) => Promise<boolean>;

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
