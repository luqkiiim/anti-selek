const SHARE_AVATAR_PREPARE_TIMEOUT_MS = 5_000;
const SHARE_CARD_PLAYER_LIMIT = 11;

interface ShareAvatarPlayer {
  userId: string;
  user: {
    avatarUrl?: string | null;
  };
}

interface PrepareShareAvatarOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

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

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error);
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read profile picture"));
      }
    };
    reader.readAsDataURL(blob);
  });
}

async function fetchShareAvatarDataUrl({
  avatarUrl,
  fetchImpl,
  timeoutMs,
}: {
  avatarUrl: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(buildShareAvatarUrl(avatarUrl) as string, {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error("Failed to load profile picture");
    }

    return await readBlobAsDataUrl(await response.blob());
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function prepareShareAvatarDataUrls(
  players: ShareAvatarPlayer[],
  {
    fetchImpl = fetch,
    timeoutMs = SHARE_AVATAR_PREPARE_TIMEOUT_MS,
  }: PrepareShareAvatarOptions = {}
) {
  const avatarDataUrlBySource = new Map<string, Promise<string>>();
  const avatarDataUrlByUserId = new Map<string, string>();

  try {
    await Promise.all(
      players.slice(0, SHARE_CARD_PLAYER_LIMIT).map(async (player) => {
        const avatarUrl = player.user.avatarUrl;
        if (!avatarUrl) {
          return;
        }

        let avatarDataUrl = avatarDataUrlBySource.get(avatarUrl);
        if (!avatarDataUrl) {
          avatarDataUrl = fetchShareAvatarDataUrl({
            avatarUrl,
            fetchImpl,
            timeoutMs,
          });
          avatarDataUrlBySource.set(avatarUrl, avatarDataUrl);
        }

        avatarDataUrlByUserId.set(player.userId, await avatarDataUrl);
      })
    );
  } catch {
    throw new Error("Could not prepare profile pictures. Try again.");
  }

  return avatarDataUrlByUserId;
}

export function waitForShareCardRender() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
