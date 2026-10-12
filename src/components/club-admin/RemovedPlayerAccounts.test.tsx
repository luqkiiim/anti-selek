// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/components/prototype/api", () => ({
  api: mocks.api,
  useResource: (key: string | null) => ({
    data: key ? { players: [{ id: "local-player", name: "Alex Local" }] } : null,
    error: "",
    refresh: mocks.refresh,
  }),
  useAction: (after?: () => Promise<unknown>) => ({
    busy: false,
    error: "",
    run: async (operation: () => Promise<unknown>) => {
      await operation();
      await after?.();
    },
  }),
}));

import { RemovedPlayerAccounts } from "./RemovedPlayerAccounts";

describe("RemovedPlayerAccounts", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.api.mockReset().mockResolvedValue({});
    mocks.refresh.mockReset().mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps explicit local disconnect for an already-removed player", async () => {
    await act(async () => root.render(<RemovedPlayerAccounts clubId="club-1" onChanged={mocks.refresh} />));
    await act(async () => {
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Removed players"))?.click();
    });

    expect(container.textContent).toContain("history and rating stay intact");
    expect(container.textContent).toContain("memberships in other clubs are unchanged");
    await act(async () => {
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Disconnect account")?.click();
    });
    expect(container.textContent).toContain("This local profile becomes unclaimed");
    expect(container.textContent).toContain("Other club profiles and memberships stay connected");

    await act(async () => {
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Confirm disconnect")?.click();
    });
    expect(mocks.api).toHaveBeenCalledWith(
      "/api/clubs/club-1/members/local-player/ownership-release",
      "POST",
      { confirm: true }
    );
    expect(container.textContent).toContain("Account disconnected.");
  });
});
