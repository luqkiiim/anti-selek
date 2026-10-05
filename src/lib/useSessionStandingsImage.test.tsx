// @vitest-environment jsdom

import { StrictMode, act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSessionStandingsImage } from "./useSessionStandingsImage";

describe("useSessionStandingsImage", () => {
  let container: HTMLDivElement;
  let root: Root;
  let current: ReturnType<typeof useSessionStandingsImage>;

  function Harness({ code, revision }: { code: string; revision?: string }) {
    const value = useSessionStandingsImage({ code, enabled: true, revision });
    useEffect(() => {
      current = value;
    }, [value]);
    return null;
  }

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("prefetches once for a completed session and reuses the blob on rerender", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => root.render(<StrictMode><Harness code="ABC123" /></StrictMode>));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(current.blob?.type).toBe("image/png");
    expect(current.preparing).toBe(false);

    await act(async () => root.render(<StrictMode><Harness code="ABC123" /></StrictMode>));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(current.blob?.type).toBe("image/png");

    await act(async () => current.retry());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores an old image when the session or revision changes", async () => {
    const pending: Array<(response: Response) => void> = [];
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      pending.push(resolve);
    }));
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => root.render(<Harness code="ABC123" revision="first" />));
    expect(current.preparing).toBe(true);

    await act(async () => root.render(<Harness code="ABC123" revision="second" />));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(current.blob).toBeNull();

    await act(async () => {
      pending[0](new Response(new Uint8Array([1]), {
        headers: { "content-type": "image/png" },
      }));
    });
    expect(current.blob).toBeNull();
    expect(current.preparing).toBe(true);

    await act(async () => {
      pending[1](new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/png" },
      }));
    });
    expect(current.blob?.size).toBe(3);
    expect(current.preparing).toBe(false);

    await act(async () => root.render(<Harness code="XYZ789" revision="second" />));
    expect(current.blob).toBeNull();
    expect(current.preparing).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
