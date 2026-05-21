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
  });

  async function flushAsyncWork() {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  async function renderHarness(setError = vi.fn()) {
    await act(async () => {
      root.render(
        <HookHarness code="UICHECK" enabled setError={setError} />
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

    const retryButton = container.querySelector("button");
    expect(retryButton).toBeTruthy();

    await act(async () => {
      retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await flushAsyncWork();

    expect(readTestText(container, "pending")).toBe("no");
    expect(readTestText(container, "error")).toBe("");
    expect(readTestText(container, "name")).toBe("Court Card Layout Check");
  });
});
