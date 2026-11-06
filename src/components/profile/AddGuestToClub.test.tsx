// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/lib/adminClient", async importOriginal => ({ ...await importOriginal<typeof import("@/lib/adminClient")>(), adminApi: mocks.api }));
vi.mock("@/components/product/Primitives", () => ({ ErrorText: ({ error }: { error: string }) => error ? <p role="alert">{error}</p> : null, Sheet: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div role="dialog">{children}</div> : null }));
import { AddGuestToClub } from "./AddGuestToClub";
import { AdminSaveOutcomeUnknownError } from "@/lib/adminClient";
let root: Root, container: HTMLDivElement;
async function click(text: string) {
  const button = Array.from(document.querySelectorAll("button")).find(button => button.textContent === text);
  expect(button).toBeTruthy(); await act(async () => button!.click());
}
describe("profile guest promotion", () => {
  beforeEach(async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    mocks.api.mockReset().mockImplementation(async (_url, method) => method === "POST" ? {} : [{ id: "guest-one" }]);
    container = document.createElement("div"); document.body.append(container); root = createRoot(container);
    await act(async () => root.render(<AddGuestToClub clubId="club-one" userId="guest-one" name="Alex" />));
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); });
  it("confirms the exact identity, closes on commit and does not repeat promotion", async () => {
    await click("Add to club"); expect(mocks.api).not.toHaveBeenCalled();
    await click("Add player");
    expect(mocks.api.mock.calls.filter(call => call[1] === "POST")).toEqual([["/api/clubs/club-one/guests/guest-one", "POST", undefined, expect.objectContaining({ signal: expect.any(AbortSignal) })]]);
    expect(container.textContent).toContain("Added to club"); expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
  it("cancels without changing membership", async () => { await click("Add to club"); await click("Cancel"); expect(mocks.api).not.toHaveBeenCalled(); });
  it("checks authoritative membership after a lost response without repeating the write", async () => {
    mocks.api.mockRejectedValueOnce(new AdminSaveOutcomeUnknownError());
    await click("Add to club"); await click("Add player");
    const save = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Add player")!;
    expect(save.disabled).toBe(true);
    await click("Refresh to check");
    expect(container.textContent).toContain("Added to club");
    expect(mocks.api.mock.calls.filter(call => call[1] === "POST")).toHaveLength(1);
    expect(mocks.api).toHaveBeenLastCalledWith("/api/clubs/club-one/members");
  });
});
