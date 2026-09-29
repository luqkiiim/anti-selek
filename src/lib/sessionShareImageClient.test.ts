// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  downloadSessionStandingsImageBlob,
  fetchSessionStandingsImageBlob,
  shareSessionStandingsImageBlob,
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

    const resultPromise = shareSessionStandingsImageBlob({
      blob: new Blob(["png"], { type: "image/png" }),
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

    const result = await shareSessionStandingsImageBlob({
      blob: new Blob(["png"], { type: "image/png" }),
      fileName: "Weekend Cup",
      shareTitle: "Weekend Cup final standings",
    });

    expect(anchor.href).toBe("blob:standings");
    expect(anchor.download).toBe("weekend-cup.png");
    expect(click).toHaveBeenCalled();
    expect(result).toEqual({ method: "download" });
  });

  it("does not download when native file sharing rejects", async () => {
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

    await expect(shareSessionStandingsImageBlob({
      blob: new Blob(["png"], { type: "image/png" }),
      fileName: "Weekend Cup",
      shareTitle: "Weekend Cup final standings",
    })).rejects.toBe(shareError);

    expect(share).toHaveBeenCalledTimes(1);
    expect(click).not.toHaveBeenCalled();
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
