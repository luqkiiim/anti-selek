// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MatchStatus, SessionStatus, SessionType } from "@/types/enums";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  router: {
    back: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  },
  useSession: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  useSession: mocks.useSession,
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ code: "ABC123" }),
  useRouter: () => mocks.router,
  useSearchParams: () => ({
    get: vi.fn(() => null),
  }),
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

import SessionHistoryPage from "./page";

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function createHistoryData(overrides: Record<string, unknown> = {}) {
  return {
    session: {
      id: "session-1",
      code: "ABC123",
      clubId: "club-1",
      name: "Friday Night",
      status: SessionStatus.ACTIVE,
      isTest: false,
      type: SessionType.POINTS,
      mode: "MEXICANO",
      createdAt: "2026-07-02T10:00:00.000Z",
      endedAt: null,
    },
    viewerCanManage: true,
    canCorrectCompletedScores: true,
    correctionBlockedReason: null,
    undoableMatchId: "match-1",
    matches: [
      {
        id: "match-1",
        status: MatchStatus.COMPLETED,
        createdAt: "2026-07-02T10:15:00.000Z",
        completedAt: "2026-07-02T10:25:00.000Z",
        winnerTeam: 1,
        team1Score: 21,
        team2Score: 18,
        court: { courtNumber: 1, label: null },
        team1User1: { id: "a1", name: "Aiman" },
        team1User2: { id: "a2", name: "Ben" },
        team2User1: { id: "b1", name: "Cara" },
        team2User2: { id: "b2", name: "Dan" },
      },
      {
        id: "match-2",
        status: MatchStatus.COMPLETED,
        createdAt: "2026-07-02T10:35:00.000Z",
        completedAt: "2026-07-02T10:45:00.000Z",
        winnerTeam: 2,
        team1Score: 17,
        team2Score: 21,
        court: { courtNumber: 2, label: null },
        team1User1: { id: "a3", name: "Erin" },
        team1User2: { id: "a4", name: "Finn" },
        team2User1: { id: "b3", name: "Gray" },
        team2User2: { id: "b4", name: "Hale" },
      },
    ],
    ...overrides,
  };
}

function getButtons(container: HTMLElement) {
  return Array.from(container.querySelectorAll("button"));
}

function getButtonByLabel(container: HTMLElement, label: string) {
  const button = getButtons(container).find(
    (node) => node.getAttribute("aria-label") === label
  );

  expect(button).toBeTruthy();
  return button as HTMLButtonElement;
}

function hasExactButtonText(container: HTMLElement, text: string) {
  return getButtons(container).some((button) => button.textContent?.trim() === text);
}

describe("SessionHistoryPage match admin actions", () => {
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
          id: "admin-1",
          name: "Admin",
        },
      },
      status: "authenticated",
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
  });

  async function renderPage(historyData = createHistoryData()) {
    mocks.fetch.mockResolvedValueOnce(createJsonResponse(historyData));

    await act(async () => {
      root.render(<SessionHistoryPage />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("hides inline score correction and reveals it from the match action menu", async () => {
    await renderPage();

    expect(hasExactButtonText(container, "Correct score")).toBe(false);
    expect(hasExactButtonText(container, "Undo result")).toBe(false);

    const menuButton = getButtonByLabel(container, "Open actions for Court 1");
    await act(async () => {
      menuButton.click();
    });

    expect(hasExactButtonText(container, "Correct score")).toBe(true);
    expect(hasExactButtonText(container, "Undo result")).toBe(true);
  });

  it("shows undo only for the undoable completed match", async () => {
    await renderPage();

    const menuButton = getButtonByLabel(container, "Open actions for Court 2");
    await act(async () => {
      menuButton.click();
    });

    expect(hasExactButtonText(container, "Correct score")).toBe(true);
    expect(hasExactButtonText(container, "Undo result")).toBe(false);
  });

  it("does not render the action menu when no admin action is available", async () => {
    await renderPage(
      createHistoryData({
        viewerCanManage: false,
        canCorrectCompletedScores: false,
        undoableMatchId: null,
      })
    );

    expect(container.querySelector('[aria-haspopup="menu"]')).toBeNull();
    expect(hasExactButtonText(container, "Correct score")).toBe(false);
    expect(hasExactButtonText(container, "Undo result")).toBe(false);
  });

  it("opens the existing correction and undo modals from menu actions", async () => {
    await renderPage();

    await act(async () => {
      getButtonByLabel(container, "Open actions for Court 1").click();
    });
    const correctAction = getButtons(container).find(
      (button) => button.textContent?.trim() === "Correct score"
    ) as HTMLButtonElement;

    await act(async () => {
      correctAction.click();
    });

    expect(document.body.textContent).toContain("Correct score?");

    const cancelButton = getButtons(document.body).find(
      (button) => button.textContent?.trim() === "Keep Result"
    ) as HTMLButtonElement;
    await act(async () => {
      cancelButton.click();
    });

    await act(async () => {
      getButtonByLabel(container, "Open actions for Court 1").click();
    });
    const undoAction = getButtons(container).find(
      (button) => button.textContent?.trim() === "Undo result"
    ) as HTMLButtonElement;

    await act(async () => {
      undoAction.click();
    });

    expect(document.body.textContent).toContain("Undo result?");
  });
});
