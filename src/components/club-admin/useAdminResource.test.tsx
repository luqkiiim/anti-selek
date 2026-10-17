// @vitest-environment jsdom
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAdminResource } from "./useAdminResource";

let root: Root;
let state: ReturnType<typeof useAdminResource<{ name: string }>>;
const fetchMock = vi.fn();
function Harness() { const value = useAdminResource<{ name: string }>("/admin/resource"); useLayoutEffect(() => { state = value; }); return null; }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
  root = createRoot(document.createElement("div"));
});
afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); vi.unstubAllGlobals(); });

it("ignores a delayed read after applying an authoritative mutation result", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ name: "Original" }));
  await act(async () => root.render(<Harness />));
  let finish!: (value: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  let reading!: Promise<void>;
  await act(async () => { reading = state.refresh(); });
  await act(async () => { state.update(() => ({ name: "Saved" })); });
  await act(async () => { finish(Response.json({ name: "Stale" })); await reading; });
  expect(state.data?.name).toBe("Saved"); expect(state.error).toBe("");
});

it("bounds initial loading and permits a subsequent read-only retry", async () => {
  fetchMock.mockImplementationOnce(() => new Promise(() => {}));
  await act(async () => root.render(<Harness />));
  await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
  expect(state.error).toContain("Request timed out");
  fetchMock.mockResolvedValueOnce(Response.json({ name: "Fresh" }));
  await act(async () => { await state.refresh(); });
  expect(state.error).toBe(""); expect(state.data?.name).toBe("Fresh");
  expect(fetchMock.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
});
