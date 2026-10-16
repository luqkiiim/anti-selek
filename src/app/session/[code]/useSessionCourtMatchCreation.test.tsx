// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionData } from "@/components/session/sessionTypes";
import { useSessionData } from "./useSessionData";
import { useSessionCourtMatchCreation } from "./useSessionCourtMatchCreation";

const emptySession = {
  name: "Open courts",
  courts: [
    { id: "court-1", courtNumber: 1, currentMatch: null },
    { id: "court-2", courtNumber: 2, currentMatch: null },
  ],
  players: [],
  matches: [],
  queuedMatch: null,
} as unknown as SessionData;

const createdMatches = ["court-1", "court-2"].map((courtId, index) => ({
  id: `match-${index + 1}`,
  courtId,
  status: "IN_PROGRESS",
  team1User1: { id: `p${index * 4 + 1}`, name: "A" },
  team1User2: { id: `p${index * 4 + 2}`, name: "B" },
  team2User1: { id: `p${index * 4 + 3}`, name: "C" },
  team2User2: { id: `p${index * 4 + 4}`, name: "D" },
}));

async function safeJson<T>(response: Response) {
  return (await response.json()) as T;
}

const setError = () => {};

function Harness() {
  const data = useSessionData({ code: "ABC", enabled: true, safeJson, setError });
  const actions = useSessionCourtMatchCreation({
    code: "ABC",
    sessionData: data.sessionData,
    safeJson,
    patchSessionData: data.patchSessionData,
    scheduleSessionRefresh: data.scheduleSessionRefresh,
    scheduleDeferredQueueRecovery: data.scheduleDeferredQueueRecovery,
    cancelDeferredQueueRecovery: data.cancelDeferredQueueRecovery,
    setError,
  });
  return <>
    <button onClick={() => void actions.createMatchesForCourts(["court-1", "court-2"])}>Create</button>
    <button onClick={() => data.scheduleDeferredQueueRecovery()}>Schedule recovery</button>
    <button onClick={() => void data.cancelDeferredQueueRecovery()}>Cancel recovery</button>
    <button onClick={() => void actions.clearQueuedMatch()}>Clear queue</button>
    <button onClick={() => data.patchSessionData((current) => ({ ...current, name: "Locally edited" }), { urgent: true })}>Local patch</button>
    {data.sessionData?.courts?.map((court) =>
      <p key={court.id} data-testid={court.id}>{court.currentMatch?.id ?? "empty"}</p>
    )}
  </>;
}

describe("created court rendering", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await act(async () => root.unmount());
    container.remove();
  });

  it("shows both committed courts while the refresh response is pending", async () => {
    let getCount = 0;
    const fetchMock = vi.fn((_: unknown, options?: RequestInit) => {
      if (options?.method === "POST") {
        return Promise.resolve(Response.json({ matches: createdMatches, queuedMatch: null }));
      }
      getCount += 1;
      return getCount === 1
        ? Promise.resolve(Response.json(emptySession))
        : new Promise<Response>(() => {});
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<Harness />));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="court-1"]')?.textContent).toBe("empty");

    vi.useFakeTimers();
    await act(async () => {
      container.querySelector("button")?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="court-1"]')?.textContent).toBe("match-1");
    expect(container.querySelector('[data-testid="court-2"]')?.textContent).toBe("match-2");

    await act(async () => { await vi.advanceTimersByTimeAsync(1_200); });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(container.querySelector('[data-testid="court-1"]')?.textContent).toBe("match-1");
    expect(container.querySelector('[data-testid="court-2"]')?.textContent).toBe("match-2");
  });

  it("sends the one-shot recovery flag only for a deferred generation response", async () => {
    const fetchMock = vi.fn((url: unknown, options?: RequestInit) => {
      if (options?.method === "POST") {
        return Promise.resolve(Response.json({ matches: createdMatches, queuedMatch: null, deferredQueueRecovery: true }));
      }
      return Promise.resolve(Response.json(emptySession));
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<Harness />));
    await act(async () => { await Promise.resolve(); });
    vi.useFakeTimers();
    await act(async () => {
      container.querySelector("button")?.click();
      await Promise.resolve();
    });
    expect(container.querySelector('[data-testid="court-1"]')?.textContent).toBe("match-1");

    await act(async () => { await vi.advanceTimersByTimeAsync(1_200); });
    const getUrls = fetchMock.mock.calls
      .filter(([, options]) => options?.method !== "POST")
      .map(([url]) => String(url));
    expect(getUrls).toEqual([
      "/api/sessions/ABC",
      "/api/sessions/ABC?recoverDeferredQueue=1",
    ]);
  });

  it("cancels a pending recovery before another refresh", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(emptySession)));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<Harness />));
    await act(async () => { await Promise.resolve(); });
    vi.useFakeTimers();
    await act(async () => {
      Array.from(container.querySelectorAll("button"))[1]?.click();
      Array.from(container.querySelectorAll("button"))[2]?.click();
      await vi.advanceTimersByTimeAsync(1_200);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("waits for an in-flight recovery to settle before clearing the queue", async () => {
    const queuedSession = { ...emptySession, queuedMatch: { id: "queue-1" } } as SessionData;
    let finishRecovery!: (response: Response) => void;
    const recoveryResponse = new Promise<Response>((resolve) => { finishRecovery = resolve; });
    const fetchMock = vi.fn((url: unknown, options?: RequestInit) => {
      if (options?.method === "DELETE") {
        return Promise.resolve(Response.json({ ok: true, queuedMatch: null }));
      }
      if (String(url).includes("recoverDeferredQueue=1")) return recoveryResponse;
      return Promise.resolve(Response.json(queuedSession));
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<Harness />));
    await act(async () => { await Promise.resolve(); });
    vi.useFakeTimers();

    await act(async () => {
      Array.from(container.querySelectorAll("button"))[1]?.click();
      await vi.advanceTimersByTimeAsync(1_200);
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("recoverDeferredQueue=1"))).toBe(true);

    await act(async () => {
      Array.from(container.querySelectorAll("button"))[3]?.click();
      await Promise.resolve();
    });
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false);

    await act(async () => {
      finishRecovery(Response.json(queuedSession));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(true);
  });

  it("retains recovery intent through a 429 response and its Retry-After cooldown", async () => {
    let recoveryCount = 0;
    const fetchMock = vi.fn((url: unknown) => {
      if (String(url).includes("recoverDeferredQueue=1")) {
        recoveryCount += 1;
        if (recoveryCount === 1) {
          return Promise.resolve(Response.json({ error: "Rate limited" }, {
            status: 429, headers: { "Retry-After": "2" },
          }));
        }
      }
      return Promise.resolve(Response.json(emptySession));
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<Harness />));
    await act(async () => { await Promise.resolve(); });
    vi.useFakeTimers();
    await act(async () => {
      Array.from(container.querySelectorAll("button"))[1]?.click();
      await vi.advanceTimersByTimeAsync(1_200);
    });
    expect(recoveryCount).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_999); });
    expect(recoveryCount).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(recoveryCount).toBe(2);
  });

  it("keeps recovery pending when an ordinary GET already set a cooldown", async () => {
    let ordinaryCount = 0;
    let recoveryCount = 0;
    const fetchMock = vi.fn((url: unknown) => {
      if (String(url).includes("recoverDeferredQueue=1")) recoveryCount += 1;
      else {
        ordinaryCount += 1;
        if (ordinaryCount === 2) {
          return Promise.resolve(Response.json({ error: "Rate limited" }, {
            status: 429, headers: { "Retry-After": "3" },
          }));
        }
      }
      return Promise.resolve(Response.json(emptySession));
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<Harness />));
    await act(async () => { await Promise.resolve(); });
    vi.useFakeTimers();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
      Array.from(container.querySelectorAll("button"))[1]?.click();
      await vi.advanceTimersByTimeAsync(1_200);
    });
    expect(recoveryCount).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(1_800); });
    expect(recoveryCount).toBe(1);
  });

  it("retries a recovery 429 even when a local patch made its payload stale", async () => {
    let finishFirstRecovery!: (response: Response) => void;
    const firstRecovery = new Promise<Response>((resolve) => { finishFirstRecovery = resolve; });
    let recoveryCount = 0;
    const fetchMock = vi.fn((url: unknown) => {
      if (String(url).includes("recoverDeferredQueue=1")) {
        recoveryCount += 1;
        if (recoveryCount === 1) return firstRecovery;
      }
      return Promise.resolve(Response.json(emptySession));
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<Harness />));
    await act(async () => { await Promise.resolve(); });
    vi.useFakeTimers();
    await act(async () => {
      Array.from(container.querySelectorAll("button"))[1]?.click();
      await vi.advanceTimersByTimeAsync(1_200);
    });
    await act(async () => {
      Array.from(container.querySelectorAll("button"))[4]?.click();
      finishFirstRecovery(Response.json({ error: "Rate limited" }, {
        status: 429, headers: { "Retry-After": "2" },
      }));
      await Promise.resolve();
    });
    expect(recoveryCount).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(recoveryCount).toBe(2);
  });

  it("lets Clear cancel a stale-revision recovery during its 429 cooldown", async () => {
    const queuedSession = { ...emptySession, queuedMatch: { id: "queue-1" } } as SessionData;
    let finishFirstRecovery!: (response: Response) => void;
    const firstRecovery = new Promise<Response>((resolve) => { finishFirstRecovery = resolve; });
    let recoveryCount = 0;
    const fetchMock = vi.fn((url: unknown, options?: RequestInit) => {
      if (options?.method === "DELETE") return Promise.resolve(Response.json({ ok: true, queuedMatch: null }));
      if (String(url).includes("recoverDeferredQueue=1")) {
        recoveryCount += 1;
        if (recoveryCount === 1) return firstRecovery;
      }
      return Promise.resolve(Response.json(queuedSession));
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<Harness />));
    await act(async () => { await Promise.resolve(); });
    vi.useFakeTimers();
    await act(async () => {
      Array.from(container.querySelectorAll("button"))[1]?.click();
      await vi.advanceTimersByTimeAsync(1_200);
    });
    await act(async () => {
      Array.from(container.querySelectorAll("button"))[4]?.click();
      finishFirstRecovery(Response.json({ error: "Rate limited" }, {
        status: 429, headers: { "Retry-After": "2" },
      }));
      await Promise.resolve();
    });
    await act(async () => {
      Array.from(container.querySelectorAll("button"))[3]?.click();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(2_100);
    });
    expect(recoveryCount).toBe(1);
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(true);
  });
});
