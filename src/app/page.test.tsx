// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  replace: vi.fn(),
  useSearchParams: vi.fn(),
  useDashboardPage: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signOut: mocks.signOut,
  useSession: () => ({ data: { user: { id: "viewer-1" } } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: mocks.useSearchParams,
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
    localStorage.clear();
    mocks.useSearchParams.mockReturnValue(new URLSearchParams());
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
      (node) => node.getAttribute("href") === "/settings",
    );

    expect(settingsLink?.getAttribute("aria-label")).toBe("Account settings");
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
  it("opens the only club unless the chooser is explicitly requested", async () => {
    dashboardState.clubs = [
      { id: "club-1", name: "First club", role: "MEMBER", membersCount: 4 },
    ];
    await act(async () => {
      root.render(<Home />);
    });
    expect(mocks.replace).toHaveBeenCalledWith("/club/club-1");
    mocks.replace.mockClear();
    mocks.useSearchParams.mockReturnValue(new URLSearchParams("choose=1"));
    await act(async () => {
      root.render(<Home />);
    });
    expect(mocks.replace).not.toHaveBeenCalled();
  });
  it("uses only the current account's saved club and verifies membership", async () => {
    dashboardState.clubs = [
      { id: "club-1", name: "One", role: "MEMBER", membersCount: 4 },
      { id: "club-2", name: "Two", role: "MEMBER", membersCount: 4 },
    ];
    localStorage.setItem("pc:last-club:v1:other-user", "club-1");
    await act(async () => {
      root.render(<Home />);
    });
    expect(mocks.replace).not.toHaveBeenCalled();
    localStorage.setItem("pc:last-club:v1:viewer-1", "club-2");
    mocks.useSearchParams.mockReturnValue(new URLSearchParams());
    await act(async () => {
      root.render(<Home />);
    });
    expect(mocks.replace).toHaveBeenCalledWith("/club/club-2");
    mocks.replace.mockClear();
    localStorage.setItem("pc:last-club:v1:viewer-1", "removed-club");
    mocks.useSearchParams.mockReturnValue(new URLSearchParams());
    await act(async () => {
      root.render(<Home />);
    });
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
