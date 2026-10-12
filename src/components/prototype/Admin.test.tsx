// @vitest-environment jsdom

import type { ReactNode } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Snapshot } from "./Club";
import type { AdminAdmissionList } from "./admissionTypes";
import Admin from "./Admin";

const mocks = vi.hoisted(() => ({
  actionRun: vi.fn(),
  api: vi.fn(),
  refresh: vi.fn(),
  resourceData: null as unknown,
}));

vi.mock("./api", () => ({
  api: mocks.api,
  useResource: () => ({ data: mocks.resourceData, error: "", refresh: mocks.refresh }),
  useAction: () => ({
    busy: false,
    error: "",
    run: mocks.actionRun,
    setError: vi.fn(),
  }),
}));

vi.mock("./MainNav", () => ({ MainNav: () => null }));
vi.mock("./MemberPhotoEditor", () => ({ MemberPhotoEditor: () => null }));
vi.mock("./ClubSettings", () => ({ ClubSettings: () => null }));
vi.mock("./Primitives", () => ({
  Avatar: ({ name }: { name: string }) => <span>{name}</span>,
  ErrorText: ({ error }: { error: string }) => error ? <p role="alert">{error}</p> : null,
  Sheet: ({ open, title, children }: { open?: boolean; title: string; children: ReactNode }) =>
    open ? <div role="dialog" aria-label={title}>{children}</div> : null,
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
    mocks.actionRun.mockReset().mockImplementation(async (action: () => Promise<unknown>, success?: () => unknown) => {
      await action();
      await success?.();
    });
    mocks.api.mockReset().mockResolvedValue({});
    mocks.refresh.mockReset().mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  async function render({ pageSnapshot = snapshot, openRequests = true }: { pageSnapshot?: Snapshot; openRequests?: boolean } = {}) {
    await act(async () => root.render(
      <Admin
        snapshot={pageSnapshot}
        refresh={async () => undefined}
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
      { action: "APPROVE", playerId: "history-player", revision: 3 }
    );
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
      { action: "APPROVE", playerId: "local-placeholder", revision: 3 }
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
      "DELETE"
    );
  });
});
