// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.mock("./Primitives", () => ({
  ErrorText: ({ error }: { error: string }) =>
    error ? <p role="alert">{error}</p> : null,
  Sheet: ({
    title,
    children,
    onClose,
  }: {
    title: string;
    children: React.ReactNode;
    onClose: () => void;
  }) => (
    <div role="dialog" aria-label={title}>
      {children}
      <button type="button" onClick={onClose}>
        Dismiss sheet
      </button>
    </div>
  ),
}));

import SessionMatchHistory from "./SessionMatchHistory";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function historyData(
  overrides: Record<string, unknown> = {},
  matchOverrides: Record<string, unknown> = {},
) {
  return {
    session: {
      code: "ABC123",
      name: "Saturday finals",
      status: "COMPLETED",
      createdAt: "2026-07-02T10:00:00.000Z",
      endedAt: "2026-07-02T12:00:00.000Z",
    },
    viewerCanManage: false,
    canCorrectCompletedScores: false,
    correctionBlockedReason: null,
    undoableMatchId: null,
    matches: [
      {
        id: "match-1",
        status: "COMPLETED",
        createdAt: "2026-07-02T10:15:00.000Z",
        completedAt: "2026-07-02T10:25:00.000Z",
        winnerTeam: 1,
        team1Score: 21,
        team2Score: 18,
        court: { courtNumber: 4, label: null },
        team1User1: { id: "a1", name: "Aiman" },
        team1User2: { id: "a2", name: "Ben" },
        team2User1: { id: "b1", name: "Cara" },
        team2User2: { id: "b2", name: "Dan" },
        ...matchOverrides,
      },
    ],
    ...overrides,
  };
}

describe("SessionMatchHistory", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.fetch = fetchMock;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
  });

  async function render(data = historyData(), props: { onMutated?: () => void } = {}) {
    fetchMock.mockResolvedValueOnce(jsonResponse(data));
    await act(async () => {
      root.render(<SessionMatchHistory code="ABC123" {...props} />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("shows a completed chronological recap to read-only viewers", async () => {
    await render();

    expect(container.textContent).toContain("Saturday finals");
    expect(container.textContent).toContain("Court 4");
    expect(container.textContent).toContain("Aiman");
    expect(container.textContent).toContain("Ben");
    expect(container.textContent).toContain("Cara");
    expect(container.textContent).toContain("Dan");
    expect(container.textContent).toContain("21");
    expect(container.textContent).toContain("18");
    expect(container.textContent).toContain("Winner");
    expect(container.querySelector('time[datetime="2026-07-02T10:25:00.000Z"]'))
      .not.toBeNull();
    expect(container.textContent).not.toContain("Correct score");
    expect(container.textContent).not.toContain("Undo result");
  });

  it("offers undo only for the match enabled by the history API", async () => {
    await render(
      historyData(
        { viewerCanManage: true, undoableMatchId: "match-1" },
        { status: "COMPLETED" },
      ),
    );
    expect(container.textContent).toContain("Undo result");
    expect(container.textContent).not.toContain("Correct score");
  });

  it("confirms an undo before posting and refreshes the recap", async () => {
    const onMutated = vi.fn();
    const liveHistory = historyData({
      session: {
        code: "ABC123",
        name: "Saturday session",
        status: "ACTIVE",
        createdAt: "2026-07-02T10:00:00.000Z",
        endedAt: null,
      },
      viewerCanManage: true,
      undoableMatchId: "match-1",
    });
    await render(liveHistory, { onMutated });

    const undoAction = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Undo result",
    );
    await act(async () => undoAction?.click());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain(
      "reverses its standings impact",
    );

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    fetchMock.mockResolvedValueOnce(jsonResponse(liveHistory));
    const confirmButton = Array.from(container.querySelectorAll("button"))
      .filter((button) => button.textContent?.trim() === "Undo result")
      .at(-1);
    await act(async () => {
      confirmButton?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/matches/match-1/undo");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
    expect(container.textContent).toContain("Result undone.");
    expect(onMutated).toHaveBeenCalledOnce();
  });

  it("lets a host approve a pending result after confirmation", async () => {
    const onMutated = vi.fn();
    const pendingHistory = historyData(
      { viewerCanManage: true },
      { status: "PENDING_APPROVAL", winnerTeam: null },
    );
    await render(pendingHistory, { onMutated });
    const approveAction = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Approve result",
    );
    expect(approveAction).toBeTruthy();
    await act(async () => approveAction?.click());
    expect(container.querySelector('[role="dialog"]')?.textContent).toContain("Confirm these scores");

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    fetchMock.mockResolvedValueOnce(jsonResponse(pendingHistory));
    const confirmButton = Array.from(container.querySelectorAll("button"))
      .filter((button) => button.textContent?.trim() === "Approve result")
      .at(-1);
    await act(async () => {
      confirmButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/matches/match-1/approve");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "POST" });
    expect(container.textContent).toContain("Result approved.");
    expect(onMutated).toHaveBeenCalledOnce();
  });

  it("posts corrections and refreshes after the API permits score correction", async () => {
    const onMutated = vi.fn();
    await render(
      historyData({ canCorrectCompletedScores: true }),
      { onMutated },
    );
    const correctionButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Correct score",
    );
    expect(correctionButton).toBeTruthy();

    await act(async () => correctionButton?.click());
    const teamAScore = container.querySelector<HTMLInputElement>(
      '[aria-label="Team A corrected score"]',
    );
    expect(teamAScore).toBeTruthy();
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(teamAScore, "20");
      teamAScore?.dispatchEvent(new Event("input", { bubbles: true }));
      teamAScore?.dispatchEvent(new Event("change", { bubbles: true }));
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }));
    fetchMock.mockResolvedValueOnce(jsonResponse(historyData({ canCorrectCompletedScores: true })));
    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Save correction",
    );
    await act(async () => {
      saveButton?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const correctionCall = fetchMock.mock.calls.find(
      ([url]) => url === "/api/matches/match-1/correction",
    );
    expect(correctionCall?.[1]).toMatchObject({
      method: "POST",
      body: JSON.stringify({ team1Score: 20, team2Score: 18 }),
    });
    expect(container.textContent).toContain("Score corrected.");
    expect(onMutated).toHaveBeenCalledOnce();
  });
});
