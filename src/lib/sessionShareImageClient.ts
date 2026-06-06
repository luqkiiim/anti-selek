export interface ShareSessionStandingsImageOptions {
  code: string;
  fileName: string;
  shareTitle: string;
  fetchImpl?: typeof fetch;
}

export interface ShareSessionStandingsImageResult {
  method: "native-share" | "download";
}

function slugifyFileName(input: string) {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "session-standings";
}

function buildDownloadName(fileName: string) {
  return `${slugifyFileName(fileName)}.png`;
}

async function getShareImageErrorMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;

  return typeof body?.error === "string" && body.error.trim().length > 0
    ? body.error
    : "Could not generate standings image.";
}

export async function fetchSessionStandingsImageBlob({
  code,
  fetchImpl = fetch,
}: {
  code: string;
  fetchImpl?: typeof fetch;
}) {
  const response = await fetchImpl(
    `/api/sessions/${encodeURIComponent(code)}/share-image`,
    {
      cache: "no-store",
      credentials: "same-origin",
    }
  );

  if (!response.ok) {
    throw new Error(await getShareImageErrorMessage(response));
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/png")) {
    throw new Error("Could not generate standings image.");
  }

  return response.blob();
}

export function downloadSessionStandingsImageBlob(
  blob: Blob,
  fileName: string
) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = buildDownloadName(fileName);
  link.rel = "noopener";
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function shareSessionStandingsImageBlob({
  blob,
  fileName,
  shareTitle,
}: {
  blob: Blob;
  fileName: string;
  shareTitle: string;
}): Promise<ShareSessionStandingsImageResult> {
  const file = new File([blob], buildDownloadName(fileName), {
    type: "image/png",
  });
  const navigatorWithShare = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };

  if (
    typeof navigatorWithShare.share === "function" &&
    (!navigatorWithShare.canShare ||
      navigatorWithShare.canShare({ files: [file], title: shareTitle }))
  ) {
    try {
      await navigatorWithShare.share({
        files: [file],
        title: shareTitle,
      });
      return { method: "native-share" };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
    }
  }

  downloadSessionStandingsImageBlob(blob, fileName);
  return { method: "download" };
}

export async function shareSessionStandingsImage({
  code,
  fileName,
  shareTitle,
  fetchImpl,
}: ShareSessionStandingsImageOptions): Promise<ShareSessionStandingsImageResult> {
  const blob = await fetchSessionStandingsImageBlob({ code, fetchImpl });

  return shareSessionStandingsImageBlob({ blob, fileName, shareTitle });
}
