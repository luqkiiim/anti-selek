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

    mocks.useDashboardPage.mockReturnValue({
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
      error: "",
      openCreateClubModal: vi.fn(),
      closeCreateClubModal: vi.fn(),
      openJoinClubModal: vi.fn(),
      closeJoinClubModal: vi.fn(),
      createClub: vi.fn(),
      joinClub: vi.fn(),
    });
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
});
