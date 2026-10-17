// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "./Club";
import type { AdminAdmissionList } from "./admissionTypes";
import Admin from "./Admin";
import { AdminSaveOutcomeUnknownError } from "@/lib/adminClient";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  refresh: vi.fn(),
  resourceData: null as unknown,
}));

vi.mock("@/lib/adminClient", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/adminClient")>(), adminApi: mocks.api,
}));
vi.mock("@/components/club-admin/useAdminResource", () => ({
  useAdminResource: () => ({ data: mocks.resourceData, error: "", refresh: mocks.refresh, update: vi.fn() }),
}));
vi.mock("@/components/club-admin/RemovedPlayerAccounts", () => ({ RemovedPlayerAccounts: () => null }));
vi.mock("@/components/club-admin/PlayerInvitationPanel", () => ({ PlayerInvitationPanel: () => null }));
vi.mock("@/components/profile/AdjustClubRating", () => ({ AdjustClubRating: () => null }));
vi.mock("./MainNav", () => ({ MainNav: () => null }));
vi.mock("./MemberPhotoEditor", () => ({ MemberPhotoEditor: () => null }));
vi.mock("./ClubSettings", () => ({ ClubSettings: () => null }));
vi.mock("./Primitives", () => ({
  Avatar: ({ name }: { name: string }) => <span>{name}</span>,
  ErrorText: ({ error }: { error: string }) => error ? <p role="alert">{error}</p> : null,
  Sheet: ({ open, title, children, busy, onClose }: { open?: boolean; title: string; children: ReactNode; busy?: boolean; onClose: () => void }) =>
    open ? <div role="dialog" aria-label={title}><button aria-label="Close" disabled={busy} onClick={onClose}>Close</button><fieldset disabled={busy}>{children}</fieldset></div> : null,
}));
vi.mock("@phosphor-icons/react", () => {
  const Icon = () => null;
  return {
    ArrowLeft: Icon,
    Check: Icon,
    LinkSimple: Icon,
    MagnifyingGlass: Icon,
    PencilSimple: Icon,
    Plus: Icon,
  };
});

function makeRequest() {
  return {
    id: "request-1",
    clubId: "club-1",
    kind: "EXISTING_PLAYER" as const,
    status: "PENDING" as const,
    revision: 3,
    requestedPlayerId: "history-player",
    proposedPlayerName: null,
    proposedGender: null,
    note: null,
    createdAt: "2026-10-04T00:00:00.000Z",
    requesterName: "Ari Account",
    requesterEmail: "ari@example.com",
    targetName: "Ari Old Profile",
    history: {
      id: "history-player",
      name: "Ari Old Profile",
      elo: 1200,
      matchesPlayed: 8,
    },
  };
}

const snapshot = {
  viewer: { id: "admin-account", name: "Admin", email: "admin@example.com" },
  club: { id: "club-1", name: "Riverside" },
  clubMembers: [],
  sessions: [],
  claimRequests: [],
} as unknown as Snapshot;

describe("Admin admission review", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    mocks.resourceData = {
      allowJoinRequests: true,
      requests: [makeRequest()],
      candidates: [{ id: "history-player", name: "Ari Old Profile", elo: 1200, matchesPlayed: 8 }],
    } satisfies AdminAdmissionList;
    mocks.api.mockReset().mockResolvedValue({});
    mocks.refresh.mockReset().mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    vi.useRealTimers();
    await act(async () => root.unmount());
    container.remove();
  });

  async function render({ pageSnapshot = snapshot, openRequests = true, refresh = async () => undefined, onMemberSaved = () => undefined, disabled = false }: { pageSnapshot?: Snapshot; openRequests?: boolean; refresh?: () => Promise<unknown>; onMemberSaved?: (member: Snapshot["clubMembers"][number]) => void; disabled?: boolean } = {}) {
    await act(async () => root.render(
      <Admin
        snapshot={pageSnapshot}
        refresh={refresh}
        onMemberSaved={onMemberSaved}
        disabled={disabled}
        onBack={() => undefined}
        onNavigate={() => undefined}
        onDeleted={async () => undefined}
        onOpenProfile={() => undefined}
      />
    ));
    if (openRequests) {
      await act(async () => {
        Array.from(container.querySelectorAll("[role=tab]")).find((tab) => tab.textContent?.includes("Requests"))?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    }
  }

  it("lets admins approve an ordinary local profile claim by its exact Player ID", async () => {
    await render();
    const approve = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Approve Ari Old Profile");

    expect(approve).toBeTruthy();
    expect((approve as HTMLButtonElement).disabled).toBe(false);
    await act(async () => approve?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(mocks.api).toHaveBeenCalledWith(
      "/api/clubs/club-1/join-requests/request-1",
      "PATCH",
      { action: "APPROVE", playerId: "history-player", revision: 3 }, expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("shows current account details for new profiles while retaining the submitted snapshot", async () => {
    const request = { ...makeRequest(), kind: "NEW_PLAYER" as const, requestedPlayerId: null,
      proposedPlayerName: "Old name", proposedGender: "MALE",
      currentAccountProfile: { name: "Current name", gender: "FEMALE", isComplete: true } };
    mocks.resourceData = { allowJoinRequests: true, requests: [request], candidates: [] } satisfies AdminAdmissionList;
    await render();
    const summary = container.querySelector(".admission-review-player");
    expect(summary?.textContent).toContain("Current name");
    expect(summary?.textContent).toContain("Female");
    expect(summary?.textContent).not.toContain("Old name");
    expect(container.textContent).toContain("Account details changed since this request.");
    const approve = Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Approve as new local profile") as HTMLButtonElement;
    expect(approve.disabled).toBe(false);
    await act(async () => approve.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(mocks.api).toHaveBeenCalledWith("/api/clubs/club-1/join-requests/request-1", "PATCH", { action: "APPROVE", asNew: true, revision: 3 }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(request.proposedPlayerName).toBe("Old name");
    expect(request.proposedGender).toBe("MALE");
  });

  it("blocks new-profile creation for incomplete accounts while retaining ordinary claim review", async () => {
    mocks.resourceData = { allowJoinRequests: true, requests: [{ ...makeRequest(), currentAccountProfile: { name: "Ari Account", gender: "UNSPECIFIED", isComplete: false } }], candidates: [] } satisfies AdminAdmissionList;
    await render();
    const buttons = Array.from(container.querySelectorAll("button"));
    expect((buttons.find(button => button.textContent === "Approve as new local profile") as HTMLButtonElement).disabled).toBe(true);
    expect((buttons.find(button => button.textContent === "Approve Ari Old Profile") as HTMLButtonElement).disabled).toBe(false);
    expect(container.textContent).toContain("Account settings before a new profile can be created");
  });

  it("keeps local profile review available without showing global identity review controls", async () => {
    mocks.resourceData = {
      allowJoinRequests: true,
      requests: [makeRequest()],
      candidates: [
        { id: "history-player", name: "Ari Old Profile", elo: 1200, matchesPlayed: 8 },
        { id: "local-placeholder", name: "Ari Local Placeholder", elo: 990, matchesPlayed: 0 },
      ],
    } satisfies AdminAdmissionList;
    await render();
    expect(container.textContent).not.toContain("owned by this account");
    expect(container.textContent).not.toContain("identity review");
    await act(async () => {
      const change = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("Choose another Player"));
      change?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const picker = container.querySelector("select[aria-label='Player for Ari Account']") as HTMLSelectElement;
    expect(Array.from(picker.options).map((option) => option.textContent)).toEqual([
      "Select a Player",
      "Ari Local Placeholder · 990 rating",
      "Ari Old Profile · 1200 rating",
    ]);
    await act(async () => {
      picker.value = "local-placeholder";
      picker.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const approve = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Approve Ari Local Placeholder");

    expect(approve).toBeTruthy();
    await act(async () => approve?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(mocks.api).toHaveBeenCalledWith(
      "/api/clubs/club-1/join-requests/request-1",
      "PATCH",
      { action: "APPROVE", playerId: "local-placeholder", revision: 3 }, expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it("removes a member from this club with automatic local disconnect and no optional checkbox", async () => {
    const pageSnapshot = {
      ...snapshot,
      clubMembers: [{
        id: "local-player",
        name: "Alex Local",
        avatarUrl: null,
        status: "CORE",
        preferredPool: "B",
        gender: "MALE",
        partnerPreference: "OPEN",
        mixedSideOverride: null,
        elo: 1100,
        wins: 0,
        losses: 0,
        isClaimed: true,
        isOwner: false,
        role: "MEMBER",
      }],
    } as unknown as Snapshot;
    await render({ pageSnapshot, openRequests: false });

    await act(async () => {
      const edit = Array.from(container.querySelectorAll("button")).find((button) => button.getAttribute("aria-label") === "Edit Alex Local");
      edit?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Remove player")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(container.textContent).toContain("archives the local membership and disconnects their account from this club");
    expect(container.textContent).toContain("Player history, rating, and memberships in other clubs stay intact");
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    await act(async () => {
      Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Remove player")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(mocks.api).toHaveBeenCalledWith(
      "/api/clubs/club-1/members/local-player",
      "DELETE", undefined, expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });
  const player = { id: "local-player", name: "Alex Local", avatarUrl: null, status: "CORE", preferredPool: "B", gender: "MALE", partnerPreference: "OPEN", mixedSideOverride: null, elo: 1100, wins: 3, losses: 2, isClaimed: false, isOwner: false, role: "MEMBER" } as Snapshot["clubMembers"][number];
  function click(label: string) {
    const target = Array.from((container.querySelector('[role="dialog"]') ?? container).querySelectorAll("button")).find(button => button.textContent?.trim() === label || button.getAttribute("aria-label") === label);
    if (!target) throw new Error(`Missing button ${label}`);
    target.click();
  }
  function input(label: string, value: string) {
    const element = Array.from(container.querySelectorAll("label")).find(item => item.textContent?.trim().startsWith(label))?.querySelector("input,select") as HTMLInputElement | HTMLSelectElement;
    if (!element) throw new Error(`Missing input ${label}`);
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  }
  it("creates a player with one initial-rating save and closes before a hanging refresh", async () => {
    vi.useFakeTimers();
    const saved = vi.fn();
    const refresh = vi.fn(() => new Promise(() => {}));
    await render({ openRequests: false, refresh, onMemberSaved: saved });
    await act(async () => click("Add player"));
    await act(async () => { input("Name", "New Player"); input("Gender", "MALE"); input("Rating", "1450"); });
    mocks.api.mockResolvedValueOnce({ ...player, id: "new-player", name: "New Player", elo: 1450 });
    await act(async () => click("Add player"));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain("Player added.");
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ id: "new-player", elo: 1450 }));
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith("/api/clubs/club-1/members", "POST", { name: "New Player", status: "CORE", gender: "MALE", initialRating: 1450 }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(container.textContent).toContain("Saved. Couldn’t refresh the latest details.");
    expect(container.textContent).toContain("Refresh details");
  });
  it("keeps claimed-account pairing fields private while saving changed club fields", async () => {
    await render({ openRequests: false, pageSnapshot: { ...snapshot, clubMembers: [{ ...player, isClaimed: true, ownerUserId: "other-account" }] } });
    await act(async () => click("Edit Alex Local"));
    expect(container.querySelector('select[aria-label="Player level"]')).toBeNull();
    expect(container.querySelector('input[type="number"]')).toBeNull();
    await act(async () => { input("Membership", "OCCASIONAL"); input("Preferred game group", "A"); });
    mocks.api.mockResolvedValueOnce({ ...player, isClaimed: true, status: "OCCASIONAL", preferredPool: "A" });
    await act(async () => click("Save changes"));
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith("/api/clubs/club-1/members/local-player", "PATCH", { status: "OCCASIONAL", preferredPool: "A" }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });
  it("keeps edits after an unknown save and retries only the reads", async () => {
    const refresh = vi.fn(async () => undefined);
    await render({ openRequests: false, refresh, pageSnapshot: { ...snapshot, clubMembers: [player] } });
    await act(async () => click("Edit Alex Local"));
    await act(async () => input("Name", "Edited Alex"));
    mocks.api.mockRejectedValueOnce(new AdminSaveOutcomeUnknownError());
    await act(async () => click("Save changes"));
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain("Couldn’t confirm the save. Refresh to check.");
    expect(container.querySelector('input')?.value).not.toBe("Alex Local");
    await act(async () => click("Refresh details"));
    expect(refresh).toHaveBeenCalledOnce();
    expect(mocks.api).toHaveBeenCalledOnce();
    await act(async () => click("Close"));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
  it("retains the server's post-save queue warning even when snapshot refresh succeeds", async () => {
    await render({ openRequests: false, pageSnapshot: { ...snapshot, clubMembers: [player] } });
    await act(async () => click("Edit Alex Local"));
    await act(async () => input("Preferred game group", "A"));
    mocks.api.mockResolvedValueOnce({ ...player, preferredPool: "A", warnings: [{ code: "QUEUE_REBUILD_FAILED", message: "Player saved. The automatic queue could not be refreshed." }] });
    await act(async () => click("Save changes"));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(container.textContent).toContain("Player details saved.");
    expect(container.textContent).toContain("Player saved. The automatic queue could not be refreshed.");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
  it("allows closing an editor after permission validation becomes unavailable", async () => {
    const pageSnapshot = { ...snapshot, clubMembers: [player] };
    await render({ openRequests: false, pageSnapshot });
    await act(async () => click("Edit Alex Local"));
    await render({ openRequests: false, pageSnapshot, disabled: true });
    expect((container.querySelector('[aria-label="Close"]') as HTMLButtonElement).disabled).toBe(false);
    await act(async () => click("Close"));
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

});
