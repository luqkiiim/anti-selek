export function buildShareAvatarUrl(avatarUrl: string | null | undefined) {
  if (!avatarUrl) {
    return null;
  }

  return `/api/share-avatar?source=${encodeURIComponent(avatarUrl)}`;
}

export function isAllowedShareAvatarSource(source: string) {
  try {
    const url = new URL(source);
    const isVercelBlobHost =
      url.hostname === "blob.vercel-storage.com" ||
      url.hostname.endsWith(".blob.vercel-storage.com");

    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      isVercelBlobHost &&
      url.pathname.startsWith("/avatars/")
    );
  } catch {
    return false;
  }
}
