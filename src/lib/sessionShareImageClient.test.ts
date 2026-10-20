// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadSessionStandingsImageBlob,
  fetchSessionStandingsImageBlob,
  fetchSessionStandingsImages,
  shareSessionStandingsImages,
} from "./sessionShareImageClient";

describe("session share image client helpers", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:standings"),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fetches a generated PNG from the server share-image endpoint", async () => {
    const blob = new Blob(["png"], { type: "image/png" });
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(blob, {
        headers: { "content-type": "image/png" },
      })
    );

    const result = await fetchSessionStandingsImageBlob({
      code: "ABC 123",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/sessions/ABC%20123/share-image",
      {
        cache: "no-store",
        credentials: "same-origin",
      }
    );
    expect(result.type).toBe("image/png");
  });

  it("surfaces server error copy from JSON responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      Response.json(
        { error: "Final standings are available after the tournament ends." },
        { status: 400 }
      )
    );

    await expect(
      fetchSessionStandingsImageBlob({
        code: "ABC123",
        fetchImpl,
      })
    ).rejects.toThrow(
      "Final standings are available after the tournament ends."
    );
  });

  it("invokes native file share synchronously when supported", async () => {
    let finishShare!: () => void;
    const share = vi.fn(() => new Promise<void>((resolve) => {
      finishShare = resolve;
    }));
    const canShare = vi.fn().mockReturnValue(true);
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { share, canShare },
    });

    const resultPromise = shareSessionStandingsImages({
      images: [new Blob(["png"], { type: "image/png" })],
      fileName: "Weekend Cup",
      shareTitle: "Weekend Cup final standings",
    });

    expect(canShare).toHaveBeenCalledWith({
      files: [expect.any(File)],
    });
    expect(share).toHaveBeenCalledWith({
      files: [expect.any(File)],
      title: "Weekend Cup final standings",
    });
    finishShare();
    await expect(resultPromise).resolves.toEqual({ method: "native-share" });
  });

  it("falls back to download when native file sharing is unavailable", async () => {
    const anchor = document.createElement("a");
    const click = vi.spyOn(anchor, "click").mockImplementation(() => undefined);
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) =>
      tagName.toLowerCase() === "a" ? anchor : originalCreateElement(tagName)
    );
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });

    const result = await shareSessionStandingsImages({
      images: [new Blob(["png"], { type: "image/png" })],
      fileName: "Weekend Cup",
      shareTitle: "Weekend Cup final standings",
    });

    expect(anchor.href).toBe("blob:standings");
    expect(anchor.download).toBe("weekend-cup.png");
    expect(click).toHaveBeenCalled();
    expect(result).toEqual({ method: "download" });
  });

  it("offers the save panel when native file sharing rejects without downloading", async () => {
    const shareError = new DOMException("Sharing is not allowed", "NotAllowedError");
    const share = vi.fn().mockRejectedValue(shareError);
    const anchor = document.createElement("a");
    const click = vi.spyOn(anchor, "click").mockImplementation(() => undefined);
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) =>
      tagName.toLowerCase() === "a" ? anchor : originalCreateElement(tagName)
    );
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { share },
    });

    await expect(shareSessionStandingsImages({
      images: [new Blob(["png"], { type: "image/png" })],
      fileName: "Weekend Cup",
      shareTitle: "Weekend Cup final standings",
    })).resolves.toEqual({ method: "save-panel" });

    expect(share).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();
  });

  it("prepares every page in order, waiting for the complete collection", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      const page = new URLSearchParams(url.split("?")[1]).get("page") ?? "1";
      return new Response(page, { headers: { "content-type": "image/png", "X-Recap-Page-Count": "3" } });
    });
    const images = await fetchSessionStandingsImages({ code: "ABC123", fetchImpl: fetchImpl as typeof fetch });
    expect(await Promise.all(images.map(blob => blob.text()))).toEqual(["1", "2", "3"]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("fails the complete export if a continuation image cannot be generated", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(new Response("png", {
      headers: { "content-type": "image/png", "X-Recap-Page-Count": "2" },
    })).mockResolvedValueOnce(Response.json({ error: "Render failed" }, { status: 500 }));
    await expect(fetchSessionStandingsImages({ code: "ABC123", fetchImpl })).rejects.toThrow("Render failed");
  });

  it("shares every prepared file together with numbered filenames", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { share, canShare });
    const result = shareSessionStandingsImages({
      images: [new Blob(["first"]), new Blob(["second"])], fileName: "Weekend Cup", shareTitle: "Cup",
    });
    expect(share).toHaveBeenCalledTimes(1);
    const files = share.mock.calls[0][0].files as File[];
    expect(files.map(file => file.name)).toEqual(["weekend-cup-1-of-2.png", "weekend-cup-2-of-2.png"]);
    expect(canShare).toHaveBeenCalledWith({ files });
    await expect(result).resolves.toEqual({ method: "native-share" });
  });

  it("uses the save panel when multi-file sharing is unsupported and keeps cancellation quiet", async () => {
    const share = vi.fn();
    const images = [new Blob(["first"]), new Blob(["second"])];
    vi.stubGlobal("navigator", { share, canShare: () => false });
    await expect(shareSessionStandingsImages({ images, fileName: "Cup", shareTitle: "Cup" })).resolves.toEqual({ method: "save-panel" });
    expect(share).not.toHaveBeenCalled();
    const cancelled = new DOMException("Cancelled", "AbortError");
    vi.stubGlobal("navigator", { share: vi.fn().mockRejectedValue(cancelled), canShare: () => true });
    await expect(shareSessionStandingsImages({ images, fileName: "Cup", shareTitle: "Cup" })).rejects.toBe(cancelled);
  });

  it("honors rate-limit retry delays before fetching the image again", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn().mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "2" } }))
        .mockResolvedValueOnce(new Response("png", { headers: { "content-type": "image/png" } }));
      const images = fetchSessionStandingsImages({ code: "ABC123", fetchImpl });
      await vi.advanceTimersByTimeAsync(1999);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await images).toHaveLength(1);
    } finally { vi.useRealTimers(); }
  });

  it("downloads a PNG blob with a stable slugged name", () => {
    const anchor = document.createElement("a");
    const click = vi.spyOn(anchor, "click").mockImplementation(() => undefined);
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) =>
      tagName.toLowerCase() === "a" ? anchor : originalCreateElement(tagName)
    );

    downloadSessionStandingsImageBlob(
      new Blob(["png"], { type: "image/png" }),
      "Badminton 29/5/26"
    );

    expect(anchor.download).toBe("badminton-29-5-26.png");
    expect(click).toHaveBeenCalled();
  });
});
