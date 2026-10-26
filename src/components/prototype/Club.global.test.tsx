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
beforeEach(() => { members = []; (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement("div"); document.body.append(container); root = createRoot(container); vi.stubGlobal("fetch", vi.fn(async (url) => ({ ok: true, json: async () => String(url).startsWith("/api/clubs/club") ? { club: { ...club, role: "ADMIN", readOnly: String(url).includes("global") }, viewer: { id: "account", name: "Ari", playerId: null, isAdmin: true }, clubMembers: members, claimRequests: [], sessions: [{ id: "s", code: "LIVE1", name: "Live rally", status: "ACTIVE", players: [] }] } : {} }))); });
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

  const dialog = container.querySelector('[role="dialog"][aria-label="Members"]')!;
  expect(dialog).not.toBeNull();
  expect(Array.from(dialog.querySelectorAll("li strong"), node => node.textContent)).toEqual(["anna", "Ben", "Zoe"]);
  expect(dialog.querySelectorAll("li button, li a, input")).toHaveLength(0);
  expect(container.querySelector('nav button[aria-current="page"]')?.textContent).toBe("Club");
  expect(fetch).toHaveBeenCalledTimes(requests);

  await click("Close");
  expect(container.querySelector('[role="dialog"][aria-label="Members"]')).toBeNull();
  expect(container.querySelector('nav button[aria-current="page"]')?.textContent).toBe("Club");
});

it("opens an empty club's member list", async () => {
  await render(false);
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="0 Members, view members"]')!.click());
  expect(container.querySelector('[role="dialog"][aria-label="Members"]')?.textContent).toContain("No members yet.");
});
