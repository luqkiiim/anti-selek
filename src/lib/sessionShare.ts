import { toBlob } from "html-to-image";

export interface SessionShareOptions {
  node: HTMLElement;
  fileName: string;
  shareTitle: string;
}

export interface SessionShareResult {
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

function downloadBlob(blob: Blob, fileName: string) {
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = buildDownloadName(fileName);
  link.rel = "noopener";
  link.click();

  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportShareBlob(node: HTMLElement) {
  if (typeof document !== "undefined" && "fonts" in document) {
    await document.fonts.ready;
  }

  const blob = await toBlob(node, {
    backgroundColor: "#f4f7fb",
    cacheBust: true,
    pixelRatio: 2,
  });

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
