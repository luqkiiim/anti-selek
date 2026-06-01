import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mocks.auth,
}));

import { GET } from "./route";

const AVATAR_SOURCE =
  "https://store.public.blob.vercel-storage.com/avatars/user-1/photo.png";

function createRequest(source = AVATAR_SOURCE) {
  return new Request(
    `http://localhost/api/share-avatar?source=${encodeURIComponent(source)}`
  );
}

describe("share avatar route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.auth.mockReset();
    mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("requires authentication", async () => {
    mocks.auth.mockResolvedValue(null);

    const response = await GET(createRequest());

    expect(response.status).toBe(401);
  });

  it("rejects non-avatar and non-Blob sources", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");

    const response = await GET(
      createRequest("https://example.com/avatars/user-1/photo.png")
    );

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns a same-origin image response for a valid Blob avatar", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          "content-length": "3",
          "content-type": "image/png",
        },
      })
    );

    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("private, max-age=86400");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3])
    );
    expect(fetch).toHaveBeenCalledWith(AVATAR_SOURCE, {
      cache: "force-cache",
      signal: expect.any(AbortSignal),
    });
  });

  it("rejects unsupported upstream content types", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("not an image", {
        headers: { "content-type": "text/plain" },
      })
    );

    const response = await GET(createRequest());

    expect(response.status).toBe(415);
  });
});
