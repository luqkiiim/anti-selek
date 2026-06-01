import { toBlob } from "html-to-image";

export interface SessionShareOptions {
  node: HTMLElement;
  fileName: string;
  shareTitle: string;
}

export interface SessionShareResult {
  method: "native-share" | "download";
}

const IMAGE_READY_TIMEOUT_MS = 5_000;

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

function downloadBlob(blob: Blob, fileName: string) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = buildDownloadName(fileName);
  link.rel = "noopener";
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function waitForImageReady(image: HTMLImageElement) {
  if (image.complete) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timeoutId);
      image.removeEventListener("load", finish);
      image.removeEventListener("error", finish);
      resolve();
    };
    const timeoutId = setTimeout(finish, IMAGE_READY_TIMEOUT_MS);

    image.addEventListener("load", finish, { once: true });
    image.addEventListener("error", finish, { once: true });
  });
}

function readBlobAsDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error);
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to read share image"));
      }
    };
    reader.readAsDataURL(blob);
  });
}

async function inlineExportImage(image: HTMLImageElement) {
  const source = image.currentSrc || image.src;

  if (!source || source.startsWith("data:")) {
    return () => undefined;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), IMAGE_READY_TIMEOUT_MS);
    const response = await fetch(source, {
      cache: "force-cache",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId));
    if (!response.ok) {
      return () => undefined;
    }

    const previousSrc = image.src;
    const previousSrcset = image.srcset;
    image.srcset = "";
    image.src = await readBlobAsDataUrl(await response.blob());
    await waitForImageReady(image);

    return () => {
      image.src = previousSrc;
      image.srcset = previousSrcset;
    };
  } catch {
    // html-to-image still gets its normal fetch attempt if pre-inlining fails.
    return () => undefined;
  }
}

async function prepareExportImages(node: HTMLElement) {
  const images = Array.from(node.querySelectorAll("img"));
  await Promise.all(images.map((image) => waitForImageReady(image)));

  const restoreImages = await Promise.all(images.map(inlineExportImage));
  return () => restoreImages.reverse().forEach((restoreImage) => restoreImage());
}

async function exportShareBlob(node: HTMLElement) {
  if (typeof document !== "undefined" && "fonts" in document) {
    await document.fonts.ready;
  }

  const restoreImages = await prepareExportImages(node);
  let blob: Blob | null = null;

  try {
    blob = await toBlob(node, {
      backgroundColor: "#f4f7fb",
      cacheBust: true,
      pixelRatio: 2,
    });
  } finally {
    restoreImages();
  }

  if (!blob) {
    throw new Error("Failed to generate share image");
  }

  return blob;
}

export async function shareSessionStandingsCard({
  node,
  fileName,
  shareTitle,
}: SessionShareOptions): Promise<SessionShareResult> {
  const blob = await exportShareBlob(node);
  const exportName = buildDownloadName(fileName);
  const file = new File([blob], exportName, { type: "image/png" });
  const navigatorWithShare = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };

  if (
    typeof navigatorWithShare.share === "function" &&
    (!navigatorWithShare.canShare ||
      navigatorWithShare.canShare({
        files: [file],
        title: shareTitle,
      }))
  ) {
    try {
      await navigatorWithShare.share({
        files: [file],
        title: shareTitle,
      });
      return { method: "native-share" };
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        throw error;
      }
    }
  }

  downloadBlob(blob, fileName);
  return { method: "download" };
}
