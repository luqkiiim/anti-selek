// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useResource } from "./api";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => { resolve = accept; });
  return { promise, resolve };
}

function Harness({ enabled = true, revision }: { enabled?: boolean; revision?: string } = {}) {
  const resource = useResource<{ value: string }>("/api/resource", { enabled, refreshKey: revision });
  return <>
    <output>{resource.data?.value ?? "loading"}</output>
    <button onClick={() => resource.update((current) => ({ ...current, value: "saved" }))}>Apply save response</button>
    <button onClick={() => void resource.refresh().catch(() => {})}>Refresh</button>
  </>;
}

describe("useResource response updates", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("ignores a GET started before the authoritative save response", async () => {
    const requests: Array<ReturnType<typeof deferred<Response>>> = [];
    vi.stubGlobal("fetch", vi.fn(() => {
      const request = deferred<Response>();
      requests.push(request);
      return request.promise;
    }));
    await act(async () => root.render(<Harness />));

    await act(async () => requests[0].resolve({
      ok: true,
      json: async () => ({ value: "initial" }),
    } as Response));
    expect(container.querySelector("output")?.textContent).toBe("initial");

    await act(async () => container.querySelectorAll("button")[1].click());
    expect(requests).toHaveLength(2);
    await act(async () => container.querySelectorAll("button")[0].click());
    expect(container.querySelector("output")?.textContent).toBe("saved");

    await act(async () => requests[1].resolve({
      ok: true,
      json: async () => ({ value: "stale" }),
    } as Response));
    expect(container.querySelector("output")?.textContent).toBe("saved");
  });

  it("loads standings only when enabled and when their revision changes", async () => {
    const fetchMock = vi.fn(async () => Response.json({ value: "standings" }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<Harness enabled={false} revision="one" />));
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => root.render(<Harness revision="one" />));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<Harness revision="one" />));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => root.render(<Harness revision="two" />));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => root.render(<Harness enabled={false} revision="two" />));
    await act(async () => container.querySelectorAll("button")[1].click());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector("output")?.textContent).toBe("standings");
  });

  it("coalesces simultaneous reads but starts a fresh read for a newer result revision", async () => {
    const requests: Array<ReturnType<typeof deferred<Response>>> = [];
    vi.stubGlobal("fetch", vi.fn(() => {
      const request = deferred<Response>();
      requests.push(request);
      return request.promise;
    }));
    await act(async () => root.render(<Harness revision="one" />));
    await act(async () => { container.querySelectorAll("button")[1].click(); });
    expect(requests).toHaveLength(1);
    await act(async () => root.render(<Harness revision="two" />));
    expect(requests).toHaveLength(2);
    await act(async () => requests[1].resolve(Response.json({ value: "new result" })));
    await act(async () => requests[0].resolve(Response.json({ value: "old result" })));
    expect(container.querySelector("output")?.textContent).toBe("new result");
  });

  it("allows standings to retry after a coalesced request times out", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementationOnce((_url: string, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })).mockResolvedValueOnce(Response.json({ value: "recovered" }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<Harness revision="one" />));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    await act(async () => container.querySelectorAll("button")[1].click());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container.querySelector("output")?.textContent).toBe("recovered");
  });
});
