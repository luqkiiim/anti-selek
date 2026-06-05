const SHARE_AVATAR_PREPARE_TIMEOUT_MS = 5_000;
const SHARE_CARD_PLAYER_LIMIT = 11;

interface ShareAvatarPlayer {
  userId: string;
  user: {
    name?: string;
    avatarUrl?: string | null;
  };
}

interface PrepareShareAvatarOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface ShareAvatarDiagnostic {
  userId: string;
  name: string;
  rank: number;
  status: "prepared-photo" | "initials" | "failed-photo";
  dataUrlBytes?: number;
  dataUrlLength?: number;
  mimeType?: string;
}

export interface ShareAvatarPreparationWithDiagnostics {
  avatarUrlsByUserId: Map<string, string>;
  diagnostics: ShareAvatarDiagnostic[];
  displayedPlayerCount: number;
  uploadedPhotoCount: number;
  preparedPhotoCount: number;
  initialsOnlyCount: number;
  failedPhotoCount: number;
}

export class ShareAvatarPreparationError extends Error {
  diagnostics: ShareAvatarDiagnostic[];

  constructor(message: string, diagnostics: ShareAvatarDiagnostic[]) {
    super(message);
    this.name = "ShareAvatarPreparationError";
    this.diagnostics = diagnostics;
  }
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

    const blob = await response.blob();
    const dataUrl = await readBlobAsDataUrl(blob);

    return {
      dataUrl,
      byteSize: blob.size,
      dataUrlLength: dataUrl.length,
      mimeType: blob.type || "unknown",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function prepareShareAvatarDataUrlsWithDiagnostics(
  players: ShareAvatarPlayer[],
  {
    fetchImpl = fetch,
    timeoutMs = SHARE_AVATAR_PREPARE_TIMEOUT_MS,
  }: PrepareShareAvatarOptions = {}
) {
  const displayedPlayers = players.slice(0, SHARE_CARD_PLAYER_LIMIT);
  const avatarDataUrlBySource = new Map<
    string,
    Promise<{
      dataUrl: string;
      byteSize: number;
      dataUrlLength: number;
      mimeType: string;
    }>
  >();
  const avatarDataUrlByUserId = new Map<string, string>();
  const diagnostics = await Promise.all(
    displayedPlayers.map(async (player, index) => {
      const avatarUrl = player.user.avatarUrl;
      const diagnosticBase = {
        userId: player.userId,
        name: player.user.name ?? `Player ${index + 1}`,
        rank: index + 1,
      };

      if (!avatarUrl) {
        return {
          ...diagnosticBase,
          status: "initials" as const,
        };
      }

      try {
        let avatarDataUrl = avatarDataUrlBySource.get(avatarUrl);
        if (!avatarDataUrl) {
          avatarDataUrl = fetchShareAvatarDataUrl({
            avatarUrl,
            fetchImpl,
            timeoutMs,
          });
          avatarDataUrlBySource.set(avatarUrl, avatarDataUrl);
        }

        const preparedAvatar = await avatarDataUrl;
        avatarDataUrlByUserId.set(player.userId, preparedAvatar.dataUrl);

        return {
          ...diagnosticBase,
          status: "prepared-photo" as const,
          dataUrlBytes: preparedAvatar.byteSize,
          dataUrlLength: preparedAvatar.dataUrlLength,
          mimeType: preparedAvatar.mimeType,
        };
      } catch {
        return {
          ...diagnosticBase,
          status: "failed-photo" as const,
        };
      }
    })
  );

  const failedPhotoCount = diagnostics.filter(
    (diagnostic) => diagnostic.status === "failed-photo"
  ).length;

  if (failedPhotoCount > 0) {
    throw new ShareAvatarPreparationError(
      "Could not prepare profile pictures. Try again.",
      diagnostics
    );
  }

  return {
    avatarUrlsByUserId: avatarDataUrlByUserId,
    diagnostics,
    displayedPlayerCount: displayedPlayers.length,
    uploadedPhotoCount: diagnostics.filter(
      (diagnostic) => diagnostic.status !== "initials"
    ).length,
    preparedPhotoCount: diagnostics.filter(
      (diagnostic) => diagnostic.status === "prepared-photo"
    ).length,
    initialsOnlyCount: diagnostics.filter(
      (diagnostic) => diagnostic.status === "initials"
    ).length,
    failedPhotoCount,
  };
}

export async function prepareShareAvatarDataUrls(
  players: ShareAvatarPlayer[],
  options: PrepareShareAvatarOptions = {}
) {
  try {
    const result = await prepareShareAvatarDataUrlsWithDiagnostics(
      players,
      options
    );

    return result.avatarUrlsByUserId;
  } catch {
    throw new Error("Could not prepare profile pictures. Try again.");
  }
}

export function waitForShareCardRender() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}
