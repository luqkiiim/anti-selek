// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionData } from "./useSessionData";

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

async function safeJson<T>(response: Response) {
  return (await response.json()) as T;
}

function readTestText(container: HTMLElement, testId: string) {
  return container.querySelector(`[data-testid="${testId}"]`)?.textContent ?? "";
}

function HookHarness({
  code,
  enabled,
  setError,
}: {
  code: string;
  enabled: boolean;
  setError: (message: string) => void;
}) {
  const {
    sessionData,
    isInitialLoadPending,
    initialLoadError,
    patchSessionData,
    retryInitialLoad,
  } = useSessionData({
    code,
    enabled,
    safeJson,
    setError,
  });

  return (
    <div>
      <p data-testid="pending">{isInitialLoadPending ? "yes" : "no"}</p>
      <p data-testid="error">{initialLoadError ?? ""}</p>
      <p data-testid="name">{sessionData?.name ?? ""}</p>
      <button
        type="button"
        onClick={() =>
          patchSessionData(
            (current) => ({
              ...current,
              name: "Urgent Patch Applied",
            }),
            { urgent: true }
          )
        }
      >
        Urgent patch
      </button>
      <button type="button" onClick={retryInitialLoad}>
        Retry
      </button>
    </div>
  );
}

describe("useSessionData", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    await act(async () => {
      root.unmount();
    });

    container.remove();
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  async function flushAsyncWork() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  async function renderHarness(setError = vi.fn(), code = "UICHECK") {
    await act(async () => {
      root.render(
        <HookHarness code={code} enabled setError={setError} />
      );
    });

    await flushAsyncWork();

    return { setError };
  }

  it("exposes an initial load error instead of leaving the first fetch in a loading-only state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse({ error: "Rate limit exceeded" }, 429)
      )
    );

    const { setError } = await renderHarness();

    expect(readTestText(container, "pending")).toBe("no");
    expect(readTestText(container, "error")).toBe("Rate limit exceeded");
    expect(readTestText(container, "name")).toBe("");
    expect(setError).not.toHaveBeenCalled();
  });

  it("can retry successfully after the first load fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          createJsonResponse({ error: "Rate limit exceeded" }, 429)
        )
        .mockResolvedValueOnce(
          createJsonResponse({ name: "Court Card Layout Check" })
        )
    );

    await renderHarness();

    const retryButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Retry"
    );
    expect(retryButton).toBeTruthy();

    await act(async () => {
      retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(readTestText(container, "pending")).toBe("no");
    expect(readTestText(container, "error")).toBe("");
    expect(readTestText(container, "name")).toBe("Court Card Layout Check");
  });

  it("can apply an urgent session patch without scheduling another fetch", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse({ name: "Original Session" })
    );
    vi.stubGlobal("fetch", fetchMock);

    await renderHarness();

    const urgentPatchButton = Array.from(
      container.querySelectorAll("button")
    ).find((button) => button.textContent === "Urgent patch");
    expect(urgentPatchButton).toBeTruthy();

    await act(async () => {
      urgentPatchButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });

    expect(readTestText(container, "name")).toBe("Urgent Patch Applied");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a score snapshot from another viewer on the next two-second poll", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ name: "Before score" }))
      .mockResolvedValueOnce(createJsonResponse({ name: "After score" }));
    vi.stubGlobal("fetch", fetchMock);

    await renderHarness();
    expect(readTestText(container, "name")).toBe("Before score");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sessions/UICHECK",
      expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await flushAsyncWork();

    expect(readTestText(container, "name")).toBe("After score");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not let a poll started before a local score patch revert that patch", async () => {
    vi.useFakeTimers();
    let resolveStaleResponse: ((response: Response) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ name: "Before score" }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveStaleResponse = resolve;
          })
      );
    vi.stubGlobal("fetch", fetchMock);

    await renderHarness();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const urgentPatchButton = Array.from(
      container.querySelectorAll("button")
    ).find((button) => button.textContent === "Urgent patch");
    await act(async () => {
      urgentPatchButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true })
      );
    });
    expect(readTestText(container, "name")).toBe("Urgent Patch Applied");

    await act(async () => {
      resolveStaleResponse?.(createJsonResponse({ name: "Stale response" }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(readTestText(container, "name")).toBe("Urgent Patch Applied");
  });

  it("does not overlap polls while a session request is still pending", async () => {
    vi.useFakeTimers();
    let resolvePending: ((response: Response) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ name: "Loaded" }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolvePending = resolve;
          })
      );
    vi.stubGlobal("fetch", fetchMock);

    await renderHarness();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      resolvePending?.(createJsonResponse({ name: "Latest" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(readTestText(container, "name")).toBe("Latest");
  });

  it("aborts a hung poll after ten seconds and resumes polling", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ name: "Loaded" }))
      .mockImplementationOnce(
        (_url: string, options: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            requestSignal = options.signal as AbortSignal;
            requestSignal.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true }
            );
          })
      )
      .mockResolvedValueOnce(createJsonResponse({ name: "Recovered" }));
    vi.stubGlobal("fetch", fetchMock);

    await renderHarness();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    await flushAsyncWork();
    expect(requestSignal?.aborted).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await flushAsyncWork();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(readTestText(container, "name")).toBe("Recovered");
  });

  it("refreshes when the tab regains focus", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ name: "Before focus" }))
      .mockResolvedValueOnce(createJsonResponse({ name: "After focus" }));
    vi.stubGlobal("fetch", fetchMock);

    await renderHarness();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    await flushAsyncWork();

    expect(readTestText(container, "name")).toBe("After focus");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("pauses polling while hidden and refreshes when visible again", async () => {
    vi.useFakeTimers();
    const visibilitySpy = vi
      .spyOn(document, "visibilityState", "get")
      .mockReturnValue("visible");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ name: "Before hidden" }))
      .mockResolvedValueOnce(createJsonResponse({ name: "After visible" }));
    vi.stubGlobal("fetch", fetchMock);

    await renderHarness();
    visibilitySpy.mockReturnValue("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    visibilitySpy.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await flushAsyncWork();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readTestText(container, "name")).toBe("After visible");
  });

  it("refreshes when the network comes back online", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ name: "Before reconnect" }))
      .mockResolvedValueOnce(createJsonResponse({ name: "After reconnect" }));
    vi.stubGlobal("fetch", fetchMock);

    await renderHarness();
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(readTestText(container, "name")).toBe("After reconnect");
  });

  it("respects Retry-After before sending another poll", async () => {
    vi.useFakeTimers();
    const rateLimited = new Response(
      JSON.stringify({ error: "Rate limit exceeded" }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "5",
        },
      }
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(createJsonResponse({ name: "Loaded" }))
      .mockResolvedValueOnce(rateLimited)
      .mockResolvedValueOnce(createJsonResponse({ name: "Recovered" }));
    vi.stubGlobal("fetch", fetchMock);

    await renderHarness();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await flushAsyncWork();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(readTestText(container, "name")).toBe("Recovered");
  });

  it("ignores a late response from a previous session code", async () => {
    let resolveOldResponse: ((response: Response) => void) | undefined;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveOldResponse = resolve;
          })
      )
      .mockResolvedValueOnce(createJsonResponse({ name: "New session" }));
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      root.render(
        <HookHarness code="UICHECK" enabled setError={vi.fn()} />
      );
    });
    await act(async () => {
      root.render(
        <HookHarness code="NEWCODE" enabled setError={vi.fn()} />
      );
    });
    await flushAsyncWork();
    expect(readTestText(container, "name")).toBe("New session");

    await act(async () => {
      resolveOldResponse?.(createJsonResponse({ name: "Old session" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(readTestText(container, "name")).toBe("New session");
  });
});
