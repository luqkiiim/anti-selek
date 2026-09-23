// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Match, SessionData } from "@/components/session/sessionTypes";
import {
  PartnerPreference,
  PlayerGender,
  SessionBalanceMetric,
  SessionCrossoverFrequency,
  SessionMatchmakingStyle,
  SessionMode,
  SessionPairingMode,
  SessionPool,
} from "@/types/enums";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  useResource: vi.fn(),
  useAction: vi.fn(),
  session: null as SessionData | null,
  sessionResource: null as { data: SessionData | null; error: string; refresh: ReturnType<typeof vi.fn> } | null,
  standingsResource: null as { data: { currentLeaderboard: Array<{ userId: string; name: string; sessionPoints: number }> }; error: string; refresh: ReturnType<typeof vi.fn> } | null,
}));

vi.mock("next/image", () => ({ default: ({ alt }: { alt: string }) => <span role="img" aria-label={alt} /> }));
vi.mock("./api", () => ({
  api: mocks.api,
  useResource: mocks.useResource,
  useAction: mocks.useAction,
}));
vi.mock("./Pager", () => ({
  Pager: ({
    children,
    active,
    pages,
    onChange,
  }: {
    children: (tab: string) => React.ReactNode;
    active: string;
    pages: string[];
    onChange: (tab: string) => void;
  }) => <>
    <nav aria-label="Session tabs">
      {pages.map((page) => <button key={page} onClick={() => onChange(page)}>{page}</button>)}
    </nav>
    <div>{children(active)}</div>
  </>,
}));
vi.mock("./Primitives", () => ({
  Avatar: ({ name, url }: { name: string; url?: string | null }) => <span role="img" aria-label={name}>{url ? "" : name.slice(0, 1)}</span>,
  ErrorText: ({ error }: { error: string }) => error ? <p role="alert">{error}</p> : null,
  Row: ({ title, onClick }: { title: string; onClick: () => void }) => <button onClick={onClick}>{title}</button>,
  Sheet: ({ open, title, children }: { open?: boolean; title: string; children: React.ReactNode }) => open ? <div role="dialog" aria-label={title}>{children}</div> : null,
}));

import LiveSession from "./LiveSession";

type TestPlayer = SessionData["players"][number];

function player(id: string, name: string, isPaused = false): TestPlayer {
  return {
    userId: id,
    sessionPoints: 0,
    isPaused,
    isGuest: false,
    gender: PlayerGender.UNSPECIFIED,
    partnerPreference: PartnerPreference.OPEN,
    pool: SessionPool.A,
    needsMoreRest: false,
    user: { id, name, avatarUrl: null, elo: 1000 },
  };
}

function match(id: string, courtNumber: number, team1Score = 0, team2Score = 0): Match {
  return {
    id,
    status: "IN_PROGRESS",
    team1Score,
    team2Score,
    team1User1: { id: `${id}-a`, name: `Score Player ${courtNumber}A`, avatarUrl: null },
    team1User2: { id: `${id}-b`, name: `Score Player ${courtNumber}B`, avatarUrl: null },
    team2User1: { id: `${id}-c`, name: `Score Player ${courtNumber}C`, avatarUrl: null },
    team2User2: { id: `${id}-d`, name: `Score Player ${courtNumber}D`, avatarUrl: null },
  };
}

function sessionWithCourts(courts: SessionData["courts"], players = courts.flatMap((court) => court.currentMatch ? [
  player(court.currentMatch.team1User1.id, court.currentMatch.team1User1.name),
  player(court.currentMatch.team1User2.id, court.currentMatch.team1User2.name),
  player(court.currentMatch.team2User1.id, court.currentMatch.team2User1.name),
  player(court.currentMatch.team2User2.id, court.currentMatch.team2User2.name),
] : [])): SessionData {
  return {
    id: "session-1",
    code: "TEST01",
    name: "Test session",
    type: "OPEN",
    mode: SessionMode.MEXICANO,
    status: "ACTIVE",
    isTest: true,
    autoQueueEnabled: false,
    respectPlayerRest: true,
    poolsEnabled: false,
    poolACourtAssignments: 0,
    poolBCourtAssignments: 0,
    poolAMissedTurns: 0,
    poolBMissedTurns: 0,
    crossoverMissThreshold: 0,
    crossoverFrequency: SessionCrossoverFrequency.BALANCED,
    viewerCanManage: true,
    viewerIsQuickAccess: false,
    courts,
    players,
  };
}

function setup(session: SessionData) {
  mocks.session = session;
  mocks.sessionResource = { data: session, error: "", refresh: vi.fn(async () => undefined) };
  mocks.standingsResource = {
    data: { currentLeaderboard: session.players.map((p) => ({ userId: p.userId, name: p.user.name, sessionPoints: p.sessionPoints })) },
    error: "",
    refresh: vi.fn(async () => undefined),
  };
  mocks.useResource.mockImplementation((url: string) => url.endsWith("/leaderboard") ? mocks.standingsResource : mocks.sessionResource);
  mocks.useAction.mockImplementation((refresh: () => Promise<unknown>) => ({
    busy: false,
    error: "",
    setError: vi.fn(),
    run: async (action: () => Promise<unknown>, success?: () => void | Promise<void>) => {
      await action();
      await refresh();
      await success?.();
    },
  }));
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  setter?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("LiveSession score and player controls", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    mocks.api.mockReset().mockResolvedValue({});
    mocks.useResource.mockReset();
    mocks.useAction.mockReset();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  it("leaves a fresh zeroed match blank", async () => {
    const currentMatch = match("match-1", 1, 0, 0);
    setup(sessionWithCourts([{ id: "court-1", courtNumber: 1, currentMatch }]));
    await act(async () => root.render(<LiveSession code="TEST01" onBack={vi.fn()} onEnded={vi.fn(async () => undefined)} />));

    const inputs = container.querySelectorAll<HTMLInputElement>('.court-card input[aria-label$="score"]');
    expect(inputs).toHaveLength(2);
    expect(inputs[0].value).toBe("");
    expect(inputs[1].value).toBe("");
  });

  it("advances from a two-digit score on court two only", async () => {
    const first = match("match-1", 1, 0, 0);
    const second = match("match-2", 2, 0, 0);
    setup(sessionWithCourts([
      { id: "court-1", courtNumber: 1, currentMatch: first },
      { id: "court-2", courtNumber: 2, currentMatch: second },
    ]));
    await act(async () => root.render(<LiveSession code="TEST01" onBack={vi.fn()} onEnded={vi.fn(async () => undefined)} />));

    const courtTwo = container.querySelectorAll<HTMLElement>(".court-card")[1];
    const inputs = courtTwo.querySelectorAll<HTMLInputElement>('input[aria-label$="score"]');
    inputs[0].focus();
    await act(async () => setInputValue(inputs[0], "21"));
    expect(document.activeElement).toBe(inputs[1]);
    await act(async () => setInputValue(inputs[1], "9"));
    expect(inputs[1].value).toBe("9");
    expect(mocks.api).not.toHaveBeenCalled();
  });

  it("confirms a score, focuses the second confirmation field, and prefills corrections", async () => {
    const currentMatch = match("match-1", 1, 0, 0);
    const session = sessionWithCourts([{ id: "court-1", courtNumber: 1, currentMatch }]);
    setup(session);
    await act(async () => root.render(<LiveSession code="TEST01" onBack={vi.fn()} onEnded={vi.fn(async () => undefined)} />));
    const inputs = container.querySelectorAll<HTMLInputElement>('.court-card input[aria-label$="score"]');
    await act(async () => setInputValue(inputs[0], "21"));
    await act(async () => setInputValue(inputs[1], "19"));
    await act(async () => (container.querySelector(".court-card .primary") as HTMLButtonElement).click());
    const initialConfirmation = container.querySelector('[role="dialog"]') as HTMLElement;
    const initialConfirmationInputs = initialConfirmation.querySelectorAll<HTMLInputElement>("input");
    expect(initialConfirmationInputs[0].value).toBe("21");
    expect(initialConfirmationInputs[1].value).toBe("19");
    await act(async () => setInputValue(initialConfirmationInputs[0], "20"));
    expect(document.activeElement).toBe(initialConfirmationInputs[1]);
    await act(async () => Array.from(initialConfirmation.querySelectorAll("button")).find((button) => button.textContent?.includes("Confirm result"))?.click());
    expect(mocks.api).toHaveBeenCalledWith("/api/matches/match-1/score", "POST", { team1Score: 20, team2Score: 19 });

    session.courts[0].currentMatch = null;
    await act(async () => root.render(<LiveSession code="TEST01" onBack={vi.fn()} onEnded={vi.fn(async () => undefined)} />));
    await act(async () => (container.querySelector(".court-card .secondary") as HTMLButtonElement).click());
    const confirmation = container.querySelector('[role="dialog"]') as HTMLElement;
    const confirmationInputs = confirmation.querySelectorAll<HTMLInputElement>("input");
    expect(confirmationInputs[0].value).toBe("20");
    expect(confirmationInputs[1].value).toBe("19");
    await act(async () => setInputValue(confirmationInputs[0], "22"));
    expect(document.activeElement).toBe(confirmationInputs[1]);
    await act(async () => Array.from(confirmation.querySelectorAll("button")).find((button) => button.textContent?.includes("Confirm result"))?.click());
    expect(mocks.api).toHaveBeenLastCalledWith("/api/matches/match-1/correction", "POST", { team1Score: 22, team2Score: 19 });
  });

  it("keeps an active paused player on court and sends pause/resume payloads", async () => {
    const currentMatch = match("match-1", 1, 0, 0);
    const active = player(currentMatch.team1User1.id, currentMatch.team1User1.name);
    const pausedWaiting = player("waiting-paused", "Paused Waiting", true);
    const session = sessionWithCourts([{ id: "court-1", courtNumber: 1, currentMatch }], [active, pausedWaiting]);
    setup(session);
    await act(async () => root.render(<LiveSession code="TEST01" onBack={vi.fn()} onEnded={vi.fn(async () => undefined)} />));
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("nav[aria-label='Session tabs'] button")).find((button) => button.textContent === "Players")?.click());

    const pause = container.querySelector<HTMLButtonElement>('button[aria-label="Pause Score Player 1A"]');
    expect(pause).toBeTruthy();
    await act(async () => pause?.click());
    expect(mocks.api).toHaveBeenCalledWith("/api/sessions/TEST01/pause-player", "POST", { userId: active.userId, isPaused: true });

    active.isPaused = true;
    await act(async () => root.render(<LiveSession code="TEST01" onBack={vi.fn()} onEnded={vi.fn(async () => undefined)} />));
    expect(container.textContent).toContain("Pausing after game");

    const resume = container.querySelector<HTMLButtonElement>('button[aria-label="Resume Paused Waiting"]');
    expect(resume).toBeTruthy();
    await act(async () => resume?.click());
    expect(mocks.api).toHaveBeenLastCalledWith("/api/sessions/TEST01/pause-player", "POST", { userId: pausedWaiting.userId, isPaused: false });
    pausedWaiting.isPaused = false;
    await act(async () => root.render(<LiveSession code="TEST01" onBack={vi.fn()} onEnded={vi.fn(async () => undefined)} />));
    expect(container.textContent).toContain("Waiting");
  });

  it("confirms a court reshuffle before sending the existing generate-match request", async () => {
    const currentMatch = match("match-1", 1);
    setup(sessionWithCourts([{ id: "court-1", courtNumber: 1, currentMatch }]));
    await act(async () => root.render(<LiveSession code="TEST01" onBack={vi.fn()} onEnded={vi.fn(async () => undefined)} />));

    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Court 1 options"]')?.click());
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("[role=dialog] button")).find((button) => button.textContent === "Reshuffle whole match")?.click());
    expect(container.querySelector('[role="dialog"]')?.getAttribute("aria-label")).toBe("Reshuffle this match?");
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("[role=dialog] button")).find((button) => button.textContent === "Reshuffle match")?.click());

    expect(mocks.api).toHaveBeenCalledWith("/api/sessions/TEST01/generate-match", "POST", {
      courtId: "court-1",
      forceReshuffle: true,
    });
  });

  it("creates a court manual match from four selected active players", async () => {
    const session = sessionWithCourts(
      [{ id: "court-1", courtNumber: 1, currentMatch: null }],
      [player("a", "Ari"), player("b", "Bea"), player("c", "Chen"), player("d", "Dee")],
    );
    setup(session);
    await act(async () => root.render(<LiveSession code="TEST01" onBack={vi.fn()} onEnded={vi.fn(async () => undefined)} />));

    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Court 1 options"]')?.click());
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("[role=dialog] button")).find((button) => button.textContent === "Manual 2v2 match")?.click());
    for (let i = 0; i < 4; i += 1) {
      const option = container.querySelectorAll<HTMLButtonElement>(".manual-player-option")[i];
      await act(async () => option.click());
    }
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("[role=dialog] button")).find((button) => button.textContent === "Create match")?.click());

    expect(mocks.api).toHaveBeenCalledWith("/api/sessions/TEST01/generate-match", "POST", {
      courtId: "court-1",
      manualTeams: { team1: ["a", "b"], team2: ["c", "d"] },
    });
  });

  it("replaces a queued player's spot using the queue-match route", async () => {
    const queued = match("queued-1", 2);
    const session = sessionWithCourts([{ id: "court-1", courtNumber: 1, currentMatch: match("court-match", 1) }]);
    session.queuedMatch = queued;
    session.players.push(
      player(queued.team1User1.id, queued.team1User1.name),
      player(queued.team1User2.id, queued.team1User2.name),
      player(queued.team2User1.id, queued.team2User1.name),
      player(queued.team2User2.id, queued.team2User2.name),
    );
    setup(session);
    await act(async () => root.render(<LiveSession code="TEST01" onBack={vi.fn()} onEnded={vi.fn(async () => undefined)} />));

    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Next up options"]')?.click());
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("[role=dialog] button")).find((button) => button.textContent?.includes(`Replace ${queued.team1User1.name}`))?.click());

    expect(mocks.api).toHaveBeenCalledWith("/api/sessions/TEST01/queue-match", "POST", {
      replaceUserId: queued.team1User1.id,
    });
  });

  it("edits a queued lineup manually by clearing it and posting the selected teams", async () => {
    const queued = match("queued-1", 2);
    const session = sessionWithCourts([{ id: "court-1", courtNumber: 1, currentMatch: match("court-match", 1) }]);
    session.queuedMatch = queued;
    session.players.push(
      player(queued.team1User1.id, queued.team1User1.name),
      player(queued.team1User2.id, queued.team1User2.name),
      player(queued.team2User1.id, queued.team2User1.name),
      player(queued.team2User2.id, queued.team2User2.name),
    );
    setup(session);
    await act(async () => root.render(<LiveSession code="TEST01" onBack={vi.fn()} onEnded={vi.fn(async () => undefined)} />));

    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Next up options"]')?.click());
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("[role=dialog] button")).find((button) => button.textContent === "Edit manually")?.click());
    for (let i = 0; i < 4; i += 1) {
      const option = container.querySelectorAll<HTMLButtonElement>(".manual-player-option")[i];
      await act(async () => option.click());
    }
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("[role=dialog] button")).find((button) => button.textContent === "Save next match")?.click());

    expect(mocks.api).toHaveBeenNthCalledWith(1, "/api/sessions/TEST01/queue-match", "DELETE");
    expect(mocks.api).toHaveBeenNthCalledWith(2, "/api/sessions/TEST01/queue-match", "POST", {
      manualTeams: {
        team1: [queued.team1User1.id, queued.team1User2.id],
        team2: [queued.team2User1.id, queued.team2User2.id],
      },
    });
  });

  it("saves live settings through the active-session settings contract", async () => {
    const session = sessionWithCourts([
      { id: "court-1", courtNumber: 1, label: null, currentMatch: null },
      { id: "court-2", courtNumber: 2, label: "Show court", currentMatch: null },
    ]);
    setup(session);
    await act(async () => root.render(<LiveSession code="TEST01" onBack={vi.fn()} onEnded={vi.fn(async () => undefined)} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="More options"]')?.click());
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("[role=dialog] button")).find((button) => button.textContent === "Session settings")?.click());

    const courtLabel = container.querySelector<HTMLInputElement>('[aria-label="Court 1 label"]');
    expect(courtLabel).toBeTruthy();
    await act(async () => setInputValue(courtLabel!, "North"));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Prepare the next game"]')?.click());
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Respect extra rest"]')?.click());
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("[role=dialog] button")).find((button) => button.textContent === "Save settings")?.click());

    expect(mocks.api).toHaveBeenCalledWith("/api/sessions/TEST01", "PATCH", {
      autoQueueEnabled: true,
      respectPlayerRest: false,
      courtLabels: [
        { courtNumber: 1, label: "North" },
        { courtNumber: 2, label: "Show court" },
      ],
    });
  });

  it("confirms the queued-match removal before saving auto queue off", async () => {
    const session = sessionWithCourts([
      { id: "court-1", courtNumber: 1, currentMatch: null },
    ]);
    session.autoQueueEnabled = true;
    session.queuedMatch = match("queued-1", 2);
    setup(session);
    await act(async () => root.render(<LiveSession code="TEST01" onBack={vi.fn()} onEnded={vi.fn(async () => undefined)} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="More options"]')?.click());
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("[role=dialog] button")).find((button) => button.textContent === "Session settings")?.click());
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Prepare the next game"]')?.click());

    expect(container.textContent).toContain("Saving with “Prepare the next game” off will remove it.");
    expect(mocks.api).not.toHaveBeenCalled();
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("[role=dialog] button")).find((button) => button.textContent === "Turn off and clear on save")?.click());
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Prepare the next game"]')?.getAttribute("aria-checked")).toBe("false");
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("[role=dialog] button")).find((button) => button.textContent === "Save settings")?.click());

    expect(mocks.api).toHaveBeenCalledWith("/api/sessions/TEST01", "PATCH", {
      autoQueueEnabled: false,
      respectPlayerRest: true,
      courtLabels: [{ courtNumber: 1, label: null }],
    });
  });

  it("keeps unsaved court-label edits when the session poll refreshes", async () => {
    const session = sessionWithCourts([
      { id: "court-1", courtNumber: 1, label: null, currentMatch: null },
    ]);
    setup(session);
    await act(async () => root.render(<LiveSession code="TEST01" onBack={vi.fn()} onEnded={vi.fn(async () => undefined)} />));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="More options"]')?.click());
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("[role=dialog] button")).find((button) => button.textContent === "Session settings")?.click());
    await act(async () => setInputValue(container.querySelector<HTMLInputElement>('[aria-label="Court 1 label"]')!, "North"));

    const polledSession = { ...session, courts: [{ ...session.courts[0], label: "Server label" }] };
    mocks.sessionResource = { data: polledSession, error: "", refresh: vi.fn(async () => undefined) };
    await act(async () => root.render(<LiveSession code="TEST01" onBack={vi.fn()} onEnded={vi.fn(async () => undefined)} />));

    expect(container.querySelector<HTMLInputElement>('[aria-label="Court 1 label"]')?.value).toBe("North");
  });

  it("edits the full session setup while waiting, then keeps the session ready to start", async () => {
    const session = sessionWithCourts(
      [{ id: "court-1", courtNumber: 1, currentMatch: null }],
      [player("a", "Ari"), player("b", "Bea"), player("c", "Chen"), player("d", "Dee")],
    );
    session.status = "WAITING";
    session.matchmakingStyle = SessionMatchmakingStyle.BALANCED;
    session.balanceMetric = SessionBalanceMetric.RATING;
    session.pairingMode = SessionPairingMode.OPEN;
    setup(session);
    await act(async () => root.render(<LiveSession code="TEST01" onBack={vi.fn()} onEnded={vi.fn(async () => undefined)} />));

    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "Review session settings")?.click());
    await act(async () => setSelectValue(container.querySelector<HTMLSelectElement>('[aria-label="Matchmaking style"]')!, SessionMatchmakingStyle.LEVEL_MATCH));
    await act(async () => setSelectValue(container.querySelector<HTMLSelectElement>('[aria-label="Balance teams using"]')!, SessionBalanceMetric.SESSION_POINTS));
    await act(async () => setSelectValue(container.querySelector<HTMLSelectElement>('[aria-label="Pairing"]')!, SessionPairingMode.MIXED));
    await act(async () => setSelectValue(container.querySelector<HTMLSelectElement>('[aria-label="Court count"]')!, "3"));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Player groups"]')?.click());
    await act(async () => setSelectValue(container.querySelector<HTMLSelectElement>('[aria-label="Mix groups"]')!, SessionCrossoverFrequency.FREQUENT));
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("[role=dialog] button")).find((button) => button.textContent === "Save settings")?.click());

    expect(mocks.api).toHaveBeenCalledWith("/api/sessions/TEST01", "PATCH", {
      autoQueueEnabled: false,
      respectPlayerRest: true,
      courtLabels: [
        { courtNumber: 1, label: null },
        { courtNumber: 2, label: null },
        { courtNumber: 3, label: null },
      ],
      gameplaySettings: {
        matchmakingStyle: SessionMatchmakingStyle.LEVEL_MATCH,
        balanceMetric: SessionBalanceMetric.SESSION_POINTS,
        pairingMode: SessionPairingMode.MIXED,
        poolsEnabled: true,
        crossoverFrequency: SessionCrossoverFrequency.FREQUENT,
        courtCount: 3,
      },
    });
    expect(container.textContent).toContain("Ready to play?");
    expect(Array.from(container.querySelectorAll<HTMLButtonElement>("button")).some((button) => button.textContent === "Start session")).toBe(true);
    expect(Array.from(container.querySelectorAll<HTMLButtonElement>("button")).some((button) => button.textContent === "Manage players")).toBe(true);
  });

  it("confirms reset data loss and returns to a ready state for setup changes", async () => {
    const session = sessionWithCourts([
      { id: "court-1", courtNumber: 1, currentMatch: match("match-1", 1) },
    ]);
    setup(session);
    mocks.api.mockImplementation(async (url: string) => {
      if (url.endsWith("/reset")) {
        session.status = "WAITING";
        session.courts[0].currentMatch = null;
        session.matches = [];
      }
      return {};
    });
    await act(async () => root.render(<LiveSession code="TEST01" onBack={vi.fn()} onEnded={vi.fn(async () => undefined)} />));

    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="More options"]')?.click());
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("[role=dialog] button")).find((button) => button.textContent === "Session settings")?.click());
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("[role=dialog] button")).find((button) => button.textContent === "Reset session to change setup")?.click());

    expect(container.textContent).toContain("permanently removes every match, score, and standing");
    expect(container.textContent).toContain("reverses its rating changes");
    expect(mocks.api).not.toHaveBeenCalled();
    await act(async () => Array.from(container.querySelectorAll<HTMLButtonElement>("[role=dialog] button")).find((button) => button.textContent === "Reset session")?.click());

    expect(mocks.api).toHaveBeenCalledWith("/api/sessions/TEST01/reset", "POST");
    expect(container.textContent).toContain("Ready to play?");
    expect(Array.from(container.querySelectorAll<HTMLButtonElement>("button")).some((button) => button.textContent === "Review session settings")).toBe(true);
    expect(Array.from(container.querySelectorAll<HTMLButtonElement>("button")).some((button) => button.textContent === "Manage players")).toBe(true);
    expect(Array.from(container.querySelectorAll<HTMLButtonElement>("button")).some((button) => button.textContent === "Start session")).toBe(true);
  });
});
