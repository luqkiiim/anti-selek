// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CommunityPlayerStatus,
  MixedSide,
  PartnerPreference,
  PlayerGender,
  SessionPool,
} from "@/types/enums";
import { SessionRosterModal } from "./SessionRosterModal";
import type { CommunityUser } from "./sessionTypes";

const availablePlayer: CommunityUser = {
  id: "player-1",
  name: "Host Player 4",
  avatarUrl: null,
  elo: 1120,
  status: CommunityPlayerStatus.CORE,
  gender: PlayerGender.MALE,
  partnerPreference: PartnerPreference.OPEN,
  mixedSideOverride: null,
};

function getDefaultProps() {
  return {
    open: true,
    isAdmin: true,
    isMixicano: false,
    poolsEnabled: false,
    poolAName: "Open",
    poolBName: "Regular",
    rosterSearch: "",
    rosterPool: SessionPool.A,
    guestName: "",
    guestGender: PlayerGender.MALE,
    guestMixedSideOverride: null,
    guestInitialElo: 1000,
    addingGuest: false,
    addingPlayerId: null,
    playersNotInSession: [availablePlayer],
    onClose: vi.fn(),
    onRosterSearchChange: vi.fn(),
    onRosterPoolChange: vi.fn(),
    onGuestNameChange: vi.fn(),
    onGuestGenderChange: vi.fn(),
    onGuestMixedSideOverrideChange: vi.fn(),
    onGuestInitialEloChange: vi.fn(),
    onAddGuest: vi.fn(),
    onAddPlayer: vi.fn(),
  };
}

describe("SessionRosterModal", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
  });

  it("renders available community players while keeping guest creation collapsed", async () => {
    await act(async () => {
      root.render(<SessionRosterModal {...getDefaultProps()} />);
    });

    expect(document.body.textContent).toContain("Host Player 4");
    expect(document.body.textContent).toContain("Rating 1120");
    expect(document.body.textContent).toContain("Add guest instead");
    expect(
      document.body.querySelector('input[placeholder="Guest name"]')
    ).toBeNull();
    expect(document.body.textContent).not.toContain("Add Guest");
  });

  it("shows the guest form after expanding the secondary guest action", async () => {
    await act(async () => {
      root.render(
        <SessionRosterModal
          {...getDefaultProps()}
          isMixicano
          poolsEnabled
          guestMixedSideOverride={MixedSide.UPPER}
        />
      );
    });

    const toggle = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Add guest instead")
    );
    expect(toggle).toBeDefined();

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      document.body.querySelector('input[placeholder="Guest name"]')
    ).not.toBeNull();
    expect(document.body.textContent).toContain("Add Guest");
    expect(document.body.textContent).toContain("Beginner (850)");
    expect(document.body.textContent).toContain("Regular");
  });

  it("collapses guest creation again after the sheet is closed", async () => {
    const props = getDefaultProps();

    await act(async () => {
      root.render(<SessionRosterModal {...props} />);
    });

    const toggle = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Add guest instead")
    );

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      document.body.querySelector('input[placeholder="Guest name"]')
    ).not.toBeNull();

    const doneButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "Done"
    );

    await act(async () => {
      doneButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      root.render(<SessionRosterModal {...props} open={false} />);
    });

    await act(async () => {
      root.render(<SessionRosterModal {...props} open />);
    });

    expect(
      document.body.querySelector('input[placeholder="Guest name"]')
    ).toBeNull();
  });

  it("uses clear empty-state copy when no community players are available", async () => {
    await act(async () => {
      root.render(
        <SessionRosterModal
          {...getDefaultProps()}
          playersNotInSession={[]}
          rosterSearch="zzz"
        />
      );
    });

    expect(document.body.textContent).toContain(
      "No available community players."
    );
    expect(document.body.textContent).toContain(
      "Try another search or add a guest instead."
    );
    expect(document.body.textContent).not.toContain(
      "Everyone is already playing"
    );
  });
});
