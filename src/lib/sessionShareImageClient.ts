export interface FetchSessionStandingsImageOptions {
  code: string;
  fetchImpl?: typeof fetch;
}

export interface ShareSessionStandingsImageResult {
  method: "native-share" | "download" | "save-panel";
}

function slugifyFileName(input: string) {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "tournament-standings";
}

export function getSessionRecapFileName(fileName: string, index: number, count: number) {
  return `${slugifyFileName(fileName)}${count > 1 ? `-${index + 1}-of-${count}` : ""}.png`;
}

async function getShareImageErrorMessage(response: Response) {
  const body = (await response.json().catch(() => null)) as {
    error?: unknown;
  } | null;

  return typeof body?.error === "string" && body.error.trim().length > 0
    ? body.error
    : "Could not generate standings image.";
}

async function fetchSessionStandingsImagePage({
  code,
  fetchImpl = fetch,
}: FetchSessionStandingsImageOptions, page = 1) {
  const url = `/api/sessions/${encodeURIComponent(code)}/share-image${page > 1 ? `?page=${page}` : ""}`;
  const options: RequestInit = { cache: "no-store", credentials: "same-origin" };
  let response = await fetchImpl(url, options);
  if (response.status === 429) {
    const retryAfter = response.headers.get("Retry-After");
    const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) : 60;
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
    response = await fetchImpl(url, options);
  }

  if (!response.ok) {
    throw new Error(await getShareImageErrorMessage(response));
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/png")) {
    throw new Error("Could not generate standings image.");
  }

  const pageCount = Number(response.headers.get("X-Recap-Page-Count") ?? "1");
  if (!Number.isSafeInteger(pageCount) || pageCount < page) {
    throw new Error("Could not prepare all recap images. Try again.");
  }
  return { blob: await response.blob(), pageCount };
}

export async function fetchSessionStandingsImageBlob(options: FetchSessionStandingsImageOptions) {
  return (await fetchSessionStandingsImagePage(options)).blob;
}

export async function fetchSessionStandingsImages(options: FetchSessionStandingsImageOptions): Promise<Blob[]> {
  const first = await fetchSessionStandingsImagePage(options);
  const images = [first.blob];
  // Two renders at a time avoid flooding the image endpoint on larger rosters.
  for (let page = 2; page <= first.pageCount; page += 2) {
    const pages = await Promise.all(
      [page, page + 1].filter(value => value <= first.pageCount)
        .map(value => fetchSessionStandingsImagePage(options, value)),
    );
    for (const result of pages) {
      if (result.pageCount !== first.pageCount) {
        throw new Error("Standings changed while preparing the recap. Try again.");
      }
      images.push(result.blob);
    }
  }
  return images;
}

export function downloadSessionStandingsImageBlob(
  blob: Blob,
  fileName: string,
  index = 0,
  count = 1,
) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = getSessionRecapFileName(fileName, index, count);
  link.rel = "noopener";
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function shareSessionStandingsImages({
  images,
  fileName,
  shareTitle,
}: {
  images: readonly Blob[];
  fileName: string;
  shareTitle: string;
}): Promise<ShareSessionStandingsImageResult> {
  if (images.length === 0) throw new Error("The recap is not ready to share yet.");
  const files = images.map((blob, index) => new File(
    [blob], getSessionRecapFileName(fileName, index, images.length), { type: "image/png" },
  ));
  const navigatorWithShare = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };

  if (
    typeof navigatorWithShare.share === "function" &&
    (typeof navigatorWithShare.canShare === "function"
      ? navigatorWithShare.canShare({ files })
      : files.length === 1)
  ) {
    try {
      // Invoke before any await so the browser still has the user's activation.
      await navigatorWithShare.share({ files, title: shareTitle });
      return { method: "native-share" };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      return { method: "save-panel" };
    }
  }

  if (images.length > 1) return { method: "save-panel" };
  downloadSessionStandingsImageBlob(images[0], fileName);
  return { method: "download" };
}
