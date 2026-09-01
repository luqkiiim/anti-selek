// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ClubPlayerStatus,
  MixedSide,
  PartnerPreference,
  PlayerGender,
  SessionPool,
} from "@/types/enums";
import { SessionRosterModal } from "./SessionRosterModal";
import type { ClubUser } from "./sessionTypes";

const availablePlayer: ClubUser = {
  id: "player-1",
  name: "Host Player 4",
  avatarUrl: null,
  elo: 1120,
  status: ClubPlayerStatus.CORE,
  gender: PlayerGender.MALE,
  partnerPreference: PartnerPreference.OPEN,
  mixedSideOverride: null,
  needsMoreRest: false,
  preferredPool: SessionPool.B,
};
const interclubPlayer: ClubUser = {
  ...availablePlayer,
  representingClubId: "club-b",
  representingClubName: "Anti-SeleK",
};

function getDefaultProps() {
  return {
    open: true,
    isAdmin: true,
    isMixicano: false,
    isInterclub: false,
    interclubClubOptions: [],
    poolsEnabled: false,
    rosterSearch: "",
    rosterPool: SessionPool.B,
    rosterPlayerPools: {},
    guestName: "",
    guestGender: PlayerGender.MALE,
    guestMixedSideOverride: null,
    guestRepresentingClubId: "",
    guestInitialElo: 1000,
    guestFormError: "",
    addingGuest: false,
    addingPlayerId: null,
    playersNotInSession: [availablePlayer],
    existingParticipantNames: [],
    onClose: vi.fn(),
    onRosterSearchChange: vi.fn(),
    onRosterPoolChange: vi.fn(),
    onRosterPlayerPoolChange: vi.fn(),
    onGuestNameChange: vi.fn(),
    onGuestGenderChange: vi.fn(),
    onGuestMixedSideOverrideChange: vi.fn(),
    onGuestRepresentingClubChange: vi.fn(),
    onGuestInitialEloChange: vi.fn(),
    onResetGuestDraft: vi.fn(),
    onAddGuest: vi.fn(async () => true),
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

  it("renders available club players without a permanent guest form", async () => {
    await act(async () => {
      root.render(<SessionRosterModal {...getDefaultProps()} />);
    });

    expect(document.body.textContent).toContain("Host Player 4");
    expect(document.body.textContent).toContain("Rating 1120");
    expect(document.body.textContent).not.toContain("Add guest instead");
    expect(document.body.textContent).not.toContain("as a guest");
    expect(document.body.textContent).not.toContain("Anti-SeleK");
    expect(
      document.body.querySelector('input[aria-label="Guest starting rating"]')
    ).toBeNull();
    expect(document.body.textContent).not.toContain("Add Guest");
  });

  it("shows club chips for collab roster rows with club metadata", async () => {
    await act(async () => {
      root.render(
        <SessionRosterModal
          {...getDefaultProps()}
          playersNotInSession={[interclubPlayer]}
        />
      );
    });

    expect(document.body.textContent).toContain("Host Player 4");
    expect(document.body.textContent).toContain("Anti-SeleK");
  });

  it("passes the selected roster row when adding a player", async () => {
    const onAddPlayer = vi.fn();

    await act(async () => {
      root.render(
        <SessionRosterModal
          {...getDefaultProps()}
          playersNotInSession={[interclubPlayer]}
          onAddPlayer={onAddPlayer}
        />
      );
    });

    const addButton = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent === "Add"
    );

    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(onAddPlayer).toHaveBeenCalledWith(interclubPlayer);
  });

  it("shows the guest dialog from a missing-name search result", async () => {
    await act(async () => {
      root.render(
        <SessionRosterModal
          {...getDefaultProps()}
          isMixicano
          poolsEnabled
          rosterSearch="New Guest"
          guestMixedSideOverride={MixedSide.UPPER}
        />
      );
    });

    const toggle = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Add “New Guest” as a guest")
    );
    expect(toggle).toBeDefined();

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(
      document.body.querySelector('input[type="text"]')
    ).not.toBeNull();
    expect(document.body.textContent).toContain("Add guest");
    expect(document.body.textContent).toContain("Beginner (850)");
    expect(document.body.textContent).toContain("Social");
    expect(
      document.body.querySelector('input[aria-label="Guest name"]')
    ).not.toBeNull();
    expect(
      document.body.querySelector('select[aria-label="Guest starting rating"]')
    ).not.toBeNull();
    expect(
      document.body.querySelector('select[aria-label="Guest game group"]')
    ).not.toBeNull();
    expect(
      document.body.querySelector('select[aria-label="Guest gender"]')
    ).not.toBeNull();
    expect(
      document.body.querySelector(
        'select[aria-label="Guest mixed doubles side"]'
      )
    ).not.toBeNull();
  });

  it("starts each late-joining member in their saved group and allows an override", async () => {
    const onRosterPlayerPoolChange = vi.fn();

    await act(async () => {
      root.render(
        <SessionRosterModal
          {...getDefaultProps()}
          poolsEnabled
          onRosterPlayerPoolChange={onRosterPlayerPoolChange}
        />
      );
    });

    const groupSelect = document.body.querySelector(
      'select[aria-label="Game group for Host Player 4"]'
    ) as HTMLSelectElement | null;
    expect(groupSelect?.value).toBe(SessionPool.B);

    await act(async () => {
      if (groupSelect) {
        groupSelect.value = SessionPool.A;
        groupSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });

    expect(onRosterPlayerPoolChange).toHaveBeenCalledWith(
      "player-1",
      SessionPool.A
    );
  });

  it("closes guest creation again after the picker is closed", async () => {
    const props = { ...getDefaultProps(), rosterSearch: "New Guest" };

    await act(async () => {
      root.render(<SessionRosterModal {...props} />);
    });

    const toggle = Array.from(document.body.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("Add “New Guest” as a guest")
    );

    await act(async () => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(
      document.body.querySelector('input[type="text"]')
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
      document.body.querySelector('select[aria-label="Guest starting rating"]')
    ).toBeNull();
  });

  it("offers a guest action when no club player matches", async () => {
    await act(async () => {
      root.render(
        <SessionRosterModal
          {...getDefaultProps()}
          playersNotInSession={[]}
          rosterSearch="zzz"
        />
      );
    });

    expect(document.body.textContent).toContain("Add “zzz” as a guest");
    expect(document.body.textContent).toContain("No exact club player match.");
  });
});
