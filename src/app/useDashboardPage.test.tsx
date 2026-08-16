// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: mocks.useSession,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks,
}));

import { useDashboardPage } from "./useDashboardPage";

describe("useDashboardPage club form errors", () => {
  let container: HTMLDivElement;
  let root: Root;
  let latest: ReturnType<typeof useDashboardPage>;

  function Harness() {
    const dashboard = useDashboardPage();
    useEffect(() => {
      latest = dashboard;
    }, [dashboard]);
    return null;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useSession.mockReturnValue({
      data: { user: { id: "user-1", name: "Owner" } },
      status: "authenticated",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/clubs" && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              error: "Club name already exists",
              field: "clubName",
            }),
            { status: 409 }
          );
        }
        if (url === "/api/clubs") {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        if (url === "/api/tutorial-playground") {
          return new Response(JSON.stringify({ playground: null }), {
            status: 200,
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      })
    );
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
    container.remove();
  });

  it("keeps create failures in the create dialog and clears them on correction", async () => {
    await act(async () => root.render(<Harness />));

    await act(async () => {
      latest.openCreateClubModal();
      latest.setNewClubName("Net Players");
    });
    await act(async () => latest.createClub());

    expect(latest.dashboardError).toBe("");
    expect(latest.createClubError).toEqual({
      error: "Club name already exists",
      field: "clubName",
    });
    expect(latest.isCreateClubOpen).toBe(true);

    await act(async () => latest.setNewClubName("Net Players 2"));
    expect(latest.createClubError).toBeNull();
  });
});
