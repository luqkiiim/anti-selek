// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildShareAvatarUrl,
  isAllowedShareAvatarSource,
  prepareShareAvatarDataUrls,
  waitForShareCardRender,
} from "./shareAvatar";

describe("share avatar helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("builds a same-origin proxy URL for share-only avatar images", () => {
    expect(
      buildShareAvatarUrl(
        "https://store.public.blob.vercel-storage.com/avatars/user-1/photo.png"
      )
    ).toBe(
      "/api/share-avatar?source=https%3A%2F%2Fstore.public.blob.vercel-storage.com%2Favatars%2Fuser-1%2Fphoto.png"
    );
    expect(buildShareAvatarUrl(null)).toBeNull();
  });

  it("allows only HTTPS Vercel Blob avatar objects", () => {
    expect(
      isAllowedShareAvatarSource(
        "https://store.public.blob.vercel-storage.com/avatars/user-1/photo.png"
      )
    ).toBe(true);
    expect(
      isAllowedShareAvatarSource(
        "https://blob.vercel-storage.com/avatars/user-1/photo.png"
      )
    ).toBe(true);
    expect(
      isAllowedShareAvatarSource(
        "https://store.public.blob.vercel-storage.com/documents/report.png"
      )
    ).toBe(false);
    expect(
      isAllowedShareAvatarSource("https://example.com/avatars/user-1/photo.png")
    ).toBe(false);
    expect(
      isAllowedShareAvatarSource(
        "http://store.public.blob.vercel-storage.com/avatars/user-1/photo.png"
      )
    ).toBe(false);
  });

  it("prepares embedded data URLs, skips missing photos, and deduplicates sources", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      blob: () =>
        Promise.resolve(
          new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" })
        ),
    });

    const prepared = await prepareShareAvatarDataUrls(
      [
        { userId: "u1", user: { avatarUrl: "https://cdn.test/avatar.png" } },
        { userId: "u2", user: { avatarUrl: null } },
        { userId: "u3", user: { avatarUrl: "https://cdn.test/avatar.png" } },
      ],
      { fetchImpl: fetchImpl as unknown as typeof fetch }
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/share-avatar?source=https%3A%2F%2Fcdn.test%2Favatar.png",
      {
        cache: "no-store",
        credentials: "same-origin",
        signal: expect.any(AbortSignal),
      }
    );
    expect(prepared.get("u1")).toMatch(/^data:image\/png;base64,/);
    expect(prepared.get("u3")).toBe(prepared.get("u1"));
    expect(prepared.has("u2")).toBe(false);
  });

  it("prepares only the top 11 displayed players", async () => {
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        blob: () =>
          Promise.resolve(new Blob([new Uint8Array([1])], { type: "image/png" })),
      })
    );
    const players = Array.from({ length: 12 }, (_, index) => ({
      userId: `u${index + 1}`,
      user: { avatarUrl: `https://cdn.test/avatar-${index + 1}.png` },
    }));

    const prepared = await prepareShareAvatarDataUrls(players, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(11);
    expect(prepared.has("u11")).toBe(true);
    expect(prepared.has("u12")).toBe(false);
  });

  it("rejects sharing when an uploaded photo cannot be prepared", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));

    await expect(
      prepareShareAvatarDataUrls(
        [{ userId: "u1", user: { avatarUrl: "https://cdn.test/missing.png" } }],
        { fetchImpl }
      )
    ).rejects.toThrow("Could not prepare profile pictures. Try again.");
  });

  it("rejects sharing when avatar preparation times out", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        })
    );
    const preparation = prepareShareAvatarDataUrls(
      [{ userId: "u1", user: { avatarUrl: "https://cdn.test/slow.png" } }],
      { fetchImpl, timeoutMs: 10 }
    );
    const expectedFailure = expect(preparation).rejects.toThrow(
      "Could not prepare profile pictures. Try again."
    );

    await vi.advanceTimersByTimeAsync(11);
    await expectedFailure;
  });

  it("waits for two animation frames before capture", async () => {
    const requestAnimationFrame = vi
      .fn()
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      });
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);

    await waitForShareCardRender();

    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
  });
});
