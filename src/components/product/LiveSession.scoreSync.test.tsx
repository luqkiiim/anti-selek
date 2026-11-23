// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Match, SessionData } from "@/components/session/sessionTypes";
import {
  PartnerPreference, PlayerGender, SessionCrossoverFrequency, SessionMode, SessionPool,
} from "@/types/enums";
import LiveSession from "./LiveSession";

vi.mock("./Pager", () => ({
  Pager: ({ children, active }: { children: (tab: string) => ReactNode; active: string }) => children(active),
}));
vi.mock("./Primitives", async (importOriginal) => ({
  ...await importOriginal<typeof import("./Primitives")>(),
  Sheet: ({ open, title, children }: { open?: boolean; title: string; children: ReactNode }) =>
    open ? <div role="dialog" aria-label={title}>{children}</div> : null,
}));

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function session(): SessionData {
  const people = ["a", "b", "c", "d"].map((id) => ({ id, name: `Player ${id}` }));
  const match: Match = {
    id: "match-1", status: "IN_PROGRESS", team1Score: 0, team2Score: 0, scoreRevision: 0,
    team1User1: people[0], team1User2: people[1], team2User1: people[2], team2User2: people[3],
  };
  return {
    id: "session-1", code: "SCORE1", name: "Score sync", type: "OPEN", mode: SessionMode.MEXICANO,
    status: "ACTIVE", isTest: true, resultsRevision: 0, autoQueueEnabled: false,
    respectPlayerRest: true, poolsEnabled: false, poolACourtAssignments: 0, poolBCourtAssignments: 0,
    poolAMissedTurns: 0, poolBMissedTurns: 0, crossoverMissThreshold: 0,
    crossoverFrequency: SessionCrossoverFrequency.BALANCED, viewerCanManage: true, viewerIsQuickAccess: false,
    courts: [{ id: "court-1", courtNumber: 1, currentMatch: match }], matches: [],
    players: people.map((user) => ({
      userId: user.id, user: { ...user, elo: 1000 }, sessionPoints: 0, isPaused: false, isGuest: false,
      gender: PlayerGender.UNSPECIFIED, partnerPreference: PartnerPreference.OPEN, pool: SessionPool.A,
    })),
  };
}

function enter(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("live score saves with the real session controller", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const advance = async (milliseconds: number) => {
    await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
  };
  const clickRefresh = async () => {
    await act(async () => Array.from(container.querySelectorAll("button"))
      .find(button => button.textContent === "Refresh")!.click());
  };
  const render = async (activeTab = "Courts") => {
    await act(async () => root.render(<LiveSession code="SCORE1" activeTab={activeTab} onBack={() => {}} onEnded={async () => {}} />));
  };

  it("preloads standings, reuses them across tabs and reloads visible standings once per refresh", async () => {
    let snapshot = session();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/leaderboard")) return json({ currentLeaderboard: [] });
      if (url === "/api/sessions/SCORE1") return json(snapshot);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const sessionReads = () => fetchMock.mock.calls.filter(([url]) => url === "/api/sessions/SCORE1").length;
    const standingsReads = () => fetchMock.mock.calls.filter(([url]) => url.endsWith("/leaderboard")).length;
    await render();
    await advance(120_000);
    expect(sessionReads()).toBe(1);
    expect(standingsReads()).toBe(1);
    await render("Players");
    await render("Courts");
    await render("Standings");
    expect(standingsReads()).toBe(1);
    snapshot = { ...snapshot, resultsRevision: 2 };
    await clickRefresh();
    expect(sessionReads()).toBe(2);
    expect(standingsReads()).toBe(2);
    await clickRefresh();
    expect(standingsReads()).toBe(3);
    await render("Courts");
    await clickRefresh();
    expect(standingsReads()).toBe(3);
    snapshot = { ...snapshot, resultsRevision: 3 };
    await clickRefresh();
    expect(standingsReads()).toBe(4);
    await render("Standings");
    expect(standingsReads()).toBe(4);
  });

  it("keeps Courts usable during a slow preload and shares the pending request across tabs", async () => {
    let resolveStandings!: (response: Response) => void;
    const pending = new Promise<Response>(resolve => { resolveStandings = resolve; });
    const fetchMock = vi.fn((url: string) => url.endsWith("/leaderboard")
      ? pending : Promise.resolve(json(session())));
    vi.stubGlobal("fetch", fetchMock);
    await render();
    expect(container.querySelector('input[aria-label="Team 1 score"]')).not.toBeNull();
    await render("Standings");
    await render("Courts");
    await render("Standings");
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/leaderboard"))).toHaveLength(1);
    await act(async () => resolveStandings(json({ currentLeaderboard: [{ userId: "a", name: "Player a", sessionPoints: 0 }] })));
    expect(container.querySelector('table[aria-label="Player standings"]')?.textContent).toContain("Player a");
  });

  it("checks a shared score every 30 seconds only on visible Courts and coalesces wake events", async () => {
    const snapshot = session();
    snapshot.viewerCanManage = false;
    snapshot.viewerPlayerId = "a";
    snapshot.courts[0].currentMatch!.team2User1.isClaimed = true;
    const visible = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const fetchMock = vi.fn(async (url: string) => url.endsWith("/leaderboard")
      ? json({ currentLeaderboard: [] }) : json(snapshot));
    const sessionReads = () => fetchMock.mock.calls.filter(([url]) => url === "/api/sessions/SCORE1").length;
    vi.stubGlobal("fetch", fetchMock);
    try {
      await render();
      await act(async () => { window.dispatchEvent(new Event("focus")); });
      expect(sessionReads()).toBe(1);
      await advance(29_999);
      expect(sessionReads()).toBe(1);
      await advance(1);
      expect(sessionReads()).toBe(2);
      await advance(30_000);
      expect(sessionReads()).toBe(3);
      visible.mockReturnValue("hidden");
      await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
      await advance(90_000);
      expect(sessionReads()).toBe(3);
      visible.mockReturnValue("visible");
      for (const event of ["visibilitychange", "focus", "online"]) {
        await act(async () => { (event === "visibilitychange" ? document : window).dispatchEvent(new Event(event)); });
      }
      expect(sessionReads()).toBe(4);
      await render("Players");
      await advance(90_000);
      expect(sessionReads()).toBe(4);
    } finally {
      visible.mockRestore();
    }
  });

  it("keeps the draft and last success on a rate limit, then refreshes the same snapshot after cooldown", async () => {
    vi.setSystemTime(new Date(2026, 10, 7, 20, 41));
    const snapshot = session();
    const sessionFetch = vi.fn()
      .mockResolvedValueOnce(json(snapshot))
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "Retry-After": "120" } }))
      .mockResolvedValueOnce(json(snapshot));
    const fetchMock = vi.fn((url: string) => url.endsWith("/leaderboard")
      ? Promise.resolve(json({ currentLeaderboard: [] })) : sessionFetch());
    vi.stubGlobal("fetch", fetchMock);
    await render();
    const input = () => container.querySelector<HTMLInputElement>('input[aria-label="Team 1 score"]')!;
    await act(async () => enter(input(), "12"));
    const timestamp = () => container.querySelector(".session-refresh small")?.textContent;
    const initial = timestamp();
    expect(initial).toContain("Updated at");
    await advance(60_000);
    await clickRefresh();
    expect(container.textContent).toContain("Couldn’t refresh. Try again.");
    expect(timestamp()).toBe(initial);
    expect(input().value).toBe("12");
    await clickRefresh();
    expect(sessionFetch).toHaveBeenCalledTimes(2);
    await advance(120_000);
    await clickRefresh();
    expect(timestamp()).not.toBe(initial);
    expect(container.textContent).not.toContain("Couldn’t refresh");
    expect(input().value).toBe("12");
  });

  it("pauses the mounted parent while history is open and refreshes on return", async () => {
    const snapshot = session();
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/sessions/SCORE1") return json(snapshot);
      if (url.endsWith("/leaderboard")) return json({ currentLeaderboard: [] });
      if (url.endsWith("/history")) return json({ session: { code: snapshot.code, name: snapshot.name, status: "ACTIVE", createdAt: "2026-10-01T00:00:00Z" }, matches: [] });
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<LiveSession code="SCORE1" onBack={() => {}} onEnded={async () => {}} />));
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="More options"]')!.click());
    await act(async () => Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Match history")!.click());
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/sessions/SCORE1")).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/history"))).toHaveLength(1);
    await clickRefresh();
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith("/history"))).toHaveLength(2);
    await act(async () => container.querySelector<HTMLButtonElement>('button[aria-label="Back to session"]')!.click());
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/sessions/SCORE1")).toHaveLength(2);
  });

  it.each(["COMPLETED", "PENDING_APPROVAL"])("keeps a saved %s score when a subsequent refresh returns the previous match revision", async (status) => {
    const initial = session();
    const saved = {
      id: "match-1", status, scoreRevision: 1, team1Score: 21, team2Score: 18, winnerTeam: 1,
      completedAt: "2026-10-27T16:00:00.000Z", courtId: "court-1",
      team1User1Id: "a", team1User2Id: "b", team2User1Id: "c", team2User2Id: "d",
    };
    const fresh = {
      ...initial, resultsRevision: 1, matches: [saved],
      courts: [{ ...initial.courts[0], currentMatch: status === "COMPLETED" ? null : { ...initial.courts[0].currentMatch!, ...saved } }],
    };
    let nextSnapshot: unknown = fresh;
    let reads = 0;
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/score") && options?.method === "POST") return json(saved);
      if (url.endsWith("/leaderboard")) return json({ currentLeaderboard: [] });
      if (url === "/api/sessions/SCORE1") return json(++reads <= 2 ? initial : nextSnapshot);
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<LiveSession code="SCORE1" onBack={() => {}} onEnded={async () => {}} />));
    const inputs = container.querySelectorAll<HTMLInputElement>('.court-card input[aria-label$="score"]');
    expect(inputs).toHaveLength(2);
    await act(async () => enter(inputs[0], "21"));
    await act(async () => enter(inputs[1], "18"));
    await act(async () => container.querySelector<HTMLButtonElement>(".court-card .primary")!.click());
    await act(async () => container.querySelector<HTMLButtonElement>(".court-card .primary")!.click());
    expect(reads).toBe(2);

    function expectSaved() {
      expect(container.querySelector("[data-incoming-match]")).toBeNull();
      expect(container.querySelector(".court-handoff-status")?.textContent).toBe("");
      expect(container.textContent).not.toContain("Save score");
      if (status === "COMPLETED") expect(container.querySelector(".court-card input")).toBeNull();
      else {
        expect(container.textContent).toContain("Waiting for score approval");
        expect(Array.from(container.querySelectorAll(".score-placeholder")).map(score => score.textContent)).toEqual(["21", "18"]);
      }
    }
    expectSaved();
    await clickRefresh();
    expect(reads).toBe(3);
    expectSaved();
    expect(fetchMock.mock.calls.filter(([url, options]) => url.endsWith("/score") && options?.method === "POST")).toHaveLength(1);

    // A genuine reopen or replacement match must still reach the screen.
    nextSnapshot = {
      ...initial, resultsRevision: 2,
      courts: [{ ...initial.courts[0], currentMatch: {
        ...initial.courts[0].currentMatch!,
        id: status === "COMPLETED" ? "replacement-match" : "match-1",
        scoreRevision: status === "COMPLETED" ? 0 : 2,
      } }],
    };
    await clickRefresh();
    expect(container.textContent).toContain("Save score");
    expect(Array.from(container.querySelectorAll<HTMLInputElement>('.court-card input[aria-label$="score"]')).map(input => input.value)).toEqual(["", ""]);
  });

  it.each([
    { action: "Approve score", route: "approve", crossCourt: true, score: "21–18" },
    { action: "Finish match", route: "score", crossCourt: false, score: "2–1" },
  ])("shows the next-match handoff after $action with a slow refresh", async ({ action, route, crossCourt, score }) => {
    const initial = session();
    const match = initial.courts[0].currentMatch!;
    const games = '[{"team1Score":21,"team2Score":18},{"team1Score":19,"team2Score":21},{"team1Score":21,"team2Score":17}]';
    if (crossCourt) {
      match.status = "PENDING_APPROVAL";
      initial.courts.push({ id: "court-2", courtNumber: 2, label: "East Court", currentMatch: null });
    } else {
      match.scoringFormat = "BEST_OF_THREE";
      match.gameScoresJson = games;
    }
    const people = ["e", "f", "g", "h"].map(id => ({ id, name: `Player ${id}` }));
    const lineup = { team1User1: people[0], team1User2: people[1], team2User1: people[2], team2User2: people[3] };
    initial.queuedMatch = { id: "queue-1", ...lineup };
    const destinationId = crossCourt ? "court-2" : "court-1";
    const incoming = { id: "match-2", status: "IN_PROGRESS", courtId: destinationId, ...lineup };
    const saved = {
      id: match.id, status: "COMPLETED", scoreRevision: 1, winnerTeam: 1,
      team1Score: crossCourt ? 21 : 61, team2Score: crossCourt ? 18 : 56,
      scoringFormat: match.scoringFormat, gameScoresJson: match.gameScoresJson,
      team1User1Id: "a", team1User2Id: "b", team2User1Id: "c", team2User2Id: "d",
      courtId: "court-1",
    };
    const fresh = {
      ...initial, resultsRevision: 1, matches: [saved], queuedMatch: null,
      courts: initial.courts.map(court => ({
        ...court, currentMatch: court.id === destinationId ? incoming : null,
      })),
    };
    let reads = 0;
    let finishRefresh: (() => void) | undefined;
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/" + route) && options?.method === "POST") {
        return json({ ...saved, queuedMatch: null, autoAssignedMatch: incoming });
      }
      if (url.endsWith("/leaderboard")) return json({ currentLeaderboard: [] });
      if (url === "/api/sessions/SCORE1") {
        if (++reads === 1) return json(initial);
        return new Promise<Response>(resolve => { finishRefresh = () => resolve(json(fresh)); });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    await render();
    const submit = Array.from(container.querySelectorAll("button")).find(button => button.textContent === action);
    expect(submit).toBeTruthy();
    await act(async () => submit!.click());
    expect(finishRefresh).toBeDefined();

    const source = container.querySelectorAll(".court-card")[0];
    const message = `${score} saved · ${crossCourt ? "Next match on East Court" : "Next match started"}`;
    expect(source.querySelector('[role="status"]')?.textContent).toBe(message);
    const destination = container.querySelector('[data-incoming-match="match-2"]');
    expect(destination?.querySelector("h3")?.textContent).toBe(crossCourt ? "East Court" : "Court 1");
    expect(destination?.textContent).toContain("Player e");
    expect(destination?.querySelector<HTMLInputElement>('input[aria-label="Team 1 score"]')?.disabled).toBe(false);
    expect(container.querySelector(".next-up")).toBeNull();

    const highlight = destination?.querySelector(".court-handoff-highlight");
    expect(highlight).toBeTruthy();
    await advance(1000);
    await act(async () => finishRefresh!());
    expect(container.querySelector(".court-handoff-highlight")).toBe(highlight);
    await advance(2999);
    expect(source.querySelector('[role="status"]')?.textContent).toBe(message);
    await advance(1);
    expect(source.querySelector('[role="status"]')?.textContent).toBe("");
    expect(container.querySelector(".court-handoff-highlight")).toBeNull();
  });

  it("refreshes a single-club score conflict without requiring the app to restart", async () => {
    const initial = session();
    let reads = 0;
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/score") && options?.method === "POST") return json({ error: "This score changed. Refresh before saving." }, 409);
      if (url.endsWith("/leaderboard")) return json({ currentLeaderboard: [] });
      if (url === "/api/sessions/SCORE1") {
        reads++;
        return json(reads === 1 ? initial : { ...initial, resultsRevision: 1, courts: [{ ...initial.courts[0], currentMatch: null }] });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));
    await act(async () => root.render(<LiveSession code="SCORE1" onBack={() => {}} onEnded={async () => {}} />));
    const inputs = container.querySelectorAll<HTMLInputElement>('.court-card input[aria-label$="score"]');
    await act(async () => enter(inputs[0], "21"));
    await act(async () => enter(inputs[1], "18"));
    await act(async () => container.querySelector<HTMLButtonElement>(".court-card .primary")!.click());
    await act(async () => container.querySelector<HTMLButtonElement>(".court-card .primary")!.click());
    expect(reads).toBe(2);
    expect(container.querySelector(".court-card input")).toBeNull();
  });

  async function confirmReset() {
    const click = async (label: string) => {
      const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
        .find(button => button.textContent === label || button.getAttribute("aria-label") === label);
      expect(button, label).toBeTruthy();
      await act(async () => button!.click());
    };
    await click("More options");
    await click("Session settings");
    await click("Reset session to change setup");
    await click("Reset session");
  }

  it.each(["pending", "stale", "failed"])("shows an accepted reset immediately when follow-up reads are %s", async (readState) => {
    const initial = session();
    initial.resultsRevision = 5;
    initial.players[0].sessionPoints = 3;
    const reset = {
      ...initial, status: "WAITING", resultsRevision: 6,
      courts: [{ ...initial.courts[0], currentMatch: null }], matches: [], queuedMatch: null,
      players: initial.players.map(player => ({ ...player, sessionPoints: 0 })),
    };
    let resolveRead!: (response: Response) => void;
    const pendingRead = new Promise<Response>(resolve => { resolveRead = resolve; });
    let resetAccepted = false;
    let restarted = false;
    const snapshots: SessionData[] = [];
    const fetchMock = vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/reset") && options?.method === "POST") {
        resetAccepted = true;
        return json(reset);
      }
      if (url.endsWith("/start") && options?.method === "POST") {
        restarted = true;
        return json({ ...reset, status: "ACTIVE" });
      }
      if (url.endsWith("/leaderboard")) {
        if (resetAccepted && !restarted && readState === "failed") return json({ error: "Standings unavailable" }, 503);
        return json({ currentLeaderboard: [] });
      }
      if (url === "/api/sessions/SCORE1") {
        if (restarted) return json({ ...reset, status: "ACTIVE" });
        if (!resetAccepted) return json(initial);
        if (readState === "pending") return pendingRead;
        if (readState === "failed") return json({ error: "Session refresh unavailable" }, 503);
        return json(initial);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => root.render(<LiveSession code="SCORE1" onBack={() => {}} onEnded={async () => {}} onSessionData={data => snapshots.push(data)} />));
    await confirmReset();

    const expectReset = () => {
      expect(container.textContent).toContain("Not started");
      expect(container.querySelector('[role="dialog"]')).toBeNull();
      const start = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(button => button.textContent === "Start session");
      expect(start).toBeTruthy();
      expect(start!.disabled).toBe(false);
      expect(snapshots.at(-1)).toMatchObject({ status: "WAITING", resultsRevision: 6, matches: [], queuedMatch: null });
      expect(snapshots.at(-1)!.courts[0].currentMatch).toBeNull();
      expect(snapshots.at(-1)!.players[0].sessionPoints).toBe(0);
    };
    expect(resetAccepted).toBe(true);
    expectReset();
    if (readState === "pending") await act(async () => resolveRead(json(initial)));
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expectReset();
    expect(fetchMock.mock.calls.filter(([url, options]) => url.endsWith("/reset") && options?.method === "POST")).toHaveLength(1);
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find(button => button.textContent === "Start session")!.click());
    expect(container.textContent).toContain("Live session");
    expect(container.textContent).not.toContain("Not started");
    expect(snapshots.at(-1)).toMatchObject({ status: "ACTIVE", resultsRevision: 6, matches: [] });
    expect(snapshots.at(-1)!.players[0].sessionPoints).toBe(0);
  });

  it("keeps the active session intact when reset is rejected", async () => {
    const initial = session();
    initial.players[0].sessionPoints = 3;
    const snapshots: SessionData[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith("/reset") && options?.method === "POST") return json({ error: "Reset permission changed" }, 409);
      if (url.endsWith("/leaderboard")) return json({ currentLeaderboard: [] });
      if (url === "/api/sessions/SCORE1") return json(initial);
      throw new Error(`Unexpected request: ${url}`);
    }));
    await act(async () => root.render(<LiveSession code="SCORE1" onBack={() => {}} onEnded={async () => {}} onSessionData={data => snapshots.push(data)} />));
    await confirmReset();
    expect(container.textContent).toContain("Reset permission changed");
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(snapshots.at(-1)!.status).toBe("ACTIVE");
    expect(snapshots.at(-1)!.players[0].sessionPoints).toBe(3);
    expect(snapshots.at(-1)!.courts[0].currentMatch?.id).toBe("match-1");
  });
});
