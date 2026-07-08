// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PartnerPreference,
  PlayerGender,
  SessionPool,
} from "@/types/enums";
import type { Player, PreferenceEditorState } from "./sessionTypes";
import { SessionPreferenceEditorPortal } from "./SessionPreferenceEditorPortal";

function createPlayer(overrides: Partial<Player> = {}): Player {
  return {
    userId: "player-1",
    sessionPoints: 0,
    isPaused: false,
    isGuest: false,
    gender: PlayerGender.MALE,
    partnerPreference: PartnerPreference.OPEN,
    mixedSideOverride: null,
    pool: SessionPool.A,
    needsMoreRest: false,
    user: {
      id: "player-1",
      name: "Player One",
      elo: 1000,
    },
    ...overrides,
  };
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    writable: true,
    value: height,
  });
}

function findButton(label: string) {
  return Array.from(document.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === label
  ) as HTMLButtonElement | undefined;
}

function findHeading(label: string) {
  return Array.from(document.querySelectorAll("h3")).find(
    (heading) => heading.textContent?.trim() === label
  ) as HTMLHeadingElement | undefined;
}

describe("SessionPreferenceEditorPortal", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    setViewport(1024, 768);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    document.body.innerHTML = "";
  });

  async function renderPortal({
    player = createPlayer(),
    openPreferenceEditor = {
      userId: "player-1",
      placement: "popover",
      anchor: {
        top: 20,
        right: 244,
        bottom: 60,
        left: 144,
      },
    } satisfies PreferenceEditorState,
    onClose = vi.fn(),
    onUpdatePreference = vi.fn(async () => {}),
    onRequestSkipNext = vi.fn(),
    onToggleSkipNext = vi.fn(),
    onRequestRenameGuest = vi.fn(),
    onRemovePlayer = vi.fn(),
    isMixicano = false,
    isInterclub = false,
    poolsEnabled = false,
    renamingGuestId = null,
    removingPlayerId = null,
    skippingNextPlayerId = null,
  }: {
    player?: Player;
    openPreferenceEditor?: PreferenceEditorState;
    onClose?: ReturnType<typeof vi.fn>;
    onUpdatePreference?: ReturnType<typeof vi.fn>;
    onRequestSkipNext?: ReturnType<typeof vi.fn>;
    onToggleSkipNext?: ReturnType<typeof vi.fn>;
    onRequestRenameGuest?: ReturnType<typeof vi.fn>;
    onRemovePlayer?: ReturnType<typeof vi.fn>;
    isMixicano?: boolean;
    isInterclub?: boolean;
    poolsEnabled?: boolean;
    renamingGuestId?: string | null;
    removingPlayerId?: string | null;
    skippingNextPlayerId?: string | null;
  } = {}) {
    await act(async () => {
      root.render(
        <SessionPreferenceEditorPortal
          openPreferenceEditor={openPreferenceEditor}
          activePreferencePlayer={player}
          isAdmin
          isCompletedSession={false}
          isMixicano={isMixicano}
          isInterclub={isInterclub}
          interclubClubOptions={[{ id: "club-1", name: "Club One" }]}
          poolsEnabled={poolsEnabled}
          renamingGuestId={renamingGuestId}
          removingPlayerId={removingPlayerId}
          skippingNextPlayerId={skippingNextPlayerId}
          onClose={onClose}
          onUpdatePreference={onUpdatePreference}
          onRequestSkipNext={onRequestSkipNext}
          onToggleSkipNext={onToggleSkipNext}
          onRequestRenameGuest={onRequestRenameGuest}
          onRemovePlayer={onRemovePlayer}
        />
      );
    });
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    return {
      onClose,
      onUpdatePreference,
      onRequestSkipNext,
      onToggleSkipNext,
      onRequestRenameGuest,
      onRemovePlayer,
    };
  }

  it("toggles more rest for the current session", async () => {
    const player = createPlayer();
    const { onClose, onUpdatePreference } = await renderPortal({ player });

    const checkbox = document.querySelector(
      'input[type="checkbox"]'
    ) as HTMLInputElement | null;
    expect(checkbox).not.toBeNull();

    await act(async () => {
      checkbox?.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onUpdatePreference).toHaveBeenCalledTimes(1);
    expect(onUpdatePreference).toHaveBeenCalledWith(
      "player-1",
      PlayerGender.MALE,
      null,
      SessionPool.A,
      true,
      null
    );
  });

  it("renders mobile player actions as a bottom sheet without inline coordinates", async () => {
    setViewport(390, 844);

    await renderPortal({
      openPreferenceEditor: {
        userId: "player-1",
        placement: "sheet",
      },
      player: createPlayer({
        isGuest: true,
        skipNextMatchAt: "2026-07-08T10:00:00.000Z",
      }),
      isMixicano: true,
      isInterclub: true,
      poolsEnabled: true,
    });

    const sheet = document.querySelector(
      '[data-session-player-actions-layout="sheet"]'
    ) as HTMLElement | null;
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null;
    const dangerHeading = findHeading("Danger");

    expect(sheet).not.toBeNull();
    expect(sheet?.className).toContain("z-[90]");
    expect(sheet?.textContent).toContain("Preferences");
    expect(sheet?.textContent).toContain("Rotation");
    expect(sheet?.textContent).toContain("Danger");
    expect(sheet?.textContent).toContain("Cancel Skip Next");
    expect(sheet?.textContent).toContain("Rename Guest");
    expect(dialog?.style.left).toBe("");
    expect(dialog?.style.top).toBe("");
    expect(dialog?.className).toContain("flex");
    expect(dangerHeading?.parentElement?.textContent).toContain("Remove Player");
  });

  it("renders desktop player actions as a clamped 224px popover", async () => {
    setViewport(400, 500);

    await renderPortal({
      openPreferenceEditor: {
        userId: "player-1",
        placement: "popover",
        anchor: {
          top: 420,
          right: 390,
          bottom: 452,
          left: 340,
        },
      },
    });

    const popover = document.querySelector(
      '[data-session-player-actions-layout="popover"]'
    ) as HTMLElement | null;

    expect(popover).not.toBeNull();
    expect(popover?.className).toContain("z-[90]");
    expect(popover?.className).toContain("w-56");
    expect(popover?.style.left).toBe("166px");
    expect(popover?.style.top).toBe("92px");
    expect(popover?.style.visibility).toBe("");
  });

  it("closes from mobile backdrop, close button, and Escape", async () => {
    const { onClose } = await renderPortal({
      openPreferenceEditor: {
        userId: "player-1",
        placement: "sheet",
      },
    });

    await act(async () => {
      document
        .querySelector('[data-session-player-actions-backdrop="true"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    await act(async () => {
      document
        .querySelector('button[aria-label="Close"]')
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("keeps skip next labels wired to the existing action state", async () => {
    const onRequestSkipNext = vi.fn();
    const onToggleSkipNext = vi.fn();

    await renderPortal({
      onRequestSkipNext,
      onToggleSkipNext,
    });

    await act(async () => {
      findButton("Skip Next Match")?.click();
    });

    expect(onRequestSkipNext).toHaveBeenCalledWith("player-1", "Player One");
    expect(onToggleSkipNext).not.toHaveBeenCalled();

    await renderPortal({
      player: createPlayer({
        skipNextMatchAt: "2026-07-08T10:00:00.000Z",
      }),
      onRequestSkipNext,
      onToggleSkipNext,
    });

    await act(async () => {
      findButton("Cancel Skip Next")?.click();
    });

    expect(onToggleSkipNext).toHaveBeenCalledWith("player-1", true);
  });
});
