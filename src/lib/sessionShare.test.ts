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
