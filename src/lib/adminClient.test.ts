import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adminApi, AdminSaveOutcomeUnknownError } from "./adminClient";
import { ApiError } from "@/components/prototype/api";

describe("bounded admin requests", () => {
  beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("times out reads even when their body never finishes", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => new Promise(() => {}) } as unknown as Response);
    const request = adminApi("/read");
    const checked = expect(request).rejects.toThrow("Request timed out");
    await vi.advanceTimersByTimeAsync(10_000);
    await checked;
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("treats a lost save response as unknown and never retries", async () => {
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}));
    const checked = expect(adminApi("/write", "POST", { name: "Ari" })).rejects.toBeInstanceOf(AdminSaveOutcomeUnknownError);
    await vi.advanceTimersByTimeAsync(30_000);
    await checked;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("treats malformed success bodies as unknown saves", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("<html>oops</html>", { status: 200 }));
    await expect(adminApi("/write", "PATCH", {})).rejects.toBeInstanceOf(AdminSaveOutcomeUnknownError);
  });
  it("preserves explicit rejection status and message", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: "Rating changed", code: "CONFLICT" }, { status: 409 }));
    await expect(adminApi("/write", "POST", {})).rejects.toMatchObject({ name: "ApiError", message: "Rating changed", status: 409, code: "CONFLICT" });
    expect(ApiError).toBeDefined();
  });
  it.each([500, 502, 503, 504])("does not imply rollback for a write that returns HTTP %s", async status => {
    vi.mocked(fetch).mockResolvedValue(new Response("Gateway unavailable", { status }));
    await expect(adminApi("/write", "POST", {})).rejects.toBeInstanceOf(AdminSaveOutcomeUnknownError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("aborts on caller cancellation, including during response parsing", async () => {
    const controller = new AbortController();
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => new Promise(() => {}) } as unknown as Response);
    const checked = expect(adminApi("/write", "POST", {}, { signal: controller.signal })).rejects.toBeInstanceOf(AdminSaveOutcomeUnknownError);
    controller.abort();
    await checked;
    expect(vi.mocked(fetch).mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("sends multipart bodies without overriding the boundary header", async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ avatarUrl: "/photo" }));
    const form = new FormData(); form.set("avatar", "photo");
    await adminApi("/photo", "POST", form);
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ body: form, headers: undefined });
    expect(vi.getTimerCount()).toBe(0);
  });
});
