// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberProfileData } from "@/lib/memberProfile";
import type { PlayerProfileMatchHistoryEntry } from "@/lib/profileStats";
import { ClubPlayerStatus, PartnerPreference, PlayerGender, SessionPool } from "@/types/enums";

const mocks = vi.hoisted(() => ({ resource: vi.fn(), onOpenMember: vi.fn() }));
vi.mock("@/components/app/ClubDataProvider", () => ({ useClubResource: mocks.resource }));
vi.mock("./api", () => ({ useResource: () => ({ data: null, error: "" }) }));
vi.mock("./Primitives", async importOriginal => ({
  ...await importOriginal<typeof import("./Primitives")>(),
  Sheet: ({ open = true, title, children, onClose }: {
    open?: boolean; title: string; children: React.ReactNode; onClose: () => void;
  }) => open ? <div role="dialog" aria-label={title}>{children}<button onClick={onClose} aria-label="Close">Close</button></div> : null,
}));

import { PlayerProfilePage, type RankedMember } from "./PlayerProfilePage";

const member: RankedMember = {
  id: "owner", name: "Profile Owner", status: ClubPlayerStatus.CORE, preferredPool: SessionPool.A, gender: PlayerGender.MALE,
  partnerPreference: PartnerPreference.OPEN, elo: 1000, wins: 10, losses: 2, isClaimed: true, role: "MEMBER",
};

function match(id: string, overrides: Partial<PlayerProfileMatchHistoryEntry> = {}): PlayerProfileMatchHistoryEntry {
  return {
    id, date: "2026-10-01T12:00:00Z", sessionId: id, sessionCode: id, sessionName: id,
    partner: { id: "sam", name: "Sam" }, opponents: [{ id: "other", name: "Other" }, { id: "fourth", name: "Fourth" }],
    score: "21 - 16", result: "WIN", eloChange: 8, pointDifferential: 5, ...overrides,
  };
}

function profile(matches = [match("Together")]): MemberProfileData {
  return {
    latestSession: null, recentForm: [], timeline: [],
    records: { highestRating: null, longestStreak: null, bestSession: null },
    history: { items: [], nextOffset: null, hasMore: false }, matchHistory: matches,
    relationships: {
      partner: null, rival: null,
      partners: ["sam", "second", "third", "fourth"].map(id => ({ id, name: id === "sam" ? "Sam" : id, wins: 10, losses: 2, matches: 12 })),
      rivals: [{ id: "sam", name: "Sam", wins: 1, losses: 2 }],
    },
  };
}

describe("profile relationship history", () => {
  let root: Root;
  let container: HTMLDivElement;
  let data: MemberProfileData;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    data = profile();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function render(owner = member) {
    mocks.resource.mockImplementation((url: string | null) => ({
      data: url?.includes("/stats?") ? { user: owner, profile: data } : null, error: "",
    }));
    await act(async () => root.render(<PlayerProfilePage clubId="club-a" clubName="Club A" member={owner} isSelf={false} onOpenMember={mocks.onOpenMember} />));
  }
  async function click(element: Element | null | undefined) {
    expect(element).toBeTruthy();
    await act(async () => { element!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  }
  const dialog = (title: string) => container.querySelector(`[role="dialog"][aria-label="${title}"]`);
  const button = (label: string, scope: ParentNode = container) => scope.querySelector(`button[aria-label="${label}"]`);

  it("filters by player ID and role, paginates newest first, and returns from match details", async () => {
    data = profile([
      ...Array.from({ length: 12 }, (_, index) => match(`Together ${index + 1}`, { date: `2026-10-${String(index + 1).padStart(2, "0")}T12:00:00Z` })),
      match("Against Sam", { partner: { id: "someone", name: "Someone" }, opponents: [{ id: "sam", name: "Sam" }], result: "LOSS", score: "16 - 21" }),
      match("Different Sam", { partner: { id: "lookalike", name: "Sam" } }),
    ]);
    await render();
    await click(button("Matches with Sam")?.querySelector("strong"));
    let history = dialog("With Sam")!;
    expect(history.querySelectorAll("[data-profile-match]")).toHaveLength(10);
    expect(history.querySelector("[data-profile-match]")?.getAttribute("data-profile-match")).toBe("Together 12");
    expect(history.querySelectorAll("[data-profile-match]")[9].getAttribute("data-profile-match")).toBe("Together 3");
    expect(history.textContent).not.toContain("Against Sam");
    expect(history.textContent).not.toContain("Different Sam");
    await click(Array.from(history.querySelectorAll("button")).find(node => node.textContent === "Load more"));
    expect(history.querySelectorAll("[data-profile-match]")).toHaveLength(12);
    expect(history.textContent).toContain("12 matches · 12 wins · 0 losses");
    await click(history.querySelector("[data-profile-match]"));
    expect(dialog("Match details")?.textContent).toContain("Profile Owner & Sam");
    expect(dialog("Match details")?.textContent).toContain("Win · 21 - 16");
    await click(button("Close", dialog("Match details")!));
    expect(dialog("Match details")).toBeNull();
    expect(history.querySelectorAll("[data-profile-match]")).toHaveLength(12);
    await click(button("Close", history));
    await click(button("Matches with Sam"));
    history = dialog("With Sam")!;
    expect(history.querySelectorAll("[data-profile-match]")).toHaveLength(10);
    await click(button("Close", history));
    await click(button("Matches against Sam")?.querySelector("svg"));
    const against = dialog("Against Sam")!;
    expect(against.querySelectorAll("[data-profile-match]")).toHaveLength(1);
    expect(against.textContent).toContain("Against Sam");
    expect(against.querySelector("[data-profile-match]")?.getAttribute("data-result")).toBe("LOSS");
    expect(against.querySelector('[data-score="owner"]')?.textContent).toBe("16");
    expect(against.querySelector('[data-score="opponent"][data-winner="true"]')?.textContent).toBe("21");
    expect(mocks.onOpenMember).not.toHaveBeenCalled();
  });

  it("returns to View all after history, and only the photo opens a profile", async () => {
    await render();
    await click(Array.from(container.querySelectorAll("button")).find(node => node.textContent === "View all"));
    const fullList = dialog("Best partners")!;
    await click(button("Matches with Sam", fullList));
    await click(button("Close", dialog("With Sam")!));
    expect(dialog("Best partners")).toBe(fullList);
    await click(button("View Sam’s profile", fullList));
    expect(mocks.onOpenMember).toHaveBeenCalledExactlyOnceWith("sam");
    expect(dialog("Best partners")).toBeNull();
    expect(dialog("With Sam")).toBeNull();
    expect(container.querySelector("button button")).toBeNull();
  });

  it("handles missing records and closes relationship history when the owner changes", async () => {
    await render();
    await click(button("Matches against Sam"));
    expect(dialog("Against Sam")?.textContent).toContain("No matches found.");
    await render({ ...member, id: "another-owner", name: "Another Owner" });
    expect(dialog("Against Sam")).toBeNull();
    expect(container.textContent).toContain("Another Owner");
  });
});
