// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ClubPageMember } from "@/components/club/clubTypes";
import { ClubPlayerStatus } from "@/types/enums";
import Club from "./Club";
vi.mock("./Pager", () => ({ Pager: ({ active, children }: { active: string; children: (page: string) => unknown }) => children(active) }));
vi.mock("./LiveSession", () => ({ default: ({ code, globalClubId }: { code: string; globalClubId?: string }) => <div data-session={code} data-global-club={globalClubId} /> }));
vi.mock("./Achievements", () => ({ AchievementCabinet: () => null, NextMilestone: () => null }));
vi.mock("./Primitives", async (importOriginal) => ({
  ...await importOriginal<typeof import("./Primitives")>(),
  Sheet: ({ open = true, title, onClose, children }: { open?: boolean; title: string; onClose: () => void; children: ReactNode }) => open ? (
    <div role="dialog" aria-label={title}><button onClick={onClose}>Close</button>{children}</div>
  ) : null,
}));
const club = { id: "club", name: "Riverside", avatarUrl: null, membersCount: 1, sessionsCount: 1 };
let container: HTMLDivElement, root: Root;
let members: Partial<ClubPageMember>[];
let sessions: { id: string; code: string; name: string; status: string; players: []; isTest?: boolean }[];
let role: "ADMIN" | "STAFF" | "MEMBER";
let playerId: string | null;
const recent = { id: "completed", code: "DONE", name: "Wednesday doubles", date: "2026-10-28T12:00:00Z", matches: 5, wins: 1, losses: 4, ratingChange: -39 };
beforeEach(() => {
  members = []; role = "ADMIN"; playerId = null;
  sessions = [{ id: "s", code: "LIVE1", name: "Live rally", status: "ACTIVE", players: [] }];
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  vi.stubGlobal("fetch", vi.fn(async (url) => ({ ok: true, json: async () => String(url).startsWith("/api/users/")
    ? { user: { name: "Ari", elo: 1149 }, recentSessions: [recent] }
    : String(url).startsWith("/api/clubs/club") ? {
      club: { ...club, role, readOnly: String(url).includes("global") },
      viewer: { id: "account", name: "Ari", playerId, isAdmin: role === "ADMIN" },
      clubMembers: members, claimRequests: [], sessions,
    } : {} })));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
function render(globalView: boolean) { return act(async () => root.render(<Club club={club} globalView={globalView} onSwitch={() => {}} onAccountSaved={async () => {}} onClubsChanged={async () => {}} />)); }
function click(text: string) { const found = Array.from(container.querySelectorAll("button")).find(b => b.textContent === text); if (!found) throw new Error(`Missing ${text}`); return act(async () => found.click()); }
it("global entry hides own profile and all host controls despite stale administrative flags", async () => { await render(true); expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/clubs/club?view=global"); expect(container.querySelector('[aria-label="Manage club"]')).toBeNull(); expect(container.textContent).not.toContain("Your progress here"); expect(Array.from(container.querySelectorAll("button")).some(b => b.textContent === "Profile")).toBe(false); await click("Sessions"); expect(container.textContent).not.toContain("Continue hosting"); expect(container.textContent).not.toContain("New"); await click("View session"); expect(container.querySelector('[data-global-club="club"][data-session="LIVE1"]')).not.toBeNull(); });
it("normal owned entry retains management and profile navigation", async () => { await render(false); expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/clubs/club"); expect(container.querySelector('[aria-label="Manage club"]')).not.toBeNull(); expect(container.textContent).not.toContain("Your progress here"); expect(Array.from(container.querySelectorAll("button")).some(b => b.textContent === "Profile")).toBe(true); expect(container.textContent).toContain("Continue hosting"); await click("Sessions"); expect(container.textContent).toContain("New"); });
it("opens Manage Club with the admin roster read instead of the full dashboard", async () => {
  await act(async () => root.render(<Club club={club} initialPage="admin" onSwitch={() => {}} onAccountSaved={async () => {}} onClubsChanged={async () => {}} />));
  expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/clubs/club?section=admin");
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url) === "/api/clubs/club")).toBe(false);
});

it.each([false, true])("lists the full roster without navigating or fetching in global mode %s", async (globalView) => {
  members = [
    { id: "core", name: "Zoe", status: ClubPlayerStatus.CORE, matchesPlayed: 4, isClaimed: true },
    { id: "occasional", name: "anna", status: ClubPlayerStatus.OCCASIONAL, matchesPlayed: 2, isClaimed: true },
    { id: "new", name: "Ben", status: ClubPlayerStatus.CORE, matchesPlayed: 0, isClaimed: false },
  ];
  await render(globalView);
  const requests = vi.mocked(fetch).mock.calls.length;
  const trigger = container.querySelector<HTMLButtonElement>('[aria-label="3 Members, view members"]')!;
  await act(async () => trigger.click());

  const dialog = container.querySelector('[role="dialog"][aria-label="Players"]')!;
  expect(dialog).not.toBeNull();
  expect(Array.from(dialog.querySelectorAll("li strong"), node => node.textContent)).toEqual(["anna", "Ben", "Zoe"]);
  expect(dialog.querySelectorAll("li button, li a, input")).toHaveLength(0);
  expect(container.querySelector('nav button[aria-current="page"]')?.textContent).toBe("Club");
  expect(fetch).toHaveBeenCalledTimes(requests);

  await click("Close");
  expect(container.querySelector('[role="dialog"][aria-label="Players"]')).toBeNull();
  expect(container.querySelector('nav button[aria-current="page"]')?.textContent).toBe("Club");
});

it("opens an empty club's member list", async () => {
  await render(false);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="0 Members, view members"]')!.click());
  expect(container.querySelector('[role="dialog"][aria-label="Players"]')?.textContent).toContain("No players yet.");
});

it("prioritizes one live session and keeps the other live and waiting sessions reachable", async () => {
  sessions = [
    { id: "waiting", code: "WAIT", name: "Upcoming rally", status: "WAITING", players: [] },
    ...sessions,
    { id: "other", code: "OTHER", name: "Other live rally", status: "ACTIVE", players: [] },
  ];
  await render(false);
  const area = container.querySelector(".club-session-area")!;
  expect(area.querySelectorAll("h2")).toHaveLength(1);
  expect(area.textContent).toContain("Live rally");
  expect(area.textContent).not.toContain("Upcoming rally");
  await click("View all sessions");
  expect(container.textContent).toContain("Other live rally");
  expect(container.textContent).toContain("Upcoming rally");
});

it.each(["ADMIN", "STAFF", "MEMBER"] as const)("opens the featured waiting session with the correct %s permissions", async viewerRole => {
  role = viewerRole;
  sessions = [{ id: "waiting", code: "WAIT", name: "Upcoming rally", status: "WAITING", players: [] }];
  const navigate = vi.fn();
  await act(async () => root.render(<Club club={club} onRoute={navigate} onSwitch={() => {}} onAccountSaved={async () => {}} onClubsChanged={async () => {}} />));
  await click(viewerRole === "MEMBER" ? "View session" : "Manage session");
  expect(navigate).toHaveBeenCalledExactlyOnceWith("/session/WAIT?tab=courts");
});

it.each(["ADMIN", "STAFF", "MEMBER"] as const)("offers an allowed empty-state action for %s and excludes test sessions", async viewerRole => {
  role = viewerRole;
  sessions = [{ id: "test", code: "TEST", name: "Hidden test session", status: "ACTIVE", players: [], isTest: true }];
  const navigate = vi.fn();
  await act(async () => root.render(<Club club={club} onRoute={navigate} onSwitch={() => {}} onAccountSaved={async () => {}} onClubsChanged={async () => {}} />));
  expect(container.textContent).not.toContain("Hidden test session");
  await click(viewerRole === "MEMBER" ? "View sessions" : "New session");
  expect(navigate).toHaveBeenCalledExactlyOnceWith(`/club/club?tab=${viewerRole === "MEMBER" ? "sessions" : "setup"}`);
});

it("opens the matching completed-session recap without navigating to an active or test session", async () => {
  playerId = "ari";
  sessions.push({ id: recent.id, code: recent.code, name: recent.name, status: "COMPLETED", players: [] });
  const navigate = vi.fn();
  await act(async () => root.render(<Club club={club} onRoute={navigate} onSwitch={() => {}} onAccountSaved={async () => {}} onClubsChanged={async () => {}} />));
  await act(async () => container.querySelector<HTMLButtonElement>(".session-update")!.click());
  expect(navigate).toHaveBeenCalledExactlyOnceWith("/club/club?tab=recap&session=DONE");
});
