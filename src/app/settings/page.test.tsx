// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteUserAvatar: vi.fn(),
  fetch: vi.fn(),
  router: {
    push: vi.fn(),
    refresh: vi.fn(),
  },
  updateSession: vi.fn(),
  uploadUserAvatar: vi.fn(),
  useSession: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: mocks.useSession,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
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

vi.mock("@/components/ui/AvatarUploader", () => ({
  AvatarUploader: () => <div data-testid="avatar-uploader">Avatar uploader</div>,
}));

vi.mock("@/lib/avatarClient", () => ({
  deleteUserAvatar: mocks.deleteUserAvatar,
  uploadUserAvatar: mocks.uploadUserAvatar,
}));

import SettingsPage from "./page";

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function buildCurrentUser(overrides?: Partial<{
  avatarUrl: string | null;
  canRenameName: boolean;
  id: string;
  isClaimed: boolean;
  isQuickAccess: boolean;
  name: string;
  selfNameChangedAt: string | null;
}>) {
  return {
    id: "user-1",
    name: "Owner",
    avatarUrl: null,
    isClaimed: true,
    isQuickAccess: false,
    selfNameChangedAt: null,
    canRenameName: true,
    ...overrides,
  };
}

describe("settings page", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
        fetch: typeof fetch;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.fetch = mocks.fetch;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    mocks.useSession.mockReturnValue({
      data: {
        user: {
          id: "user-1",
          name: "Owner",
        },
      },
      status: "authenticated",
      update: mocks.updateSession,
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
  });

  async function renderPage(userOverrides?: Parameters<typeof buildCurrentUser>[0]) {
    mocks.fetch.mockResolvedValueOnce(
      createJsonResponse({
        user: buildCurrentUser(userOverrides),
      })
    );

    await act(async () => {
      root.render(<SettingsPage />);
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("shows an editable rename form before the one-time rename is used", async () => {
    await renderPage();

    const input = container.querySelector("#player-name") as HTMLInputElement;
    const button = Array.from(container.querySelectorAll("button")).find((node) =>
      node.textContent?.includes("Save player name")
    ) as HTMLButtonElement | undefined;

    expect(container.textContent).toContain(
      "You can only change your player name once"
    );
    expect(input.disabled).toBe(false);
    expect(button?.disabled).toBe(true);
  });

  it("shows a locked rename state after the one-time rename has been used", async () => {
    await renderPage({
      canRenameName: false,
      selfNameChangedAt: "2026-05-22T10:15:00.000Z",
    });

    const input = container.querySelector("#player-name") as HTMLInputElement;

    expect(container.textContent).toContain("Rename used");
    expect(container.textContent).toContain("Your one-time rename was used on");
    expect(input.disabled).toBe(true);
  });
});
