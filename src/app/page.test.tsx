// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  useDashboardPage: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signOut: mocks.signOut,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("./useDashboardPage", () => ({
  useDashboardPage: mocks.useDashboardPage,
}));

vi.mock("@/components/dashboard/CreateClubModal", () => ({
  CreateClubModal: () => null,
}));

vi.mock("@/components/dashboard/JoinClubModal", () => ({
  JoinClubModal: () => null,
}));

import Home from "./page";

describe("dashboard home", () => {
  let container: HTMLDivElement;
  let root: Root;
  let dashboardState: Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    dashboardState = {
      status: "authenticated",
      isQuickAccess: false,
      accountName: "Owner",
      clubs: [],
      newClubName: "",
      setNewClubName: vi.fn(),
      newClubPassword: "",
      setNewClubPassword: vi.fn(),
      joinClubName: "",
      setJoinClubName: vi.fn(),
      joinClubPassword: "",
      setJoinClubPassword: vi.fn(),
      isCreateClubOpen: false,
      isJoinClubOpen: false,
      creatingClub: false,
      joiningClub: false,
      loading: false,
      dashboardError: "",
      createClubError: null,
      joinClubError: null,
      openCreateClubModal: vi.fn(),
      closeCreateClubModal: vi.fn(),
      openJoinClubModal: vi.fn(),
      closeJoinClubModal: vi.fn(),
      createClub: vi.fn(),
      joinClub: vi.fn(),
    };
    mocks.useDashboardPage.mockReturnValue(dashboardState);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
  });

  it("shows a settings link for full-account players on the dashboard", async () => {
    await act(async () => {
      root.render(<Home />);
    });

    const settingsLink = Array.from(container.querySelectorAll("a")).find(
      (node) => node.getAttribute("href") === "/settings"
    );

    expect(settingsLink?.textContent).toContain("Settings");
  });

  it("keeps Quick access limitations visible on the dashboard", async () => {
    mocks.useDashboardPage.mockReturnValue({
      ...dashboardState,
      isQuickAccess: true,
    });

    await act(async () => {
      root.render(<Home />);
    });

    expect(container.textContent).toContain("Quick access is view-only");
    expect(container.textContent).toContain("cannot join clubs, submit scores");
  });
});
