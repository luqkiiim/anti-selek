// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { AdjustClubRating } from "./AdjustClubRating";

let root: Root;
let container: HTMLElement;
const fetchMock = vi.fn();
const changed = vi.fn();
const history = [{ id: "log", beforeElo: 1000, afterElo: 1125, reason: "Correction", actorName: "Admin", createdAt: "2026-09-08T00:00:00.000Z" }];

function response(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => data } as Response;
}

async function click(label: string) {
  const button = Array.from(document.querySelectorAll("button")).find(item => item.textContent === label);
  expect(button, `button ${label}`).toBeTruthy();
  await act(async () => button!.click());
}

async function changeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function openWithRating(rating = 1125) {
  fetchMock.mockResolvedValueOnce(response({ rating, history }));
  await click("Adjust rating");
}

async function enterAdjustment(value: string, reason = "Correction") {
  await changeValue(document.querySelector<HTMLInputElement>('input[type="number"]')!, value);
  await changeValue(document.querySelector<HTMLTextAreaElement>("textarea")!, reason);
}

describe("rating adjustment panel", () => {
  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    fetchMock.mockReset();
    changed.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    await act(async () => root.render(<AdjustClubRating clubId="club" userId="player" name="Alex" onChanged={changed} />));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("loads history only when opened and restores through an explicit new adjustment", async () => {
    expect(fetchMock).not.toHaveBeenCalled();
    await openWithRating();
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: "GET" });
    expect(document.body.textContent).toContain("Current rating: 1125");
    expect(document.querySelector("details")?.open).toBe(false);
    expect(Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Save adjustment")?.disabled).toBe(true);

    await click("Use previous rating");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(response({ rating: 1000 }));
    await click("Save adjustment");

    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body).toEqual({ rating: 1000, expectedRating: 1125, reason: expect.stringContaining("Restore previous rating") });
    expect(changed).toHaveBeenCalledWith(1000);
    expect(document.body.textContent).toContain("Rating updated");
  });

  it("cancels without saving", async () => {
    await openWithRating();
    await click("Cancel");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
  });

  it("keeps saving disabled after a failed initial load", async () => {
    fetchMock.mockResolvedValueOnce(response({ error: "Could not load rating" }, 403));
    await click("Adjust rating");
    expect(document.body.textContent).toContain("Could not load rating");
    expect(Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Save adjustment")?.disabled).toBe(true);
  });

  it("bounds a stalled rating read", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(() => new Promise(() => {}));
    await click("Adjust rating");
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;

    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(signal.aborted).toBe(true);
    expect(document.body.textContent).toContain("Request timed out. Try again.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cancels an active rating read when unmounted", async () => {
    fetchMock.mockImplementationOnce(() => new Promise(() => {}));
    await click("Adjust rating");
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    await act(async () => root.unmount());
    expect(signal.aborted).toBe(true);
  });

  it("ignores an older rating read when a newer open finishes first", async () => {
    let resolveOlder!: (result: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOlder = resolve; }));
    await click("Adjust rating");
    fetchMock.mockResolvedValueOnce(response({ rating: 1300, history: [] }));
    await click("Adjust rating");
    expect(document.body.textContent).toContain("Current rating: 1300");

    await act(async () => { resolveOlder(response({ rating: 700, history: [] })); });
    expect(document.body.textContent).toContain("Current rating: 1300");
    expect(document.body.textContent).not.toContain("Current rating: 700");
  });

  it("keeps the editor open on a 409 expected-rating conflict", async () => {
    await openWithRating();
    await enterAdjustment("1300");
    fetchMock.mockResolvedValueOnce(response({ error: "Rating changed since you opened this panel. Reopen it to review the latest rating." }, 409));
    await click("Save adjustment");

    expect(document.body.textContent).toContain("Rating changed since you opened this panel");
    expect(document.body.textContent).toContain("Current rating: 1125");
    expect(document.querySelector("textarea")?.value).toBe("Correction");
    expect(changed).not.toHaveBeenCalled();
  });

  it("recovers from a stalled save with a GET only and never replays the POST", async () => {
    vi.useFakeTimers();
    await openWithRating();
    await enterAdjustment("1300");
    fetchMock.mockImplementationOnce(() => new Promise(() => {}));
    await click("Save adjustment");
    const saveSignal = fetchMock.mock.calls[1][1].signal as AbortSignal;

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(saveSignal.aborted).toBe(true);
    expect(document.body.textContent).toContain("Couldn’t confirm the save. Refresh to check.");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockResolvedValueOnce(response({ rating: 1300, history }));
    await click("Refresh to check");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: "GET" });
    expect(fetchMock.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
    expect(document.body.textContent).toContain("Current rating: 1300");
    expect(document.body.textContent).not.toContain("Couldn’t confirm the save. Refresh to check.");
  });

  it("uses the returned rating and does not turn a local callback failure into a failed save", async () => {
    await openWithRating();
    await enterAdjustment("1300");
    changed.mockImplementation(() => { throw new Error("local state callback failed"); });
    fetchMock.mockResolvedValueOnce(response({ rating: 1179 }));
    // The action hook performs a follow-up read after a confirmed save.
    fetchMock.mockResolvedValueOnce(response({ rating: 1179, history }));
    await click("Save adjustment");

    expect(fetchMock.mock.calls[1][1].body).toContain('"rating":1300');
    expect(changed).toHaveBeenCalledOnce();
    expect(changed).toHaveBeenCalledWith(1179);
    expect(document.body.textContent).toContain("Rating updated");
    expect(document.body.textContent).not.toContain("Could not save rating");
  });

  it("portals the rating editor inside the active native dialog", async () => {
    await act(async () => root.unmount());
    container.remove();
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    document.body.append(dialog);
    container = dialog;
    root = createRoot(dialog);
    await act(async () => root.render(<AdjustClubRating clubId="club" userId="player" name="Alex" onChanged={changed} />));

    await openWithRating();
    const modal = dialog.querySelector(".app-modal-backdrop");
    expect(modal).toBeTruthy();
    expect(modal?.parentElement).toBe(dialog);
  });
});
