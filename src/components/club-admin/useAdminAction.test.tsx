// @vitest-environment jsdom
import { act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminAction, ADMIN_REFRESH_WARNING } from "./useAdminAction";
import { AdminSaveOutcomeUnknownError } from "@/lib/adminClient";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(accept => { resolve = accept; });
  return { promise, resolve };
}
describe("admin save lifecycle", () => {
  let root: Root;
  let state: ReturnType<typeof useAdminAction>;
  const refresh = vi.fn();
  function Harness() { const value = useAdminAction(refresh); useLayoutEffect(() => { state = value; }); return null; }
  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    vi.useFakeTimers(); refresh.mockReset().mockResolvedValue(undefined);
    root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Harness />));
  });
  afterEach(async () => { await act(async () => root.unmount()); vi.useRealTimers(); });

  it("confirms a saved write and unlocks before its refresh completes", async () => {
    const read = deferred<void>(); refresh.mockReturnValue(read.promise);
    const success = vi.fn(); const write = vi.fn().mockResolvedValue({ role: "ADMIN" });
    await act(async () => { expect(await state.run(write, success)).toBe(true); });
    expect(success).toHaveBeenCalledWith({ role: "ADMIN" });
    expect(state.busy).toBe(false); expect(state.refreshing).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(state.refreshWarning).toBe(ADMIN_REFRESH_WARNING);
    expect(state.error).toBe(""); expect(state.refreshing).toBe(false);
    refresh.mockResolvedValue(undefined);
    await act(async () => { await state.retryRefresh(); });
    expect(state.refreshWarning).toBe(""); expect(write).toHaveBeenCalledTimes(1);
  });
  it("reports refresh failures separately from mutation errors", async () => {
    refresh.mockRejectedValue(new Error("Unavailable"));
    await act(async () => { await state.run(async () => "saved"); });
    expect(state.error).toBe(""); expect(state.refreshWarning).toBe(ADMIN_REFRESH_WARNING);
  });
  it("blocks duplicate submissions during a pending mutation", async () => {
    const pending = deferred<string>(); const write = vi.fn(() => pending.promise);
    let first!: Promise<boolean>;
    await act(async () => { first = state.run(write); expect(await state.run(write)).toBe(false); });
    expect(write).toHaveBeenCalledTimes(1); expect(state.busy).toBe(true);
    await act(async () => { pending.resolve("ok"); await first; });
    expect(state.busy).toBe(false);
  });
  it("unlocks a stalled mutation with an uncertain outcome and read-only recovery", async () => {
    const write = vi.fn(() => new Promise(() => {}));
    let pending!: Promise<boolean>;
    await act(async () => { pending = state.run(write); });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); await pending; });
    expect(state.busy).toBe(false); expect(state.uncertain).toBe(true);
    expect(state.error).toContain("Couldn’t confirm the save");
    await act(async () => { expect(await state.run(write)).toBe(false); await state.retryRefresh(); });
    expect(write).toHaveBeenCalledTimes(1); expect(state.uncertain).toBe(false);
  });
  it("does not clear uncertainty when recovery fails", async () => {
    await act(async () => { await state.run(async () => { throw new AdminSaveOutcomeUnknownError(); }); });
    refresh.mockRejectedValue(new Error("offline"));
    await act(async () => { await state.retryRefresh(); });
    expect(state.uncertain).toBe(true); expect(state.refreshWarning).toBe("");
  });
  it("lets an uncertain newer save recover without waiting for an older background read", async () => {
    const oldRead = deferred<void>();
    refresh.mockReturnValueOnce(oldRead.promise);
    await act(async () => { await state.run(async () => "first saved"); });
    expect(state.refreshing).toBe(true);
    await act(async () => { await state.run(async () => { throw new AdminSaveOutcomeUnknownError(); }); });
    expect(state.refreshing).toBe(false);
    await act(async () => { await state.retryRefresh(); });
    expect(state.uncertain).toBe(false);
    await act(async () => { oldRead.resolve(); });
    expect(state.refreshWarning).toBe("");
  });
  it("aborts pending mutations on unmount and ignores late success", async () => {
    const pending = deferred<string>(); const success = vi.fn(); let signal!: AbortSignal;
    let result!: Promise<boolean>;
    await act(async () => { result = state.run(s => { signal = s; return pending.promise; }, success); });
    await act(async () => root.unmount());
    expect(signal.aborted).toBe(true);
    pending.resolve("saved"); await result;
    expect(success).not.toHaveBeenCalled(); expect(refresh).not.toHaveBeenCalled();
  });
});
