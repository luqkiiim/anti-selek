import { describe, expect, it, vi } from "vitest";
import { saveScoreWithBackgroundRefresh } from "./scoreSave";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("saveScoreWithBackgroundRefresh", () => {
  it("applies a saved court response and releases that save before refreshes finish", async () => {
    const post = deferred<{ courtId: string }>();
    const refresh = deferred<void>();
    const startRefresh = vi.fn(() => refresh.promise);
    const apply = vi.fn();
    const savingCourts = new Set(["court-1"]);

    const save = saveScoreWithBackgroundRefresh(
      () => post.promise,
      (response) => {
        apply(response);
        savingCourts.delete(response.courtId);
      },
      startRefresh,
    );
    post.resolve({ courtId: "court-1" });
    await save;

    expect(apply).toHaveBeenCalledWith({ courtId: "court-1" });
    expect(savingCourts.has("court-1")).toBe(false);
    expect(startRefresh).toHaveBeenCalledOnce();
  });

  it("keeps the court save pending and drafts untouched when the POST fails", async () => {
    const post = deferred<{ courtId: string }>();
    const apply = vi.fn();
    const refresh = vi.fn(async () => {});
    const drafts = new Map([["match-1", ["21", "18"]]]);
    const savingCourts = new Set(["court-1"]);

    const save = saveScoreWithBackgroundRefresh(
      () => post.promise,
      (response) => {
        apply(response);
        drafts.delete("match-1");
        savingCourts.delete(response.courtId);
      },
      refresh,
    );
    post.reject(new Error("save rejected"));

    await expect(save).rejects.toThrow("save rejected");
    expect(apply).not.toHaveBeenCalled();
    expect(drafts.get("match-1")).toEqual(["21", "18"]);
    expect(savingCourts.has("court-1")).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("lets one court finish while another court POST is still pending", async () => {
    const courtOne = deferred<string>();
    const courtTwo = deferred<string>();
    const savingCourts = new Set(["court-1", "court-2"]);

    const saveOne = saveScoreWithBackgroundRefresh(
      () => courtOne.promise,
      () => savingCourts.delete("court-1"),
      async () => {},
    );
    const saveTwo = saveScoreWithBackgroundRefresh(
      () => courtTwo.promise,
      () => savingCourts.delete("court-2"),
      async () => {},
    );

    courtOne.resolve("saved");
    await saveOne;
    expect(savingCourts.has("court-1")).toBe(false);
    expect(savingCourts.has("court-2")).toBe(true);

    courtTwo.resolve("saved");
    await saveTwo;
    expect(savingCourts.size).toBe(0);
  });

  it("does not turn a saved score into an error when a background refresh fails", async () => {
    const apply = vi.fn();
    const refresh = vi.fn(async () => { throw new Error("refresh failed"); });

    await expect(saveScoreWithBackgroundRefresh(
      async () => ({ accepted: true }),
      apply,
      refresh,
    )).resolves.toEqual({ accepted: true });
    await Promise.resolve();

    expect(apply).toHaveBeenCalledWith({ accepted: true });
    expect(refresh).toHaveBeenCalledOnce();
  });
});
