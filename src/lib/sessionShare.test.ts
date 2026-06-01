// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { shareSessionStandingsCard } from "./sessionShare";

const toBlobMock = vi.fn();

vi.mock("html-to-image", () => ({
  toBlob: (...args: unknown[]) => toBlobMock(...args),
}));

describe("shareSessionStandingsCard", () => {
  beforeEach(() => {
    toBlobMock.mockReset();
    toBlobMock.mockResolvedValue(new Blob(["image"], { type: "image/png" }));
    document.body.innerHTML = "";

    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
  });

  it("prefers native share when file sharing is supported", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { share, canShare },
    });

    const result = await shareSessionStandingsCard({
      node: document.body,
      fileName: "Weekend Cup",
      shareTitle: "Weekend Cup final standings",
    });

    expect(canShare).toHaveBeenCalled();
    expect(share).toHaveBeenCalled();
    expect(result).toEqual({ method: "native-share" });
  });

  it("waits for avatar images and inlines them before exporting", async () => {
    const image = document.createElement("img");
    Object.defineProperty(image, "complete", {
      configurable: true,
      value: false,
    });
    image.src = "https://cdn.test/avatar.jpg";
    document.body.append(image);

    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob(["avatar"], { type: "image/jpeg" })),
    });
    vi.stubGlobal("fetch", fetch);
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { share: vi.fn().mockResolvedValue(undefined) },
    });

    const sharePromise = shareSessionStandingsCard({
      node: document.body,
      fileName: "Weekend Cup",
      shareTitle: "Weekend Cup final standings",
    });

    await Promise.resolve();
    expect(toBlobMock).not.toHaveBeenCalled();

    Object.defineProperty(image, "complete", {
      configurable: true,
      value: true,
    });
    image.dispatchEvent(new Event("load"));

    await sharePromise;

    expect(fetch).toHaveBeenCalledWith("https://cdn.test/avatar.jpg", {
      cache: "no-store",
      mode: "cors",
      signal: expect.any(AbortSignal),
    });
    expect(toBlobMock).toHaveBeenCalled();
    expect(image.src).toBe("https://cdn.test/avatar.jpg");
  });

  it("waits for decoded avatar pixels before exporting", async () => {
    const image = document.createElement("img");
    Object.defineProperty(image, "complete", {
      configurable: true,
      value: true,
    });
    image.src = "data:image/png;base64,YXZhdGFy";
    let finishDecode: () => void = () => undefined;
    const decodePromise = new Promise<void>((resolve) => {
      finishDecode = resolve;
    });
    const decode = vi.fn().mockReturnValue(decodePromise);
    Object.defineProperty(image, "decode", {
      configurable: true,
      value: decode,
    });
    document.body.append(image);
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { share: vi.fn().mockResolvedValue(undefined) },
    });

    const sharePromise = shareSessionStandingsCard({
      node: document.body,
      fileName: "Weekend Cup",
      shareTitle: "Weekend Cup final standings",
    });

    await Promise.resolve();
    expect(toBlobMock).not.toHaveBeenCalled();

    finishDecode();
    await sharePromise;

    expect(decode).toHaveBeenCalled();
    expect(toBlobMock).toHaveBeenCalled();
  });

  it("falls back to download when native sharing is unavailable", async () => {
    const anchor = document.createElement("a");
    const click = vi.spyOn(anchor, "click").mockImplementation(() => undefined);
    const originalCreateElement = document.createElement.bind(document);
    const createElement = vi
      .spyOn(document, "createElement")
      .mockImplementation((tagName: string) =>
        tagName.toLowerCase() === "a"
          ? anchor
          : originalCreateElement(tagName)
      );
    const createObjectUrl = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:test");
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);

    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });

    const result = await shareSessionStandingsCard({
      node: document.body,
      fileName: "Weekend Cup",
      shareTitle: "Weekend Cup final standings",
    });

    expect(click).toHaveBeenCalled();
    expect(result).toEqual({ method: "download" });

    createElement.mockRestore();
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
  });
});
