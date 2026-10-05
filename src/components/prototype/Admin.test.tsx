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

function makeRequest(ownedPlayers: Array<{ id: string; name: string }> = []) {
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
    ownedPlayers,
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
      requests: [{ ...makeRequest(), conflict: "Another account already owns this Player." }],
      candidates: [],
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

  async function render() {
    await act(async () => root.render(
      <Admin
        snapshot={snapshot}
        refresh={async () => undefined}
        onBack={() => undefined}
        onNavigate={() => undefined}
        onDeleted={async () => undefined}
        onOpenProfile={() => undefined}
      />
    ));
    await act(async () => {
      Array.from(container.querySelectorAll("[role=tab]")).find((tab) => tab.textContent?.includes("Requests"))?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  it("lets admins approve a conflicting existing Player claim as a new Player when the account owns none", async () => {
    await render();
    const approveAsNew = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Approve as new Player");

    expect(approveAsNew).toBeTruthy();
    expect((approveAsNew as HTMLButtonElement).disabled).toBe(false);
    await act(async () => approveAsNew?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(mocks.api).toHaveBeenCalledWith(
      "/api/clubs/club-1/join-requests/request-1",
      "PATCH",
      { action: "APPROVE", asNew: true, revision: 3 }
    );
  });

  it("disables approval as new when the requester already owns a Player", async () => {
    mocks.resourceData = {
      allowJoinRequests: true,
      requests: [makeRequest([{ id: "owned-player", name: "Ari Current Profile" }])],
      candidates: [],
    } satisfies AdminAdmissionList;
    await render();
    const approveAsNew = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Approve as new Player");

    expect(approveAsNew).toBeTruthy();
    expect((approveAsNew as HTMLButtonElement).disabled).toBe(true);
  });
});
